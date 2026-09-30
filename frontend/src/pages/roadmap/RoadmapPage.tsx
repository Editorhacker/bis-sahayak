import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RefreshCw, List, Workflow, ArrowLeft } from 'lucide-react';
import { useRoadmapStore, useProfileStore } from '../../stores';
import { roadmapApi } from '../../services/api';
import type { Roadmap, RoadmapStep } from '../../types';
import { StepCard, StepDrawer, RoadmapLoading, RoadmapEmpty, RoadmapError, isLocked, blockingStepLabel } from '../../components/roadmap/StepCard';
import { Button } from '../../components/ui/button';
import { DisclaimerBanner } from '../../components/shared/verified';
import { toast } from '../../components/ui/toast';
import { cn, formatDate } from '../../lib/utils';

type ViewMode = 'list' | 'flow';

export function RoadmapPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { businessId } = useParams<{ businessId: string }>();

  const roadmap = useRoadmapStore((s) => s.currentRoadmap);
  const setCurrentRoadmap = useRoadmapStore((s) => s.setCurrentRoadmap);
  const openStep = useRoadmapStore((s) => s.openStepDrawer);
  const setOpenStep = useRoadmapStore((s) => s.setOpenStepDrawer);
  const updateStepStatus = useRoadmapStore((s) => s.updateStepStatus);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [view, setView] = useState<ViewMode>('list');
  const [regenerating, setRegenerating] = useState(false);

  const load = async () => {
    if (!businessId) {
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const res = await roadmapApi.get(businessId);
      if (res.success && res.data) setCurrentRoadmap(res.data as Roadmap);
      else if (res.error?.code === 'NOT_FOUND') setCurrentRoadmap(null);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const allSteps = useMemo(
    () => roadmap?.phases.flatMap((p) => p.steps) ?? [],
    [roadmap]
  );

  const completed = allSteps.filter((s) => s.status === 'COMPLETED').length;
  const total = allSteps.length;
  const progressPct = total ? Math.round((completed / total) * 100) : 0;

  const handleStatusChange = async (step: RoadmapStep, status: RoadmapStep['status']) => {
    if (!roadmap) return;
    const locked = isLocked(step, allSteps);
    if (locked) {
      const label = blockingStepLabel(step, allSteps, t);
      toast.show(label ?? t('errors.STEP_LOCKED'), 'error');
      return;
    }
    const prev = step.status;
    updateStepStatus(step.id, status);
    setOpenStep(openStep?.id === step.id ? { ...step, status } : openStep);
    try {
      const res = await roadmapApi.updateStep(roadmap.id, step.id, status);
      if (!res.success) throw new Error();
    } catch {
      updateStepStatus(step.id, prev);
      toast.show(t('errors.NETWORK_ERROR'), 'error');
    }
  };

  const regenerate = async () => {
    if (!businessId) return;
    setRegenerating(true);
    try {
      const res = await roadmapApi.generate(businessId);
      if (res.success && res.data) {
        setCurrentRoadmap(res.data as Roadmap);
        toast.show(t('roadmap.regenerate'), 'success');
      } else {
        toast.show(res.error?.message ?? t('errors.INTERNAL_ERROR'), 'error');
      }
    } catch {
      toast.show(t('errors.NETWORK_ERROR'), 'error');
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <RoadmapLoading />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <RoadmapError onRetry={load} />
      </div>
    );
  }

  if (!roadmap || !roadmap.phases?.length) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <RoadmapEmpty onGoProfile={() => navigate(businessId ? `/business/${businessId}` : '/chat')} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/roadmap"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t('common.back')}
          </Link>
          <h1 className="text-xl font-bold">{t('roadmap.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('roadmap.progress', { completed, total })}
            {roadmap.generatedAt && (
              <> · {t('roadmap.lastGenerated', { date: formatDate(roadmap.generatedAt, i18n.language) })}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border p-0.5" role="group" aria-label={t('roadmap.listView')}>
            <button
              type="button"
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              className={cn('flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium min-h-[32px]', view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              {t('roadmap.listView')}
            </button>
            <button
              type="button"
              onClick={() => setView('flow')}
              aria-pressed={view === 'flow'}
              className={cn('flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium min-h-[32px]', view === 'flow' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
            >
              <Workflow className="h-3.5 w-3.5" aria-hidden="true" />
              {t('roadmap.flowView')}
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={regenerate} disabled={regenerating} className="min-h-[36px]">
            <RefreshCw className={cn('h-4 w-4', regenerating && 'animate-spin')} aria-hidden="true" />
            {t('roadmap.regenerate')}
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('roadmap.progress', { completed, total })}
          className="h-3 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {completed}/{total} · {progressPct}%
          </span>
        </div>
      </div>

      <DisclaimerBanner />

      {view === 'list' ? (
        <div className="space-y-6">
          {roadmap.phases.map((phase) => (
            <section key={phase.name} aria-label={phase.name}>
              <div className="mb-2.5 flex items-center gap-2.5">
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{phase.name}</h2>
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
                <span className="text-xs text-muted-foreground">
                  {phase.steps.filter((s) => s.status === 'COMPLETED').length}/{phase.steps.length}
                </span>
              </div>
              <div className="grid gap-2.5">
                {phase.steps.map((step) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    locked={isLocked(step, allSteps)}
                    lockLabel={blockingStepLabel(step, allSteps, t)}
                    onSelect={setOpenStep}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <FlowView steps={allSteps} onSelect={setOpenStep} />
      )}

      {openStep && (
        <StepDrawer
          step={allSteps.find((s) => s.id === openStep.id) ?? openStep}
          onClose={() => setOpenStep(null)}
          onStatusChange={handleStatusChange}
          onTrackApplication={() => {
            setOpenStep(null);
            navigate('/applications');
          }}
        />
      )}
    </div>
  );
}

function FlowView({ steps, onSelect }: { steps: RoadmapStep[]; onSelect: (s: RoadmapStep) => void }) {
  const { t } = useTranslation();
  const byId = new Map(steps.map((s) => [s.id, s]));

  return (
    <div className="space-y-4" aria-label={t('roadmap.flowView')}>
      {steps.map((step, i) => {
        const blockers = (step.dependsOn ?? []).map((id) => byId.get(id)).filter(Boolean) as RoadmapStep[];
        const locked = isLocked(step, steps);
        return (
          <div key={step.id} className="relative pl-6">
            {i < steps.length - 1 && (
              <span className="absolute left-2.5 top-8 bottom-[-16px] w-0.5 bg-border" aria-hidden="true" />
            )}
            <span
              className={cn(
                'absolute left-0 top-4 h-5 w-5 rounded-full border-2 bg-background',
                step.status === 'COMPLETED' ? 'border-green-500' : locked ? 'border-muted-foreground/40' : 'border-primary'
              )}
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => onSelect(step)}
              className={cn(
                'w-full rounded-lg border bg-card p-3.5 text-left transition-colors hover:border-primary/50',
                locked && 'opacity-70'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{step.title}</span>
                <span className="text-xs text-muted-foreground">{step.order}</span>
              </div>
              {blockers.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  ← {blockers.map((b) => b.title).join(', ')}
                </p>
              )}
              <span className="mt-2 inline-flex text-xs text-muted-foreground">
                {locked ? t('roadmap.locked', { order: blockers[0]?.order ?? '?' }) : t(`roadmap.status.${step.status}`)}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function RoadmapIndexRedirect() {
  const navigate = useNavigate();
  const business = useProfileStore((s) => s.currentBusiness);
  useEffect(() => {
    if (business?.id) navigate(`/business/${business.id}/roadmap`, { replace: true });
  }, [business, navigate]);
  return <RoadmapEmpty onGoProfile={() => navigate('/chat')} />;
}
