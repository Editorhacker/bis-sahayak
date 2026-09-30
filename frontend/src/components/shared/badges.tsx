import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, Circle, Slash, AlertTriangle, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { RoadmapStep } from '../../types';

type StepStatus = RoadmapStep['status'];
type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_EVIDENCE';

const statusConfig: Record<StepStatus, { icon: typeof Circle; className: string }> = {
  NOT_STARTED: { icon: Circle, className: 'bg-muted text-muted-foreground border-border' },
  IN_PROGRESS: { icon: Clock, className: 'bg-blue-50 text-blue-700 border-blue-200' },
  COMPLETED: { icon: CheckCircle2, className: 'bg-green-50 text-green-700 border-green-200' },
  NOT_APPLICABLE: { icon: Slash, className: 'bg-slate-100 text-slate-600 border-slate-200' },
  NEEDS_VERIFICATION: { icon: AlertTriangle, className: 'bg-amber-50 text-amber-700 border-amber-200' },
};

export function StatusPill({ status, className }: { status: StepStatus; className?: string }) {
  const { t } = useTranslation();
  const cfg = statusConfig[status] ?? statusConfig.NOT_STARTED;
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        cfg.className,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {t(`roadmap.status.${status}`)}
    </span>
  );
}

const confidenceConfig: Record<ConfidenceLevel, { icon: typeof Info; className: string }> = {
  HIGH: { icon: TrendingUp, className: 'bg-green-50 text-green-700 border-green-200' },
  MEDIUM: { icon: Minus, className: 'bg-blue-50 text-blue-700 border-blue-200' },
  LOW: { icon: TrendingDown, className: 'bg-amber-50 text-amber-700 border-amber-200' },
  INSUFFICIENT_EVIDENCE: { icon: Info, className: 'bg-muted text-muted-foreground border-border' },
};

export function ConfidenceBadge({ level, className }: { level: ConfidenceLevel; className?: string }) {
  const { t } = useTranslation();
  const cfg = confidenceConfig[level] ?? confidenceConfig.INSUFFICIENT_EVIDENCE;
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        cfg.className,
        className
      )}
      title={t(`statuses.${level}`)}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {t(`statuses.${level}`)}
    </span>
  );
}
