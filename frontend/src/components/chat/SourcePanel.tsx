import { useTranslation } from 'react-i18next';
import { X, ExternalLink, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { Citation } from '../../types';
import { Button } from '../ui/button';
import { VerifiedOn } from '../shared/verified';
import { EmptyState } from '../shared/states';
import { cn } from '../../lib/utils';

function SourceItem({
  citation,
  index,
  defaultOpen,
  onSelect,
}: {
  citation: Citation;
  index: number;
  defaultOpen: boolean;
  onSelect?: (c: Citation) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          onSelect?.(citation);
        }}
        className="flex w-full items-start gap-3 p-3.5 text-left hover:bg-muted/50 transition-colors"
        aria-expanded={open}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground mt-0.5">
          {index + 1}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{citation.standardNumber || citation.documentTitle}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {citation.documentTitle}
            {citation.clause ? ` · ${citation.clause}` : ''}
            {citation.page ? ` · p. ${citation.page}` : ''}
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="border-t px-3.5 py-3.5 space-y-3 animate-in">
          {citation.section && (
            <div className="text-xs">
              <span className="text-muted-foreground">Section: </span>
              <span className="font-medium">{citation.section}</span>
            </div>
          )}
          {citation.clause && (
            <div className="text-xs">
              <span className="text-muted-foreground">Clause: </span>
              <span className="font-medium">{citation.clause}</span>
            </div>
          )}
          {citation.page && (
            <div className="text-xs">
              <span className="text-muted-foreground">Page: </span>
              <span className="font-medium">{citation.page}</span>
            </div>
          )}
          <blockquote className="rounded-r-lg border-l-4 border-primary bg-primary/5 px-3 py-2.5 text-sm leading-relaxed">
            {citation.excerpt}
          </blockquote>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <VerifiedOn date={citation.verifiedOn} />
            {citation.sourceUrl && (
              <a
                href={citation.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {t('chat.officialSource')}
                <span className="sr-only">({t('common.external')})</span>
              </a>
            )}
          </div>
          {citation.authority && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{citation.authority}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SourcePanel({
  citations,
  selectedId,
  onSelect,
  onClose,
  className,
}: {
  citations: Citation[];
  selectedId?: string | null;
  onSelect?: (citation: Citation) => void;
  onClose?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();

  if (!citations.length) {
    return (
      <div className={cn('flex h-full flex-col', className)}>
        <SourcePanelHeader onClose={onClose} />
        <EmptyState title={t('common.noData')} description={t('chat.insufficientDesc')} />
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col', className)} role="complementary" aria-label={t('chat.sources')}>
      <SourcePanelHeader onClose={onClose} count={citations.length} />
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {citations.map((c, i) => (
          <SourceItem
            key={c.id}
            citation={c}
            index={i}
            defaultOpen={selectedId ? c.id === selectedId : i === 0}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function SourcePanelHeader({ onClose, count }: { onClose?: () => void; count?: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between border-b px-4 py-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
        {t('chat.sources')}
        {count !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{count}</span>
        )}
      </h2>
      {onClose && (
        <Button variant="ghost" size="iconSm" onClick={onClose} aria-label={t('common.close')}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
