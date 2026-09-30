import { useTranslation } from 'react-i18next';
import { Quote, FileText } from 'lucide-react';
import type { Citation } from '../../types';
import { cn } from '../../lib/utils';

export function CitationChip({
  index,
  citation,
  isActive,
  onClick,
  className,
}: {
  index: number;
  citation: Citation;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const label = citation.standardNumber
    ? `${citation.standardNumber}${citation.clause ? ` · cl. ${citation.clause}` : ''}`
    : citation.authority || citation.documentTitle;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors min-h-[36px] text-left',
        isActive
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-muted/50 hover:bg-muted text-foreground',
        className
      )}
      title={citation.documentTitle}
      aria-label={`${t('chat.sources')}: ${label}`}
    >
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
        aria-hidden="true"
      >
        {index + 1}
      </span>
      {citation.standardNumber ? (
        <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Quote className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}
