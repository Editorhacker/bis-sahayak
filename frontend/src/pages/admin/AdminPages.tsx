import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Loader2, AlertTriangle, FileText, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { adminApi } from '../../services/api';
import type { AdminMetrics, SourceDocument } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { ErrorState, SkeletonCard, EmptyState } from '../../components/shared/states';
import { formatDate, isStale, cn } from '../../lib/utils';

function MetricCard({ label, value, goodDirection, hint }: { label: string; value: number; goodDirection: 'up' | 'down'; hint?: string }) {
  const pct = Math.round(value * 100);
  const isGood = goodDirection === 'up' ? pct >= 70 : pct <= 10;
  const isOk = goodDirection === 'up' ? pct >= 50 : pct <= 25;
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className={cn('text-2xl font-bold', isGood ? 'text-green-600' : isOk ? 'text-amber-600' : 'text-destructive')}>
          {pct}%
        </span>
        {goodDirection === 'up' ? (
          pct >= 70 ? <TrendingUp className="h-4 w-4 text-green-600" aria-hidden="true" /> : <Minus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        ) : pct <= 10 ? (
          <TrendingDown className="h-4 w-4 text-green-600" aria-hidden="true" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
        )}
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export function AdminMetricsPage() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await adminApi.getMetrics();
      if (res.success && res.data) setMetrics(res.data as AdminMetrics);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <ErrorState onRetry={load} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('admin.metrics')}</h1>
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/sources">
            <FileText className="h-4 w-4" aria-hidden="true" />
            {t('admin.sources')}
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label={t('admin.hitAt3')} value={metrics.retrievalHitAt3} goodDirection="up" />
        <MetricCard label={t('admin.citationCorrectness')} value={metrics.citationCorrectness} goodDirection="up" />
        <MetricCard label={t('admin.unsupportedRate')} value={metrics.unsupportedAnswerRate} goodDirection="down" />
        <MetricCard label={t('admin.roadmapRecall')} value={metrics.roadmapRecall} goodDirection="up" />
        <MetricCard label={t('admin.refusalCorrectness')} value={metrics.refusalCorrectness} goodDirection="up" />
      </div>

      {metrics.trendData && metrics.trendData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendTable data={metrics.trendData} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('admin.failedQuestions')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {metrics.failedQuestions.length === 0 ? (
            <EmptyState title="No failed questions" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">{t('admin.question')}</th>
                    <th className="p-3 font-medium">{t('admin.expected')}</th>
                    <th className="p-3 font-medium">{t('admin.actual')}</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.failedQuestions.map((q) => (
                    <tr key={q.id} className="border-b last:border-0 align-top">
                      <td className="p-3 text-xs">{q.question}</td>
                      <td className="p-3 text-xs text-green-700">{q.expectedAnswer}</td>
                      <td className="p-3 text-xs text-destructive">{q.actualAnswer}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TrendTable({ data }: { data: AdminMetrics['trendData'] }) {
  const cols = ['retrievalHitAt3', 'citationCorrectness', 'unsupportedAnswerRate', 'roadmapRecall', 'refusalCorrectness'] as const;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="p-2 font-medium">Date</th>
            {cols.map((c) => (
              <th key={c} className="p-2 font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.date} className="border-b last:border-0">
              <td className="p-2 whitespace-nowrap">{formatDate(row.date)}</td>
              {cols.map((c) => (
                <td key={c} className="p-2">{Math.round(row[c] * 100)}%</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminSourcesPage() {
  const { t } = useTranslation();
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await adminApi.getSources();
      if (res.success && res.data) setSources((res.data as unknown as { items: SourceDocument[] }).items);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-3 px-4 py-8">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <ErrorState onRetry={load} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('admin.sources')}</h1>
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/metrics">{t('admin.metrics')}</Link>
        </Button>
      </div>

      <Card className="divide-y p-0 overflow-hidden">
        {sources.map((s) => {
          const stale = isStale(s.lastVerifiedAt);
          return (
            <div key={s.id} className={cn('flex flex-wrap items-center justify-between gap-3 p-4', stale && 'bg-amber-50/60')}>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium truncate">
                  {s.title}
                  {stale && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[11px] text-amber-800">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      {t('admin.stale')}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.type} · {t('admin.documentCount')}: {s.documentCount} · {t('admin.lastVerified')}: {formatDate(s.lastVerifiedAt)}
                </p>
              </div>
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                  s.ingestionStatus === 'COMPLETED' && 'bg-green-50 text-green-700 border-green-200',
                  s.ingestionStatus === 'PENDING' && 'bg-blue-50 text-blue-700 border-blue-200',
                  s.ingestionStatus === 'FAILED' && 'bg-red-50 text-red-700 border-red-200'
                )}
              >
                {s.ingestionStatus === 'COMPLETED' && <Loader2 className="mr-1 h-3 w-3" aria-hidden="true" />}
                {s.ingestionStatus}
              </span>
            </div>
          );
        })}
        {sources.length === 0 && <EmptyState title={t('common.noData')} />}
      </Card>
    </div>
  );
}
