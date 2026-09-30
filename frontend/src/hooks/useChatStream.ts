import { useCallback, useRef } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useChatStore, useProfileStore, useRoadmapStore } from '../stores';
import { ensureAccessToken, getAccessToken, refreshAccessToken } from '../services/api';
import type { ChatMessage, Citation, ProfileQuestion } from '../types';
import { normalizeProfileData } from '../components/chat/ProfileCard';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export interface StreamCallbacks {
  onMeta?: (data: { conversationId: string; messageId: string; intent?: string; detectedLanguage?: string }) => void;
  onProfile?: (data: { profile: Record<string, unknown>; questions: ProfileQuestion[] }) => void;
  onCitations?: (citations: Citation[]) => void;
  onRoadmap?: (data: { roadmapId: string; summary?: Array<{ name: string; count: number }> }) => void;
  onDone?: (data: {
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_EVIDENCE';
    disclaimer?: string;
    suggestedActions?: string[];
    verifiedOn?: string;
  }) => void;
  onError?: (error: { code: string; message: string }) => void;
}

function makeAssistantId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function useChatStream() {
  const ctrlRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (message: string, language: string, mode: 'general' | 'consumer') => {
    const store = useChatStore.getState();
    const convId = store.currentConversationId;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      conversationId: convId ?? 'local',
      role: 'user',
      content: message,
      messageType: 'text',
      createdAt: new Date().toISOString(),
    };
    store.addMessage(userMsg);

    const assistantId = makeAssistantId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      conversationId: convId ?? 'local',
      role: 'assistant',
      content: '',
      messageType: 'text',
      createdAt: new Date().toISOString(),
    };
    store.addMessage(assistantMsg);
    store.setIsStreaming(true);
    store.setStreamingMessageId(assistantId);
    store.clearStreamingContent();

    const profile = useProfileStore.getState();
    const roadmap = useRoadmapStore.getState();

    const cbs: StreamCallbacks = {};
    let gotAnything = false;

    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    const streamOnce = async (token: string | null) => {
      await fetchEventSource(`${API_BASE_URL}/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ conversationId: convId, message, language, mode }),
        signal: ctrl.signal,
        credentials: 'include',
        openWhenHidden: true,
        async onopen(res) {
          if (res.status === 401) {
            useChatStore.getState().updateMessage(assistantId, {
              messageType: 'error',
              content: 'UNAUTHORIZED',
            });
            throw new Error('unauthorized');
          }
          if (!res.ok) {
            let message = `HTTP ${res.status}`;
            try {
              const body = (await res.json()) as { error?: { message?: string }; message?: string };
              message = body?.error?.message || body?.message || message;
            } catch {
              // keep the default message
            }
            useChatStore.getState().updateMessage(assistantId, {
              messageType: 'error',
              content: message,
            });
            throw new Error(`HTTP ${res.status}`);
          }
          const contentType = res.headers.get('content-type') ?? '';
          if (!contentType.startsWith('text/event-stream')) {
            useChatStore.getState().updateMessage(assistantId, {
              messageType: 'error',
              content: 'INVALID_STREAM_RESPONSE',
            });
            throw new Error('invalid-content-type');
          }
        },
        onmessage(ev) {
          if (!ev.data) return;
          let payload: unknown;
          try {
            payload = JSON.parse(ev.data);
          } catch {
            return;
          }
          const data = payload as Record<string, unknown>;
          const event = (ev.event || (data.type as string) || 'token') as string;
          gotAnything = true;

          switch (event) {
            case 'meta': {
              if (data.conversationId) {
                const convId = String(data.conversationId);
                const s = useChatStore.getState();
                s.setCurrentConversationId(convId);
                s.setMessages(
                  s.messages.map((m) => (m.conversationId === 'local' ? { ...m, conversationId: convId } : m))
                );
              }
              cbs.onMeta?.(data as never);
              break;
            }
            case 'profile': {
              const rawProf = (data.profile ?? data) as Record<string, unknown>;
              const prof = normalizeProfileData(rawProf);
              const questions = ((data.questions ?? []) as Array<ProfileQuestion & { text?: string }>).map((q) => ({
                ...q,
                question: q.question || q.text || '',
              }));
              profile.setCurrentBusiness(prof as never);
              profile.setProfileQuestions(questions);
              useChatStore.getState().updateMessage(assistantId, {
                messageType: 'profile',
                profile: prof,
                profileQuestions: questions,
              });
              cbs.onProfile?.({ profile: prof, questions });
              break;
            }
            case 'token':
            case 'delta': {
              const text = String(data.text ?? data.delta ?? data.content ?? '');
              if (text) {
                useChatStore.getState().appendStreamingContent(text);
                useChatStore.getState().updateMessage(assistantId, {
                  streamingContent: useChatStore.getState().streamingContent,
                });
              }
              break;
            }
            case 'citations': {
              const rawCites = (Array.isArray(data.citations) ? data.citations : Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
              const cites: Citation[] = rawCites.map((c, idx) => ({
                id: String(c.id ?? c.chunkId ?? `c-${idx}`),
                documentTitle: String(c.documentTitle ?? c.title ?? c.standardNumber ?? 'Official Standard'),
                standardNumber: c.standardNumber ? String(c.standardNumber) : undefined,
                section: c.section ? String(c.section) : undefined,
                clause: c.clause ? String(c.clause) : undefined,
                page: typeof c.page === 'number' ? c.page : undefined,
                excerpt: String(c.excerpt ?? c.content ?? ''),
                sourceUrl: c.sourceUrl ? String(c.sourceUrl) : undefined,
                version: c.version ? String(c.version) : undefined,
                verifiedOn: String(c.verifiedOn ?? c.lastVerifiedAt ?? new Date().toISOString().slice(0, 10)),
                authority: c.authority ? String(c.authority) : undefined,
                chunkId: typeof c.chunkId === 'number' ? c.chunkId : undefined,
              }));
              useChatStore.getState().updateMessage(assistantId, { citations: cites });
              cbs.onCitations?.(cites);
              break;
            }
            case 'roadmap': {
              const rm = {
                id: String(data.roadmapId ?? ''),
                phases: (data.summary ?? []) as Array<{ name: string; count: number }>,
              };
              useChatStore.getState().updateMessage(assistantId, { messageType: 'roadmap', roadmap: rm });
              cbs.onRoadmap?.(data as never);
              break;
            }
            case 'replace': {
              const newText = String(data.text ?? data.content ?? '');
              useChatStore.getState().updateMessage(assistantId, {
                content: newText,
                streamingContent: newText,
                messageType: data.insufficient ? 'insufficient_evidence' : 'text',
              });
              break;
            }
            case 'insufficient_evidence': {
              useChatStore.getState().updateMessage(assistantId, {
                messageType: 'insufficient_evidence',
                content: String(data.text ?? data.message ?? ''),
              });
              break;
            }
            case 'done': {
              useChatStore.getState().updateMessage(assistantId, {
                content: useChatStore.getState().streamingContent || String(data.text ?? ''),
                confidence: (data.confidence as never) ?? undefined,
                verifiedOn: (data.verifiedOn as string) ?? undefined,
                suggestedActions: (data.suggestedActions as string[]) ?? [],
                messageType:
                  data.insufficient ? 'insufficient_evidence'
                  : data.confidence === 'INSUFFICIENT_EVIDENCE' ? 'insufficient_evidence'
                  : 'text',
              });
              if (data.roadmapId) {
                roadmap.setCurrentRoadmap({ id: String(data.roadmapId) } as never);
              }
              cbs.onDone?.(data as never);
              break;
            }
            case 'error': {
              useChatStore.getState().updateMessage(assistantId, {
                messageType: 'error',
                content: String(data.code ?? data.message ?? 'INTERNAL_ERROR'),
              });
              cbs.onError?.({ code: String(data.code ?? 'INTERNAL_ERROR'), message: String(data.message ?? '') });
              break;
            }
            default: {
              if (typeof data.text === 'string') {
                useChatStore.getState().appendStreamingContent(data.text);
                useChatStore.getState().updateMessage(assistantId, {
                  streamingContent: useChatStore.getState().streamingContent,
                });
              }
            }
          }
        },
        onclose() {
          const s = useChatStore.getState();
          const current = s.messages.find((m) => m.id === assistantId);
          const keepErrorContent = current?.messageType === 'error' && current.content;
          s.updateMessage(assistantId, {
            content: keepErrorContent || s.streamingContent || current?.content || '',
            isStreaming: false,
          });
          s.setIsStreaming(false);
          s.setStreamingMessageId(null);
        },
        onerror(err) {
          const s = useChatStore.getState();
          if (!gotAnything && s.streamingContent) {
            s.updateMessage(assistantId, {
              content: s.streamingContent,
              messageType: 'error',
              isStreaming: false,
            });
          }
          s.setIsStreaming(false);
          s.setStreamingMessageId(null);
          throw err;
        },
      });
    };

    try {
      let token = getAccessToken() ?? (await ensureAccessToken());
      try {
        await streamOnce(token);
      } catch (err) {
        if (!(err instanceof Error && err.message === 'unauthorized')) throw err;
        const freshToken = await refreshAccessToken();
        if (!freshToken) throw err;
        token = freshToken;
        const s = useChatStore.getState();
        s.updateMessage(assistantId, { messageType: 'text', content: '' });
        s.clearStreamingContent();
        await streamOnce(token);
      }
    } catch {
      const s = useChatStore.getState();
      const current = s.messages.find((m) => m.id === assistantId);
      const keepErrorContent = current?.messageType === 'error' && current.content;
      s.updateMessage(assistantId, {
        content: keepErrorContent || s.streamingContent || current?.content || '',
        messageType: keepErrorContent ? 'error' : s.streamingContent ? 'text' : 'error',
        isStreaming: false,
      });
      s.setIsStreaming(false);
      s.setStreamingMessageId(null);
    }
  }, []);

  const stop = useCallback(() => {
    ctrlRef.current?.abort();
  }, []);

  return { sendMessage, stop };
}
