import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { ThumbsUp, ThumbsDown, Copy, Check, FileSearch, ExternalLink, Flag, Map } from 'lucide-react';
import { useState } from 'react';
import type { ChatMessage as ChatMessageType, Citation } from '../../types';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { ConfidenceBadge } from '../shared/badges';
import { VerifiedOn } from '../shared/verified';
import { CitationChip } from './CitationChip';
import { ProfileCard } from './ProfileCard';
import { useProfileStore } from '../../stores';
import { cn } from '../../lib/utils';

export function StreamingText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {text}
      <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-primary align-text-bottom" aria-hidden="true" />
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="iconSm"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label={copied ? t('chat.copied') : t('chat.copyMessage')}
      className="h-8 w-8 min-h-[32px] text-muted-foreground"
    >
      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function FeedbackButtons({ onFeedback }: { onFeedback?: (rating: 'up' | 'down', reason?: string) => void }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<'up' | 'down' | null>(null);
  const [showReasons, setShowReasons] = useState(false);
  const [given, setGiven] = useState(false);

  if (given) {
    return <p className="text-xs text-muted-foreground">{t('chat.thanksFeedback')}</p>;
  }

  if (showReasons && selected === 'down') {
    return (
      <div className="flex flex-wrap items-center gap-1.5 animate-in">
        <span className="text-xs text-muted-foreground">{t('chat.feedbackReason')}:</span>
        {(['inaccurate', 'noSource', 'confusing', 'other'] as const).map((r) => (
          <Button
            key={r}
            variant="outline"
            size="sm"
            className="h-7 min-h-[28px] px-2 text-xs"
            onClick={() => {
              onFeedback?.('down', r);
              setShowReasons(false);
              setGiven(true);
            }}
          >
            {t(`chat.feedbackReasons.${r}`)}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="iconSm"
        className={cn('h-8 w-8 min-h-[32px]', selected === 'up' && 'text-green-600')}
        onClick={() => {
          setSelected('up');
          setGiven(true);
          onFeedback?.('up');
        }}
        aria-label={t('chat.thumbsUp')}
      >
        <ThumbsUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        className={cn('h-8 w-8 min-h-[32px]', selected === 'down' && 'text-destructive')}
        onClick={() => {
          setSelected('down');
          setShowReasons(true);
        }}
        aria-label={t('chat.thumbsDown')}
      >
        <ThumbsDown className="h-4 w-4" />
      </Button>
      <CopyButton text={''} />
    </div>
  );
}

export function InsufficientEvidenceCard({ onReport }: { onReport?: () => void }) {
  const { t } = useTranslation();
  return (
    <Card className="border-dashed bg-muted/30">
      <div className="p-4 space-y-2.5">
        <div className="flex items-start gap-2.5">
          <FileSearch className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <h4 className="text-sm font-semibold">{t('chat.insufficientTitle')}</h4>
            <p className="mt-1 text-sm text-muted-foreground">{t('chat.insufficientDesc')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <a
            href="https://www.bis.gov.in"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors min-h-[36px]"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {t('chat.officialSource')}
          </a>
          <Button variant="outline" size="sm" onClick={onReport} className="min-h-[36px] text-xs">
            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
            {t('chat.reportSource')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function SuggestedActions({ actions }: { actions: string[] }) {
  const { t } = useTranslation();
  if (!actions.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{t('chat.followUp')}</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((a, idx) => (
          <span
            key={`action-${idx}-${a}`}
            className="inline-flex items-center rounded-lg border bg-card px-3 py-2 text-xs font-medium text-foreground"
          >
            {a}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RoadmapSummaryCard({
  roadmapId,
  phases,
  onOpen,
}: {
  roadmapId?: string;
  phases: Array<{ name: string; count: number }>;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="border-primary/30">
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Map className="h-5 w-5 text-primary" aria-hidden="true" />
          <h4 className="text-sm font-semibold">{t('roadmap.title')}</h4>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {phases.map((p, idx) => (
            <div key={`phase-${p.name || idx}-${idx}`} className="rounded-lg bg-muted/50 px-2.5 py-2 text-center">
              <p className="text-lg font-semibold leading-tight">{p.count}</p>
              <p className="text-[11px] text-muted-foreground truncate">{p.name}</p>
            </div>
          ))}
        </div>
        {onOpen ? (
          <Button onClick={onOpen}>
            <Map className="h-4 w-4" aria-hidden="true" />
            {t('chat.openRoadmap')}
          </Button>
        ) : (
          <Button asChild>
            <Link to={`/business/${roadmapId}/roadmap`}>
              <Map className="h-4 w-4" aria-hidden="true" />
              {t('chat.openRoadmap')}
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}

export interface RenderedMessage extends ChatMessageType {
  isStreaming?: boolean;
  streamingContent?: string;
}

export function ChatMessageItem({
  message,
  onCitationClick,
  onFeedback,
  onConfirmProfile,
  onUpdateProfileField,
  onOpenRoadmap,
  activeCitationId,
}: {
  message: RenderedMessage;
  onCitationClick?: (c: Citation) => void;
  onFeedback?: (rating: 'up' | 'down', reason?: string) => void;
  onConfirmProfile?: () => void;
  onUpdateProfileField?: (field: string, value: string | number) => void;
  onOpenRoadmap?: (roadmapId: string) => void;
  activeCitationId?: string | null;
}) {
  const { t } = useTranslation();

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.messageType === 'insufficient_evidence') {
    return (
      <div className="space-y-3">
        {message.content && (
          <AssistantProse
            text={message.content}
            citations={message.citations}
            onCitationClick={onCitationClick}
            activeCitationId={activeCitationId}
          />
        )}
        <InsufficientEvidenceCard />
      </div>
    );
  }

  if (message.messageType === 'error') {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <div className="flex items-start gap-2.5 p-4">
          <Flag className="mt-0.5 h-4.5 w-4.5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-medium text-destructive">{message.content}</p>
          </div>
        </div>
      </Card>
    );
  }

  const content = message.isStreaming ? (message.streamingContent ?? '') : message.content;

  return (
    <div className="space-y-3" role="article" aria-live={message.isStreaming ? 'polite' : undefined}>
      {content && (
        <AssistantProse
          text={content}
          streaming={message.isStreaming}
          citations={message.citations}
          onCitationClick={onCitationClick}
          activeCitationId={activeCitationId}
        />
      )}

      {message.isStreaming && !content && (
        <p className="text-sm text-muted-foreground animate-pulse">{t('chat.streaming')}</p>
      )}

      {message.profile && !message.isStreaming && (
        <ProfileCardWrapper message={message} onConfirm={onConfirmProfile} onUpdateField={onUpdateProfileField} />
      )}

      {message.roadmap && !message.isStreaming && (
        <RoadmapSummaryCard
          roadmapId={message.roadmap.id}
          phases={message.roadmap.phases}
          onOpen={message.roadmap.id ? () => onOpenRoadmap?.(message.roadmap!.id) : undefined}
        />
      )}

      {!message.isStreaming && message.citations && message.citations.length > 0 && (
        <div className="flex flex-wrap gap-2" role="list" aria-label={t('chat.sources')}>
          {message.citations.map((c, i) => {
            const cId = c.id || String(c.chunkId || i);
            const isMatch = Boolean(activeCitationId && (activeCitationId === c.id || activeCitationId === String(c.chunkId)));
            return (
              <CitationChip
                key={`cit-${cId}-${i}`}
                index={i}
                citation={c}
                isActive={isMatch}
                onClick={() => onCitationClick?.(c)}
              />
            );
          })}
        </div>
      )}

      {!message.isStreaming && (message.confidence || message.verifiedOn) && (
        <div className="flex flex-wrap items-center gap-2">
          {message.confidence && <ConfidenceBadge level={message.confidence} />}
          {message.verifiedOn && <VerifiedOn date={message.verifiedOn} />}
        </div>
      )}

      {!message.isStreaming && message.suggestedActions && message.suggestedActions.length > 0 && (
        <SuggestedActions actions={message.suggestedActions} />
      )}

      {!message.isStreaming && (
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <FeedbackButtons onFeedback={onFeedback} />
        </div>
      )}
    </div>
  );
}

function AssistantProse({
  text,
  streaming,
  citations,
  onCitationClick,
  activeCitationId,
}: {
  text: string;
  streaming?: boolean;
  citations?: Citation[];
  onCitationClick?: (c: Citation) => void;
  activeCitationId?: string | null;
}) {
  const segments = text.split(/(\[\d+\])/g);

  return (
    <div className="prose prose-sm max-w-none rounded-2xl rounded-tl-sm bg-muted/40 px-4 py-3 text-sm leading-relaxed break-words">
      {segments.map((segment, i) => {
        const match = segment.match(/^\[(\d+)\]$/);
        if (match) {
          const n = Number(match[1]);
          const citation = citations?.[n - 1];
          const isMatch = Boolean(
            citation && activeCitationId && (activeCitationId === citation.id || activeCitationId === String(citation.chunkId))
          );
          return (
            <button
              key={i}
              type="button"
              onClick={() => citation && onCitationClick?.(citation)}
              disabled={!citation}
              className={cn(
                'mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 align-super text-[10px] font-bold transition-colors',
                citation
                  ? isMatch
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-primary/15 text-primary hover:bg-primary/30'
                  : 'bg-muted text-muted-foreground cursor-default'
              )}
              aria-label={citation ? `${citation.documentTitle}` : `citation ${n}`}
              aria-describedby={citation ? undefined : 'citation-missing'}
            >
              {n}
            </button>
          );
        }
        if (!segment) return null;
        return (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSanitize]}
            components={{
              a: ({ node: _node, ...props }) => (
                <a {...props} target="_blank" rel="noopener noreferrer" />
              ),
              p: ({ node: _node, children }) => <span className="block last:mb-0">{children}</span>,
            }}
          >
            {segment}
          </ReactMarkdown>
        );
      })}
      {streaming && (
        <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-primary align-text-bottom" aria-hidden="true" />
      )}
    </div>
  );
}

function ProfileCardWrapper({
  message,
  onConfirm,
  onUpdateField,
}: {
  message: RenderedMessage;
  onConfirm?: () => void;
  onUpdateField?: (field: string, value: string | number) => void;
}) {
  const currentBusiness = useProfileStore((s) => s.currentBusiness);
  const prof = {
    ...((message.profile as Record<string, unknown>) ?? {}),
    ...((currentBusiness as unknown as Record<string, unknown>) ?? {}),
  };

  return (
    <ProfileCard
      profile={prof as Record<string, never>}
      questions={message.profileQuestions}
      onConfirm={onConfirm}
      onUpdateField={onUpdateField as never}
    />
  );
}
