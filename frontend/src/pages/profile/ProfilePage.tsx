import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BadgeCheck, Save, RefreshCw, ArrowLeft, AlertTriangle } from 'lucide-react';
import { useProfileStore } from '../../stores';
import { businessApi } from '../../services/api';
import type { BusinessProfile } from '../../types';
import { Button } from '../../components/ui/button';
import { Input, Select, Label, Textarea } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { EmptyState, SkeletonCard } from '../../components/shared/states';
import { DisclaimerBanner } from '../../components/shared/verified';
import { toast } from '../../components/ui/toast';

const profileSchema = z.object({
  productName: z.string().min(1, 'Required'),
  productDescription: z.string().optional(),
  material: z.string().optional(),
  location: z.string().min(1, 'Required'),
  businessType: z.enum(['manufacturing', 'trading', 'service', 'import']).optional(),
  structure: z.enum(['proprietorship', 'partnership', 'llp', 'private_limited', 'public_limited']).optional(),
  premisesType: z.enum(['factory', 'workshop', 'home', 'commercial']).optional(),
  workerCount: z.coerce.number().int().min(0).optional(),
  annualTurnover: z.coerce.number().min(0).optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

export function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { businessId } = useParams<{ businessId: string }>();
  const currentBusiness = useProfileStore((s) => s.currentBusiness);
  const setCurrentBusiness = useProfileStore((s) => s.setCurrentBusiness);

  const [loading, setLoading] = useState(!!businessId && !currentBusiness);
  const [error, setError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: currentBusiness ?? {},
  });

  useEffect(() => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    if (currentBusiness?.id === businessId) {
      reset(currentBusiness as never);
      setLoading(false);
      return;
    }
    setLoading(true);
    businessApi
      .get(businessId)
      .then((res) => {
        if (res.success && res.data) {
          const data = res.data as unknown as BusinessProfile;
          setCurrentBusiness(data);
          reset(data as never);
        } else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const onSubmit = async (values: ProfileForm) => {
    if (!businessId) return;
    setSaving(true);
    try {
      const res = await businessApi.update(businessId, values);
      if (res.success && res.data) {
        setCurrentBusiness(res.data as BusinessProfile);
        reset(values);
        setDirty(false);
        toast.show(t('profile.saved'), 'success');
      } else {
        toast.show(res.error?.message ?? t('errors.INTERNAL_ERROR'), 'error');
      }
    } catch {
      toast.show(t('errors.NETWORK_ERROR'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    if (!businessId) return;
    try {
      const res = await businessApi.get(businessId);
      if (res.success) {
        toast.show(t('profile.regenerate'), 'success');
        navigate(`/business/${businessId}/roadmap`);
      }
    } catch {
      toast.show(t('errors.NETWORK_ERROR'), 'error');
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (error || (!currentBusiness && !businessId)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <EmptyState
          title={t('common.notFound')}
          description={t('roadmap.emptyDesc')}
          action={<Button asChild><Link to="/chat">{t('nav.chat')}</Link></Button>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link to="/chat" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t('common.back')}
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            {t('profile.title')}
            {currentBusiness?.profileConfirmed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-medium text-green-700">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t('profile.confirmed')}
              </span>
            )}
          </h1>
        </div>
        {businessId && (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/business/${businessId}/roadmap`}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t('nav.roadmap')}
            </Link>
          </Button>
        )}
      </div>

      {dirty && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 animate-in" role="alert">
          <p className="flex items-start gap-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t('profile.regenerateBanner')}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={regenerate} className="min-h-[36px]">
              {t('profile.regenerate')}
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} onChange={() => setDirty(true)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('profile.title')}</CardTitle>
            <CardDescription>{t('chat.profileExtracted')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label={t('profile.product')} error={errors.productName?.message} required>
              <Controller
                control={control}
                name="productName"
                render={({ field }) => <Input {...field} placeholder={t('profile.product')} />}
              />
            </Field>

            <Field label={t('profile.material')}>
              <Controller control={control} name="material" render={({ field }) => <Input {...field} placeholder="e.g. Stainless steel 304" />} />
            </Field>

            <Field label={t('profile.location')} error={errors.location?.message} required>
              <Controller control={control} name="location" render={({ field }) => <Input {...field} placeholder="e.g. Mumbai, Maharashtra" />} />
            </Field>

            <Field label={t('profile.businessType')}>
              <Controller
                control={control}
                name="businessType"
                render={({ field }) => (
                  <Select {...field} value={field.value ?? ''}>
                    <option value="">—</option>
                    <option value="manufacturing">{t('profile.businessTypes.manufacturing')}</option>
                    <option value="trading">{t('profile.businessTypes.trading')}</option>
                    <option value="service">{t('profile.businessTypes.service')}</option>
                    <option value="import">{t('profile.businessTypes.import')}</option>
                  </Select>
                )}
              />
            </Field>

            <Field label={t('profile.structure')}>
              <Controller
                control={control}
                name="structure"
                render={({ field }) => (
                  <Select {...field} value={field.value ?? ''}>
                    <option value="">—</option>
                    <option value="proprietorship">{t('profile.structures.proprietorship')}</option>
                    <option value="partnership">{t('profile.structures.partnership')}</option>
                    <option value="llp">{t('profile.structures.llp')}</option>
                    <option value="private_limited">{t('profile.structures.private_limited')}</option>
                    <option value="public_limited">{t('profile.structures.public_limited')}</option>
                  </Select>
                )}
              />
            </Field>

            <Field label={t('profile.premises')}>
              <Controller
                control={control}
                name="premisesType"
                render={({ field }) => (
                  <Select {...field} value={field.value ?? ''}>
                    <option value="">—</option>
                    <option value="factory">{t('profile.premisesTypes.factory')}</option>
                    <option value="workshop">{t('profile.premisesTypes.workshop')}</option>
                    <option value="home">{t('profile.premisesTypes.home')}</option>
                    <option value="commercial">{t('profile.premisesTypes.commercial')}</option>
                  </Select>
                )}
              />
            </Field>

            <Field label={t('profile.workers')}>
              <Controller control={control} name="workerCount" render={({ field }) => <Input type="number" min={0} {...field} value={field.value ?? ''} />} />
            </Field>

            <Field label={t('profile.turnover')}>
              <Controller control={control} name="annualTurnover" render={({ field }) => <Input type="number" min={0} {...field} value={field.value ?? ''} />} />
            </Field>

            <div className="sm:col-span-2">
              <Field label={t('profile.description')}>
                <Controller control={control} name="productDescription" render={({ field }) => <Textarea rows={3} {...field} value={field.value ?? ''} />} />
              </Field>
            </div>

            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" disabled={saving || !dirty}>
                <Save className="h-4 w-4" aria-hidden="true" />
                {t('profile.save')}
              </Button>
              {dirty && (
                <Button type="button" variant="ghost" onClick={() => { reset(currentBusiness as never); setDirty(false); }}>
                  {t('common.cancel')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </form>

      <DisclaimerBanner />
    </div>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
