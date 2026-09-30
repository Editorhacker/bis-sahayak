import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Lock,
  ChevronRight,
  ExternalLink,
  CircleHelp,
  ListChecks,
  Receipt,
  FileText,
  ClipboardCopy,
  Navigation,
  CheckCircle2,
  PlayCircle,
  Ban,
  CalendarCheck,
} from 'lucide-react';
import type { RoadmapStep, WhyResponse, Application } from '../../types';
import { roadmapApi } from '../../services/api';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { StatusPill, ConfidenceBadge } from '../shared/badges';
import { NeedsVerificationBanner, VerifiedOn } from '../shared/verified';
import { EmptyState, ErrorState, Skeleton } from '../shared/states';
import { SourcePanel } from '../chat/SourcePanel';
import { useUIStore } from '../../stores';
import { cn, formatCurrency, formatDate } from '../../lib/utils';

function isLocked(step: RoadmapStep, all: RoadmapStep[]): boolean {
  if (!step.dependsOn?.length) return false;
  return step.dependsOn.some((depId) => {
    const dep = all.find((s) => s.id === depId);
    return dep && dep.status !== 'COMPLETED' && dep.status !== 'NOT_APPLICABLE';
  });
}

type TranslateFn = ReturnType<typeof useTranslation>['t'];

function blockingStepLabel(step: RoadmapStep, all: RoadmapStep[], t: TranslateFn): string | null {
  if (!step.dependsOn?.length) return null;
  const blocker = step.dependsOn
    .map((id) => all.find((s) => s.id === id))
    .find((d) => d && d.status !== 'COMPLETED' && d.status !== 'NOT_APPLICABLE');
  if (!blocker) return null;
  return t('roadmap.locked', { order: blocker.order });
}

export { isLocked, blockingStepLabel };

export function StepCard({
  step,
  locked,
  lockLabel,
  onSelect,
  onStatusChange,
}: {
  step: RoadmapStep;
  locked: boolean;
  lockLabel?: string | null;
  onSelect: (step: RoadmapStep) => void;
  onStatusChange?: (step: RoadmapStep, status: RoadmapStep['status']) => void;
}) {
  const { t } = useTranslation();

  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-shadow hover:shadow-md',
        step.status === 'NEEDS_VERIFICATION' && 'border-amber-300',
        locked && 'opacity-75'
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground"
          aria-hidden="true"
        >
          {step.order}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(step)}
              className="text-left text-sm font-semibold hover:text-primary focus-visible:underline"
            >
              {step.title}
            </button>
            {locked && (
              <span
                className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                title={lockLabel ?? undefined}
              >
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusPill status={step.status} />
            <ConfidenceBadge level={step.confidence.level ?? 'INSUFFICIENT_EVIDENCE'} />
            <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {t(`roadmap.priority.${step.priority}`)}
            </span>
            {step.authority && (
              <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">{step.authority}</span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {step.status !== 'COMPLETED' && (
              <Button
                variant="outline"
                size="sm"
                disabled={locked}
                title={locked ? lockLabel ?? undefined : undefined}
                onClick={() => onStatusChange?.(step, 'IN_PROGRESS')}
                className="min-h-[36px] text-xs"
              >
                <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {t('roadmap.markInProgress')}
              </Button>
            )}
            {step.status !== 'COMPLETED' && step.status !== 'NOT_APPLICABLE' && (
              <Button
                variant="outline"
                size="sm"
                disabled={locked}
                title={locked ? lockLabel ?? undefined : undefined}
                onClick={() => onStatusChange?.(step, 'COMPLETED')}
                className="min-h-[36px] text-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('roadmap.markCompleted')}
              </Button>
            )}
            {step.status !== 'NOT_APPLICABLE' && step.status !== 'COMPLETED' && (
              <Button
                variant="ghost"
                size="sm"
                disabled={locked}
                onClick={() => onStatusChange?.(step, 'NOT_APPLICABLE')}
                className="min-h-[36px] text-xs text-muted-foreground"
              >
                <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                {t('roadmap.markNotApplicable')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => onSelect(step)} className="ml-auto min-h-[36px] text-xs">
              {t('common.open')}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>

          {locked && lockLabel && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              {lockLabel}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function Checklist({ stepId, items }: { stepId: string; items: NonNullable<RoadmapStep['documents']> }) {
  const { t } = useTranslation();
  const key = `checklist:${stepId}`;
  const [state, setState] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '{}');
    } catch {
      return {};
    }
  });

  const toggle = (id: string) => {
    setState((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold">
        <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
        {t('roadmap.documents')}
      </h4>
      {items.map((doc) => {
        const checked = state[doc.id] ?? doc.completed;
        return (
          <label
            key={doc.id}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm hover:bg-muted/50 transition-colors"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(doc.id)}
              className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
            />
            <span className={cn('flex-1', checked && 'text-muted-foreground line-through')}>{doc.name}</span>
            {doc.required && (
              <span className="text-[11px] font-medium text-amber-700">{t('profile.required')}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}

export function StepDrawer({
  step,
  onClose,
  onStatusChange,
  onTrackApplication,
}: {
  step: RoadmapStep;
  onClose: () => void;
  onStatusChange?: (step: RoadmapStep, status: RoadmapStep['status']) => void;
  onTrackApplication?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [why, setWhy] = useState<WhyResponse | null>(null);
  const [whyLoading, setWhyLoading] = useState(false);
  const [whyError, setWhyError] = useState(false);
  const setSelectedCitation = useUIStore((s) => s.setSelectedCitation);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const loadWhy = async () => {
    setWhyLoading(true);
    setWhyError(false);
    try {
      const res = await roadmapApi.getWhy(step.id);
      if (res.success && res.data) setWhy(res.data as WhyResponse);
      else setWhyError(true);
    } catch {
      setWhyError(true);
    } finally {
      setWhyLoading(false);
    }
  };

  const copyPrefill = async () => {
    const text = step.prefillData
      ? Object.entries(step.prefillData)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join('\n')
      : step.title;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={step.title}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative ml-auto flex h-full w-full max-w-lg flex-col bg-background shadow-2xl slide-in-right">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                {t('common.step', { n: step.order })}
              </span>
              <StatusPill status={step.status} />
            </div>
            <h2 className="mt-2 text-lg font-semibold leading-snug">{step.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <ConfidenceBadge level={step.confidence.level ?? 'INSUFFICIENT_EVIDENCE'} />
              {step.authority && <span className="text-xs text-muted-foreground">{step.authority}</span>}
            </div>
          </div>
          <Button variant="ghost" size="iconSm" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-5 p-4">
          {step.status === 'NEEDS_VERIFICATION' && <NeedsVerificationBanner />}

          <section>
            <h3 className="text-sm font-semibold">{t('roadmap.whyTitle')}</h3>
            {step.reason && <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{step.reason}</p>}
            <Button variant="outline" size="sm" className="mt-2.5 min-h-[36px]" onClick={loadWhy} disabled={whyLoading}>
              <CircleHelp className="h-4 w-4" aria-hidden="true" />
              {whyLoading ? t('roadmap.whyLoading') : t('roadmap.whyButton')}
            </Button>

            {whyError && <p className="mt-2 text-xs text-destructive">{t('errors.NETWORK_ERROR')}</p>}

            {why && (
              <div className="mt-3 space-y-2.5 rounded-lg border bg-muted/30 p-3.5 animate-in">
                <p className="text-sm leading-relaxed">{why.reason}</p>
                {why.citations.length > 0 && (
                  <div className="space-y-2">
                    {why.citations.map((c, i) => (
                      <div key={c.id} className="rounded-md border bg-card p-3">
                        <p className="text-xs font-medium">
                          {i + 1}. {c.standardNumber || c.documentTitle}
                        </p>
                        <blockquote className="mt-1.5 border-l-2 border-primary pl-2.5 text-xs text-muted-foreground">
                          {c.excerpt}
                        </blockquote>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <VerifiedOn date={c.verifiedOn} locale={i18n.language} />
                          {c.sourceUrl && (
                            <a
                              href={c.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              {t('chat.officialSource')}
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="flex flex-wrap gap-2">
            {step.applyUrl && (
              <Button size="sm" asChild>
                <a href={step.applyUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  {t('roadmap.apply')}
                </a>
              </Button>
            )}
            {step.statusUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={step.statusUrl} target="_blank" rel="noopener noreferrer">
                  <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                  {t('roadmap.checkStatus')}
                </a>
              </Button>
            )}
          </section>

          {step.documents && step.documents.length > 0 && <Checklist stepId={step.id} items={step.documents} />}

          <section className="rounded-lg border p-3.5 space-y-1.5">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold">
              <Receipt className="h-4 w-4 text-primary" aria-hidden="true" />
              {t('roadmap.fee')}
            </h4>
            {step.fee ? (
              <>
                <p className="text-lg font-semibold">{formatCurrency(step.fee.amount, step.fee.currency)}</p>
                {step.fee.condition && <p className="text-xs text-muted-foreground">{step.fee.condition}</p>}
                <div className="flex flex-col gap-1 pt-1">
                  <span className="text-[11px] text-muted-foreground">{step.fee.source}</span>
                  <VerifiedOn date={step.fee.verifiedOn} locale={i18n.language} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t('roadmap.feeMissing')}</p>
            )}
          </section>

          {step.taxNote && (
            <section className="rounded-lg border border-blue-200 bg-blue-50 p-3.5">
              <h4 className="text-sm font-semibold text-blue-900">{t('roadmap.taxNote')}</h4>
              <p className="mt-1 text-sm text-blue-800">{step.taxNote}</p>
            </section>
          )}

          {step.sources.length > 0 && (
            <section>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
                {t('roadmap.sources')}
              </h4>
              <SourcePanel
                citations={step.sources}
                onSelect={(c) => setSelectedCitation(c)}
                className="rounded-lg border"
              />
            </section>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={copyPrefill} className="min-h-[36px]">
              <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
              {copied ? t('chat.copied') : t('roadmap.prefill')}
            </Button>
            <Button variant="outline" size="sm" onClick={onTrackApplication} className="min-h-[36px]">
              <Navigation className="h-4 w-4" aria-hidden="true" />
              {t('roadmap.trackApplication')}
            </Button>
          </div>
        </div>

        <div className="border-t p-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => onStatusChange?.(step, 'COMPLETED')}
              disabled={step.status === 'COMPLETED'}
              className="flex-1 min-h-[40px]"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {t('roadmap.markCompleted')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStatusChange?.(step, 'IN_PROGRESS')}
              disabled={step.status === 'IN_PROGRESS'}
              className="flex-1 min-h-[40px]"
            >
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
              {t('roadmap.markInProgress')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RoadmapLoading() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

export { RoadmapEmpty, RoadmapError };

function RoadmapEmpty({ onGoProfile }: { onGoProfile: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t('roadmap.empty')}
      description={t('roadmap.emptyDesc')}
      action={<Button onClick={onGoProfile}>{t('roadmap.goToProfile')}</Button>}
    />
  );
}

function RoadmapError({ onRetry }: { onRetry: () => void }) {
  return <ErrorState onRetry={onRetry} />;
}

export function applicationStatusPill(status: Application['status']) {
  const styles: Record<Application['status'], string> = {
    DRAFT: 'bg-muted text-muted-foreground border-border',
    SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
    UNDER_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
    APPROVED: 'bg-green-50 text-green-700 border-green-200',
    REJECTED: 'bg-red-50 text-red-700 border-red-200',
    EXPIRED: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', styles[status])}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}

export function formatDateShort(d: string, locale = 'en') {
  return formatDate(d, locale);
}
