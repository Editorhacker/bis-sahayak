import { useTranslation } from 'react-i18next';
import { CalendarCheck, AlertTriangle, ShieldAlert, RefreshCw } from 'lucide-react';
import { cn, formatDate, isStale } from '../../lib/utils';

export function VerifiedOn({ date, locale = 'en', className }: { date: string; locale?: string; className?: string }) {
  const { t } = useTranslation();
  const stale = isStale(date);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        stale ? 'text-amber-700' : 'text-muted-foreground',
        className
      )}
    >
      {stale ? (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <CalendarCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      {stale
        ? t('common.staleVerified', { date: formatDate(date, locale) })
        : t('common.verifiedOn', { date: formatDate(date, locale) })}
    </span>
  );
}

export function DisclaimerBanner({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900',
        className
      )}
    >
      <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
      <p>{t('chat.disclaimer')}</p>
    </div>
  );
}

export function NeedsVerificationBanner({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900',
        className
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
      <p>{t('roadmap.needsVerificationBanner')}</p>
    </div>
  );
}

export function OfflineBanner() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm text-destructive-foreground">
      <RefreshCw className="h-4 w-4" aria-hidden="true" />
      {t('common.offline')}
    </div>
  );
}
