import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical, MapPin, Phone, Mail, ExternalLink, List, Map as MapIcon, SlidersHorizontal } from 'lucide-react';
import { labApi } from '../../services/api';
import type { Lab } from '../../types';
import { Button } from '../../components/ui/button';
import { Select } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { VerifiedOn } from '../../components/shared/verified';
import { EmptyState, ErrorState, SkeletonCard } from '../../components/shared/states';
import { cn } from '../../lib/utils';

const states = ['Maharashtra', 'Delhi', 'Karnataka', 'Tamil Nadu', 'Uttar Pradesh', 'Gujarat', 'Rajasthan', 'West Bengal', 'Telangana', 'Kerala'];

export function LabsPage() {
  const { t } = useTranslation();
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ state: '', city: '', capability: '', product: '' });

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await labApi.list({ ...filters, pageSize: 50 });
      if (res.success && res.data) {
        const data = res.data as unknown as { items: Lab[] };
        setLabs(data.items);
      } else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const id = setTimeout(load, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <FlaskConical className="h-5 w-5 text-primary" aria-hidden="true" />
          {t('labs.title')}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {t('labs.filters')}
          </Button>
          <div className="flex items-center rounded-lg border p-0.5" role="group">
            <button
              type="button"
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              className={cn('flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium min-h-[32px]', view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              {t('labs.list')}
            </button>
            <button
              type="button"
              onClick={() => setView('map')}
              aria-pressed={view === 'map'}
              className={cn('flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium min-h-[32px]', view === 'map' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
            >
              <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {t('labs.map')}
            </button>
          </div>
        </div>
      </div>

      {filtersOpen && (
        <Card className="p-4 animate-in">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <label htmlFor="lab-state" className="text-xs font-medium text-muted-foreground">{t('labs.state')}</label>
              <Select id="lab-state" value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })}>
                <option value="">{t('labs.allStates')}</option>
                {states.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="lab-city" className="text-xs font-medium text-muted-foreground">{t('labs.city')}</label>
              <input
                id="lab-city"
                value={filters.city}
                onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                placeholder={t('labs.allCities')}
                className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="lab-cap" className="text-xs font-medium text-muted-foreground">{t('labs.capability')}</label>
              <input
                id="lab-cap"
                value={filters.capability}
                onChange={(e) => setFilters({ ...filters, capability: e.target.value })}
                placeholder={t('labs.capabilities')}
                className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="lab-prod" className="text-xs font-medium text-muted-foreground">{t('labs.product')}</label>
              <input
                id="lab-prod"
                value={filters.product}
                onChange={(e) => setFilters({ ...filters, product: e.target.value })}
                placeholder={t('labs.product')}
                className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
              />
            </div>
          </div>
        </Card>
      )}

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      )}

      {error && !loading && <ErrorState onRetry={load} />}

      {!loading && !error && labs.length === 0 && (
        <EmptyState
          icon={<FlaskConical className="h-7 w-7 text-muted-foreground" aria-hidden="true" />}
          title={t('labs.empty')}
          description={t('labs.emptyDesc')}
          action={
            <Button
              variant="outline"
              onClick={() => setFilters({ state: '', city: '', capability: '', product: '' })}
            >
              {t('common.clear')}
            </Button>
          }
        />
      )}

      {!loading && view === 'list' && labs.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {labs.map((lab) => (
            <Card key={lab.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10" aria-hidden="true">
                  <FlaskConical className="h-4.5 w-4.5 text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">{lab.name}</h3>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {lab.city}, {lab.state}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {lab.capabilities.slice(0, 4).map((c) => (
                      <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {c}
                      </span>
                    ))}
                    {lab.capabilities.length > 4 && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        +{lab.capabilities.length - 4}
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 space-y-1 text-xs text-muted-foreground">
                    {lab.contact?.phone && (
                      <p className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3" aria-hidden="true" />
                        {lab.contact.phone}
                      </p>
                    )}
                    {lab.contact?.email && (
                      <p className="flex items-center gap-1.5 truncate">
                        <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {lab.contact.email}
                      </p>
                    )}
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <VerifiedOn date={lab.verifiedOn} />
                    {lab.sourceUrl && (
                      <a
                        href={lab.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        {t('labs.viewSource')}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && view === 'map' && labs.length > 0 && (
        <LabMap labs={labs} />
      )}
    </div>
  );
}

function LabMap({ labs }: { labs: Lab[] }) {
  const [MapComponent, setMapComponent] = useState<typeof import('react-leaflet') | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('react-leaflet');
        await import('leaflet/dist/leaflet.css');
        if (!cancelled) setMapComponent(mod);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <ErrorState />;
  if (!MapComponent) return <SkeletonCard lines={3} />;

  const located = labs.filter((l) => l.coordinates);
  const center = located[0]?.coordinates
    ? ([located[0].coordinates.lat, located[0].coordinates.lng] as [number, number])
    : ([20.59, 78.96] as [number, number]);

  const { MapContainer, TileLayer, Marker, Popup } = MapComponent;

  return (
    <div className="h-[480px] overflow-hidden rounded-xl border" role="application" aria-label="Labs map">
      <MapContainer center={center} zoom={5} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {located.map((lab) => (
          <Marker key={lab.id} position={[lab.coordinates!.lat, lab.coordinates!.lng]}>
            <Popup>
              <strong>{lab.name}</strong>
              <br />
              {lab.city}, {lab.state}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
