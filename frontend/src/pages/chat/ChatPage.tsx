import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  SendHorizonal,
  PanelRightOpen,
  PanelRightClose,
  Sparkles,
  MessageSquare,
  Plus,
  ChevronDown,
} from 'lucide-react';
import { useChatStore, useUIStore, useProfileStore } from '../../stores';
import { useChatStream } from '../../hooks/useChatStream';
import { chatApi, businessApi, roadmapApi, feedbackApi } from '../../services/api';
import { ChatMessageItem, type RenderedMessage } from '../../components/chat/ChatMessage';
import { SourcePanel } from '../../components/chat/SourcePanel';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/input';
import { LanguageSwitcher } from '../../components/shared/LanguageSwitcher';
import { VoiceInputButton } from '../../components/shared/VoiceInputButton';
import { EmptyState, SkeletonCard } from '../../components/shared/states';
import { DisclaimerBanner } from '../../components/shared/verified';
import type { Citation, Conversation } from '../../types';
import { cn } from '../../lib/utils';

export function ChatPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId: string }>();
  const { sendMessage, stop } = useChatStream();

  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const draft = useChatStore((s) => s.draftMessage);
  const setDraft = useChatStore((s) => s.setDraftMessage);
  const mode = useChatStore((s) => s.mode);
  const setMode = useChatStore((s) => s.setMode);
  const setMessages = useChatStore((s) => s.setMessages);
  const setCurrentConversationId = useChatStore((s) => s.setCurrentConversationId);
  const currentConversationId = useChatStore((s) => s.currentConversationId);

  const language = useUIStore((s) => s.language);
  const rightPanelOpen = useUIStore((s) => s.rightPanelOpen);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const mobileSourcesOpen = useUIStore((s) => s.mobileSourcesOpen);
  const setMobileSourcesOpen = useUIStore((s) => s.setMobileSourcesOpen);
  const selectedCitation = useUIStore((s) => s.selectedCitation);
  const setSelectedCitation = useUIStore((s) => s.setSelectedCitation);

  const setCurrentBusiness = useProfileStore((s) => s.setCurrentBusiness);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [railOpen, setRailOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (conversationId) setCurrentConversationId(conversationId);
    const draftStored = useChatStore.getState().draftMessage;
    if (!conversationId && draftStored) {
      sendMessage(draftStored, language, mode);
      setDraft('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    chatApi.getConversations().then((r) => {
      if (r.success && r.data?.conversations) setConversations(r.data.conversations);
    }).catch(() => {});
  }, [messages.length]);

  useEffect(() => {
    if (!conversationId) return;
    const existing = useChatStore.getState().messages;
    if (existing.length > 0 && existing[existing.length - 1].conversationId === conversationId) return;
    setLoadingHistory(true);
    chatApi.getConversation(conversationId)
      .then((r) => {
        const stored = r.data?.conversation?.messages;
        if (r.success && stored && stored.length) {
          const mapped: RenderedMessage[] = stored.map((m) => ({
            id: m.id,
            conversationId: m.conversationId ?? conversationId,
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
            messageType: 'text',
            createdAt: m.createdAt,
            intent: m.intent,
          }));
          setMessages(mapped);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isStreaming, streamingContent]);

  useEffect(() => {
    if (currentConversationId && !conversationId) {
      navigate(`/chat/${currentConversationId}`, { replace: true });
    }
  }, [currentConversationId, conversationId, navigate]);

  const submit = async (override?: string) => {
    const text = (override ?? draft).trim();
    if (!text || isStreaming) return;
    setSendError(null);
    setDraft('');
    try {
      await sendMessage(text, language, mode);
    } catch {
      setSendError(t('errors.NETWORK_ERROR'));
    }
  };

  const allCitations: Citation[] = messages.flatMap((m) => (m as RenderedMessage).citations ?? []);

  const handleConfirmProfile = async () => {
    const profile = useProfileStore.getState().currentBusiness;
    if (!profile) return;
    try {
      const source = profile as unknown as Record<string, unknown>;

      // The AI may return product info nested under `product` or flat
      const product = (source.product ?? {}) as Record<string, unknown>;

      // Location can come as {state, city} nested object, flat fields, or "City, State" string
      const rawLocation = source.location;
      const location: Record<string, unknown> =
        rawLocation && typeof rawLocation === 'object' && !Array.isArray(rawLocation)
          ? (rawLocation as Record<string, unknown>)
          : {};

      let state = (location.state ?? source.state ?? '') as string;
      let city  = (location.city  ?? source.city  ?? '') as string;
      if (!city && !state && typeof rawLocation === 'string' && rawLocation !== '[object Object]') {
        const parts = rawLocation.split(',').map((s) => s.trim());
        if (parts.length >= 2) {
          city = parts[0];
          state = parts.slice(1).join(', ');
        } else if (parts.length === 1) {
          city = parts[0];
        }
      }

      // employeeCount may arrive as string "10" or number 10
      const rawCount = source.employeeCount ?? source.workerCount ?? source.workers;
      const employeeCount =
        typeof rawCount === 'number'
          ? rawCount
          : typeof rawCount === 'string' && rawCount.trim() !== ''
          ? parseInt(rawCount, 10)
          : undefined;

      // expectedTurnover similarly
      const rawTurnover = source.expectedTurnover ?? source.annualTurnover ?? source.turnover;
      const expectedTurnover =
        typeof rawTurnover === 'number'
          ? rawTurnover
          : typeof rawTurnover === 'string' && rawTurnover.trim() !== ''
          ? parseFloat(rawTurnover)
          : undefined;

      const pName = (source.productName as string) || (product.name as string) || (source.businessName as string) || 'My business';
      const rawPremises = (source.premisesType as string) ?? undefined;
      const premisesType = rawPremises === 'factory' ? 'factory_unit' : rawPremises === 'commercial' ? 'shop' : rawPremises;

      const payload = {
        businessName: pName,
        businessType: (source.businessType as string) ?? 'manufacturing',
        structure: (source.structure ?? source.businessStructure) as string ?? undefined,
        premisesType,
        state: state || undefined,
        city:  city  || undefined,
        employeeCount: Number.isNaN(employeeCount as number) ? undefined : employeeCount,
        expectedTurnover: Number.isNaN(expectedTurnover as number) ? undefined : expectedTurnover,
      };

      const created = await businessApi.create(payload as never);
      const biz = (created.data as { business?: { id?: string } } | undefined)?.business;
      if (created.success && biz?.id) {
        // Also auto-add product if product details are known
        if (pName) {
          await businessApi.addProduct(biz.id, {
            name: pName,
            material: (source.material as string) || (product.material as string) || undefined,
            description: (source.productDescription as string) || (product.description as string) || undefined,
          }).catch((e) => console.warn('Could not auto-add product:', e));
        }

        const confirmed = await businessApi.confirmProfile(biz.id);
        setCurrentBusiness({ ...profile, id: biz.id, profileConfirmed: true });

        // Update messages in chat store to show confirmed state immediately
        const chatStore = useChatStore.getState();
        chatStore.setMessages(
          chatStore.messages.map((msg) =>
            msg.messageType === 'profile' || msg.profile
              ? { ...msg, profile: { ...((msg.profile as Record<string, unknown>) ?? {}), profileConfirmed: true } }
              : msg
          )
        );

        if (confirmed.success) {
          await sendMessage(`profile_confirmed:${biz.id}`, language, mode);
        } else {
          console.error('confirm-profile failed:', confirmed);
        }
      }
    } catch (err) {
      console.error('handleConfirmProfile error:', err);
    }
  };

  const handleOpenRoadmap = async (roadmapId: string) => {
    const profile = useProfileStore.getState().currentBusiness;
    if (profile?.id) {
      navigate(`/business/${profile.id}/roadmap`);
    } else {
      const res = await roadmapApi.get(roadmapId);
      if (res.success && res.data) {
        const rm = res.data as unknown as { businessId: string };
        navigate(`/business/${rm.businessId}/roadmap`);
      }
    }
  };

  const handleFeedback = (messageId: string, rating: 'up' | 'down', reason?: string) => {
    const convId = useChatStore.getState().currentConversationId;
    if (convId) {
      feedbackApi.submit(convId, messageId, rating, reason).catch(() => {});
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <aside
        className={cn(
          'hidden lg:flex w-64 shrink-0 flex-col border-r bg-muted/20',
          railOpen && 'lg:flex'
        )}
        aria-label={t('chat.conversations')}
      >
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('chat.conversations')}
          </h2>
          <Button variant="ghost" size="iconSm" onClick={() => { useChatStore.getState().resetChat(); navigate('/chat'); }} aria-label={t('chat.newChat')}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-xs text-muted-foreground">{t('chat.emptyDesc')}</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate(`/chat/${c.id}`)}
              className={cn(
                'w-full truncate rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                c.id === conversationId ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {c.title}
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-2 sm:px-4">
          <Button
            variant="ghost"
            size="iconSm"
            className="lg:hidden"
            onClick={() => setRailOpen(!railOpen)}
            aria-label={t('nav.menu')}
          >
            <MessageSquare className="h-4.5 w-4.5" />
          </Button>
          <span className="flex items-center gap-1.5 text-sm font-semibold truncate">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            {t('app.name')}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <LanguageSwitcher compact />
            </div>
            <div className="flex items-center rounded-lg border p-0.5" role="group" aria-label={t('chat.mode')}>
              {(['general', 'consumer'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium min-h-[32px]',
                    mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {m === 'general' ? t('chat.modeGeneral') : t('chat.modeConsumer')}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="iconSm"
              onClick={toggleRightPanel}
              className="hidden xl:flex"
              aria-label={rightPanelOpen ? t('common.close') : t('chat.sources')}
            >
              {rightPanelOpen ? <PanelRightClose className="h-4.5 w-4.5" /> : <PanelRightOpen className="h-4.5 w-4.5" />}
            </Button>
          </div>
        </div>

        {railOpen && (
          <div className="lg:hidden border-b bg-muted/40 max-h-56 overflow-y-auto p-2 space-y-1" role="navigation">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-semibold text-muted-foreground">{t('chat.conversations')}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => { useChatStore.getState().resetChat(); navigate('/chat'); setRailOpen(false); }}>
                  <Plus className="h-3.5 w-3.5" /> {t('chat.newChat')}
                </Button>
                <Button variant="ghost" size="iconSm" onClick={() => setRailOpen(false)} aria-label={t('common.close')}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { navigate(`/chat/${c.id}`); setRailOpen(false); }}
                className={cn(
                  'w-full truncate rounded-lg px-3 py-2.5 text-left text-sm',
                  c.id === conversationId ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {c.title}
              </button>
            ))}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-5 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-6">
            {loadingHistory && (
              <div className="space-y-4">
                <SkeletonCard lines={2} />
                <SkeletonCard lines={3} />
              </div>
            )}

            {!loadingHistory && messages.length === 0 && (
              <EmptyState
                icon={<Sparkles className="h-7 w-7 text-primary" aria-hidden="true" />}
                title={t('chat.emptyTitle')}
                description={t('chat.emptyDesc')}
                action={
                  <DisclaimerBanner className="max-w-md text-left" />
                }
              />
            )}

            {messages.map((m) => (
              <ChatMessageItem
                key={m.id}
                message={m as RenderedMessage}
                activeCitationId={selectedCitation?.id ?? null}
                onCitationClick={(c) => {
                  setSelectedCitation(c);
                  setMobileSourcesOpen(true);
                }}
                onFeedback={(rating, reason) => handleFeedback(m.id, rating, reason)}
                onConfirmProfile={handleConfirmProfile}
                onUpdateProfileField={(field, value) => {
                  const p = useProfileStore.getState().currentBusiness;
                  const updated = { ...(p ?? {}), [field]: value };
                  useProfileStore.setState({ currentBusiness: updated as never });

                  const chatStore = useChatStore.getState();
                  chatStore.setMessages(
                    chatStore.messages.map((msg) =>
                      msg.messageType === 'profile' || msg.profile
                        ? { ...msg, profile: { ...((msg.profile as Record<string, unknown>) ?? {}), [field]: value } }
                        : msg
                    )
                  );
                }}
                onOpenRoadmap={handleOpenRoadmap}
              />
            ))}

            {sendError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
                <span>{sendError}</span>
                <Button variant="outline" size="sm" onClick={() => { setSendError(null); submit(); }}>
                  {t('common.retry')}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="border-t bg-background/95 backdrop-blur p-3 sm:p-4">
          <div className="mx-auto max-w-3xl">
            <DisclaimerBanner className="mb-2.5" />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="relative rounded-2xl border bg-card p-2 focus-within:ring-2 focus-within:ring-ring"
            >
              <label htmlFor="chat-input" className="sr-only">
                {t('chat.placeholder')}
              </label>
              <Textarea
                id="chat-input"
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={t('chat.placeholder')}
                rows={2}
                className="min-h-[52px] max-h-40 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                disabled={isStreaming}
              />
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-1">
                  <VoiceInputButton
                    onTranscript={(text) => setDraft((useChatStore.getState().draftMessage + ' ' + text).trim())}
                  />
                  <div className="sm:hidden">
                    <LanguageSwitcher compact />
                  </div>
                </div>
                {isStreaming ? (
                  <Button type="button" variant="outline" size="sm" onClick={stop}>
                    {t('common.cancel')}
                  </Button>
                ) : (
                  <Button type="submit" size="sm" disabled={!draft.trim()} aria-label={t('chat.send')}>
                    <SendHorizonal className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{t('chat.send')}</span>
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      </section>

      <aside
        className={cn(
          'hidden xl:flex w-96 shrink-0 flex-col border-l bg-card/50',
          !rightPanelOpen && 'hidden'
        )}
        aria-label={t('chat.sources')}
      >
        <SourcePanel
          citations={allCitations}
          selectedId={selectedCitation?.id ?? null}
          onClose={toggleRightPanel}
        />
      </aside>

      {mobileSourcesOpen && allCitations.length > 0 && (
        <div className="fixed inset-0 z-50 xl:hidden" role="dialog" aria-modal="true" aria-label={t('chat.sources')}>
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileSourcesOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl bg-background shadow-2xl animate-slide-up flex flex-col">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />
            <div className="min-h-0 flex-1">
              <SourcePanel
                citations={allCitations}
                selectedId={selectedCitation?.id ?? null}
                onClose={() => setMobileSourcesOpen(false)}
                className="max-h-[85vh]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
