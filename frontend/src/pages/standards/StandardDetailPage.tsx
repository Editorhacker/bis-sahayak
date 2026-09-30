import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react';
import { standardApi } from '../../services/api';
import type { Standard } from '../../types';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { ConfidenceBadge } from '../../components/shared/badges';
import { VerifiedOn } from '../../components/shared/verified';
import { ErrorState, SkeletonCard } from '../../components/shared/states';
import { SourcePanel } from '../../components/chat/SourcePanel';

export function StandardDetailPage() {
  const { t } = useTranslation();
  const { standardId } = useParams<{ standardId: string }>();
  const [standard, setStandard] = useState<Standard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    if (!standardId) return;
    setLoading(true);
    setError(false);
    try {
      const res = await standardApi.get(standardId);
      if (res.success && res.data) setStandard(res.data as Standard);
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
  }, [standardId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (error || !standard) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <ErrorState onRetry={load} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-5">
      <Link to="/standards" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {t('standards.back')}
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{standard.standardNumber}</h1>
        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
          {t(`standards.status.${standard.status}`)}
        </span>
        <ConfidenceBadge level={standard.confidence.level} />
      </div>
      <p className="text-muted-foreground">{standard.title}</p>
      <VerifiedOn date={standard.verifiedOn} />

      {standard.scope && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('standards.scope')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed">{standard.scope}</CardContent>
        </Card>
      )}

      {standard.testClauses && standard.testClauses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('standards.testClauses')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {standard.testClauses.map((c) => (
                <li key={c} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  {c}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {standard.relatedStandards && standard.relatedStandards.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('standards.related')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {standard.relatedStandards.map((r) => (
              <span key={r} className="rounded-lg border px-3 py-1.5 text-sm">
                {r}
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      {standard.sources.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
            {t('chat.sources')}
          </h2>
          <SourcePanel citations={standard.sources} className="rounded-xl border" />
        </section>
      )}

      {standard.sources[0]?.sourceUrl && (
        <Button asChild>
          <a href={standard.sources[0].sourceUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t('standards.viewSource')}
          </a>
        </Button>
      )}
    </div>
  );
}
