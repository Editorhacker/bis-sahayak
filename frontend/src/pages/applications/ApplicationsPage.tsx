import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, ExternalLink, Bell, Pencil, FileText, Calendar } from 'lucide-react';
import { applicationApi } from '../../services/api';
import { useProfileStore } from '../../stores';
import type { Application } from '../../types';
import { Button } from '../../components/ui/button';
import { Input, Label, Select, Textarea } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { EmptyState, ListSkeleton } from '../../components/shared/states';
import { DisclaimerBanner } from '../../components/shared/verified';
import { applicationStatusPill } from '../../components/roadmap/StepCard';
import { toast } from '../../components/ui/toast';
import { formatDate } from '../../lib/utils';

const statuses: Application['status'][] = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED'];

export function ApplicationsPage() {
  const { t, i18n } = useTranslation();
  const business = useProfileStore((s) => s.currentBusiness);
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Application | 'new' | null>(null);

  const load = async () => {
    if (!business?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await applicationApi.list(business.id);
      if (res.success && res.data) setApps((res.data as unknown as { items: Application[] }).items);
    } catch {
      toast.show(t('errors.NETWORK_ERROR'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  if (!business?.id) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <EmptyState
          icon={<FileText className="h-7 w-7 text-muted-foreground" aria-hidden="true" />}
          title={t('applications.empty')}
          description={t('applications.emptyDesc')}
          action={<Button asChild><Link to="/chat">{t('roadmap.goToProfile')}</Link></Button>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('applications.title')}</h1>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('applications.add')}
        </Button>
      </div>

      {loading ? (
        <ListSkeleton count={3} />
      ) : apps.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-7 w-7 text-muted-foreground" aria-hidden="true" />}
          title={t('applications.empty')}
          description={t('applications.emptyDesc')}
          action={<Button asChild><Link to={`/business/${business.id}/roadmap`}>{t('applications.goToRoadmap')}</Link></Button>}
        />
      ) : (
        <div className="grid gap-3">
          {apps.map((app) => (
            <Card key={app.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{app.requirementTitle}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {app.referenceNumber && <span>{t('applications.reference')}: {app.referenceNumber}</span>}
                    {app.submittedDate && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" aria-hidden="true" />
                        {formatDate(app.submittedDate, i18n.language)}
                      </span>
                    )}
                  </div>
                  {app.notes && <p className="mt-1.5 text-sm text-muted-foreground">{app.notes}</p>}
                  {app.reminderDate && (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs text-amber-800">
                      <Bell className="h-3 w-3" aria-hidden="true" />
                      {t('applications.reminder')}: {formatDate(app.reminderDate, i18n.language)}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {applicationStatusPill(app.status)}
                  <Select
                    value={app.status}
                    onChange={async (e) => {
                      const status = e.target.value as Application['status'];
                      setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, status } : a)));
                      try {
                        await applicationApi.update(app.id, { status });
                      } catch {
                        toast.show(t('errors.NETWORK_ERROR'), 'error');
                        load();
                      }
                    }}
                    className="h-9 min-h-[36px] w-36 text-xs"
                    aria-label={t('applications.status')}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {t(`applications.statuses.${s}`)}
                      </option>
                    ))}
                  </Select>
                  {app.statusUrl && (
                    <Button variant="ghost" size="iconSm" asChild aria-label={t('applications.openStatus')}>
                      <a href={app.statusUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  <Button variant="ghost" size="iconSm" onClick={() => setEditing(app)} aria-label={t('applications.edit')}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <DisclaimerBanner />

      {editing && (
        <ApplicationForm
          businessId={business.id}
          application={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ApplicationForm({
  businessId,
  application,
  onClose,
  onSaved,
}: {
  businessId: string;
  application: Application | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    requirementTitle: application?.requirementTitle ?? '',
    referenceNumber: application?.referenceNumber ?? '',
    submittedDate: application?.submittedDate ?? '',
    reminderDate: application?.reminderDate ?? '',
    status: application?.status ?? ('DRAFT' as Application['status']),
    notes: application?.notes ?? '',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.requirementTitle.trim()) return;
    setSaving(true);
    try {
      if (application) {
        await applicationApi.update(application.id, form);
      } else {
        await applicationApi.create(businessId, {
          requirementId: 'manual',
          ...form,
        } as never);
      }
      toast.show(t('common.save'), 'success');
      onSaved();
    } catch {
      toast.show(t('errors.NETWORK_ERROR'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl border bg-background p-5 space-y-4 shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold">
          {application ? t('applications.edit') : t('applications.add')}
        </h2>

        <div className="space-y-1.5">
          <Label htmlFor="app-req">{t('applications.requirement')} *</Label>
          <Input id="app-req" required value={form.requirementTitle} onChange={(e) => setForm({ ...form, requirementTitle: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="app-ref">{t('applications.reference')}</Label>
            <Input id="app-ref" value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="app-status">{t('applications.status')}</Label>
            <Select id="app-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Application['status'] })}>
              {statuses.map((s) => (
                <option key={s} value={s}>{t(`applications.statuses.${s}`)}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="app-sub">{t('applications.submitted')}</Label>
            <Input id="app-sub" type="date" value={form.submittedDate} onChange={(e) => setForm({ ...form, submittedDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="app-rem">{t('applications.reminder')}</Label>
            <Input id="app-rem" type="date" value={form.reminderDate} onChange={(e) => setForm({ ...form, reminderDate: e.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="app-notes">{t('applications.notes')}</Label>
          <Textarea id="app-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={saving}>{t('common.save')}</Button>
        </div>
      </form>
    </div>
  );
}
