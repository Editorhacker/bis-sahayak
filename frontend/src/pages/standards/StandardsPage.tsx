import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Sparkles, FileSearch, ExternalLink, ArrowLeft, GitCompare } from 'lucide-react';
import { standardApi } from '../../services/api';
import type { Standard } from '../../types';
import { Button } from '../../components/ui/button';
import { Input, Textarea } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { ConfidenceBadge } from '../../components/shared/badges';
import { VerifiedOn } from '../../components/shared/verified';
import { EmptyState, ErrorState, SkeletonCard } from '../../components/shared/states';
import { useUIStore } from '../../stores';
import { cn } from '../../lib/utils';

function StatusPill({ status }: { status: Standard['status'] }) {
  const { t } = useTranslation();
  const styles = {
    current: 'bg-green-50 text-green-700 border-green-200',
    withdrawn: 'bg-red-50 text-red-700 border-red-200',
    draft: 'bg-amber-50 text-amber-700 border-amber-200',
  } as const;
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', styles[status])}>
      {t(`standards.status.${status}`)}
    </span>
  );
}

export function StandardsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const language = useUIStore((s) => s.language);
  const [mode, setMode] = useState<'search' | 'recommend'>('search');
  const [query, setQuery] = useState('');
  const [description, setDescription] = useState('');
  const [results, setResults] = useState<Standard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const runSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(false);
    try {
      const res = await standardApi.search({ q: query, pageSize: 20 });
      if (res.success && res.data) {
        const data = res.data as unknown as { items: Standard[] };
        setResults(data.items);
      } else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const runRecommend = async () => {
    if (!description.trim()) return;
    setLoading(true);
    setError(false);
    try {
      const res = await standardApi.recommend(description, language);
      if (res.success && res.data) setResults(res.data as Standard[]);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : prev.length >= 3 ? prev : [...prev, id]
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-5">
      <div>
        <Link to="/" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t('common.back')}
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <FileSearch className="h-5 w-5 text-primary" aria-hidden="true" />
          {t('standards.title')}
        </h1>
      </div>

      <div className="flex rounded-lg border p-0.5 w-fit" role="group">
        {(['search', 'recommend'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium min-h-[40px]',
              mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {m === 'search' ? <Search className="h-4 w-4" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {m === 'search' ? t('standards.search') : t('standards.recommendMode')}
          </button>
        ))}
      </div>

      {mode === 'search' ? (
        <form
          onSubmit={(e) => { e.preventDefault(); runSearch(); }}
          className="flex gap-2"
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('standards.searchPlaceholder')}
            aria-label={t('standards.search')}
          />
          <Button type="submit" disabled={loading || !query.trim()}>
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('standards.search')}</span>
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); runRecommend(); }} className="space-y-2">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('standards.recommendPlaceholder')}
            rows={4}
            aria-label={t('standards.recommendMode')}
          />
          <Button type="submit" disabled={loading || !description.trim()}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {t('standards.recommend')}
          </Button>
        </form>
      )}

      {selected.length >= 2 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
          <p className="text-sm font-medium">
            <GitCompare className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
            {t('standards.compareHint')} ({selected.length})
          </p>
          <Button size="sm" onClick={() => navigate(`/standards/compare?ids=${selected.join(',')}`)}>
            {t('standards.compare')}
          </Button>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      )}

      {error && !loading && <ErrorState onRetry={mode === 'search' ? runSearch : runRecommend} />}

      {!loading && !error && results && results.length === 0 && (
        <EmptyState
          title={t('standards.empty')}
          description={t('standards.emptyDesc')}
          action={
            <Button variant="outline" onClick={() => { setMode(mode === 'search' ? 'recommend' : 'search'); setResults(null); }}>
              {mode === 'search' ? t('standards.recommendMode') : t('standards.search')}
            </Button>
          }
        />
      )}

      {!loading && results && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('standards.results', { count: results.length })}</p>
          {results.map((s) => (
            <Card key={s.id} className="p-4 transition-shadow hover:shadow-md">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/standards/${s.id}`} className="font-semibold text-sm hover:text-primary hover:underline">
                      {s.standardNumber}
                    </Link>
                    <StatusPill status={s.status} />
                    <ConfidenceBadge level={s.confidence.level} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{s.title}</p>
                  {s.scope && (
                    <p className="mt-2 rounded-r-lg border-l-2 border-primary/60 bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                      {s.scope}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <VerifiedOn date={s.verifiedOn} />
                    {s.sources[0]?.sourceUrl && (
                      <a
                        href={s.sources[0].sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        {t('standards.viewSource')}
                      </a>
                    )}
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                  <input
                    type="checkbox"
                    checked={selected.includes(s.id)}
                    onChange={() => toggleSelect(s.id)}
                    className="h-4 w-4 rounded accent-primary"
                    aria-label={t('standards.compare')}
                  />
                  {t('standards.compare')}
                </label>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
