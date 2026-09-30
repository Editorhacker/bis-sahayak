import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Pencil, Plus, CircleDashed, Check } from 'lucide-react';
import type { BusinessProfile, ProfileQuestion } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { cn } from '../../lib/utils';

export type FieldKey =
  | 'productName'
  | 'material'
  | 'location'
  | 'businessType'
  | 'structure'
  | 'premisesType'
  | 'workerCount'
  | 'annualTurnover';

const translatableOptions = [
  'manufacturing', 'trading', 'service', 'import',
  'proprietorship', 'partnership', 'llp', 'private_limited', 'public_limited',
  'factory', 'factory_unit', 'workshop', 'home', 'commercial', 'shop', 'warehouse'
];

export function normalizeProfileData(rawProfile: Record<string, unknown> | Partial<BusinessProfile> | null | undefined): Partial<BusinessProfile> & Record<string, unknown> {
  if (!rawProfile) return {};
  const p = { ...rawProfile } as Record<string, unknown>;
  const product = (p.product && typeof p.product === 'object' && !Array.isArray(p.product))
    ? (p.product as Record<string, unknown>)
    : {};

  const rawLoc = p.location;
  let locStr: string | undefined = undefined;
  let stateStr = (p.state as string) || undefined;
  let cityStr = (p.city as string) || undefined;

  if (typeof rawLoc === 'string' && rawLoc !== '[object Object]') {
    locStr = rawLoc;
  } else if (rawLoc && typeof rawLoc === 'object') {
    const locObj = rawLoc as Record<string, unknown>;
    cityStr = (locObj.city as string) || cityStr;
    stateStr = (locObj.state as string) || stateStr;
    const parts = [cityStr, stateStr].filter(Boolean);
    if (parts.length > 0) locStr = parts.join(', ');
  } else if (cityStr || stateStr) {
    const parts = [cityStr, stateStr].filter(Boolean);
    if (parts.length > 0) locStr = parts.join(', ');
  }

  const productName = (p.productName ?? product.name ?? p.businessName ?? '') as string;
  const material = (p.material ?? product.material ?? '') as string;
  const businessType = (p.businessType ?? '') as string;
  const structure = (p.structure ?? p.businessStructure ?? '') as string;
  const premisesType = (p.premisesType ?? '') as string;

  const rawWorkers = p.workerCount ?? p.employeeCount ?? p.workers;
  const workerCount = (rawWorkers != null && rawWorkers !== '') ? Number(rawWorkers) : undefined;

  const rawTurnover = p.annualTurnover ?? p.expectedTurnover ?? p.turnover;
  const annualTurnover = (rawTurnover != null && rawTurnover !== '') ? Number(rawTurnover) : undefined;

  return {
    ...p,
    productName: productName || undefined,
    material: material || undefined,
    location: locStr || undefined,
    state: stateStr || undefined,
    city: cityStr || undefined,
    businessType: (businessType as BusinessProfile['businessType']) || undefined,
    structure: (structure as BusinessProfile['structure']) || undefined,
    premisesType: (premisesType as BusinessProfile['premisesType']) || undefined,
    workerCount: Number.isNaN(workerCount) ? undefined : workerCount,
    annualTurnover: Number.isNaN(annualTurnover) ? undefined : annualTurnover,
  };
}

export function useOptionLabel() {
  const { t } = useTranslation();
  return (field: FieldKey, value: string) => {
    if (!value) return '';
    if (field === 'businessType') return t(`profile.businessTypes.${value}`, { defaultValue: value });
    if (field === 'structure') return t(`profile.structures.${value}`, { defaultValue: value.replace('_', ' ') });
    if (field === 'premisesType') {
      const normalizedKey = value === 'factory' ? 'factory_unit' : value === 'commercial' ? 'shop' : value;
      return t(`profile.premisesTypes.${normalizedKey}`, { defaultValue: value.replace('_', ' ') });
    }
    if (translatableOptions.includes(value)) return value;
    return value;
  };
}

function formatDisplayValue(
  value: unknown,
  field: FieldKey,
  optionLabel: (f: FieldKey, v: string) => string
): string {
  if (value == null || value === '') return '';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const parts = [obj.city, obj.state].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
    return '';
  }
  const str = String(value);
  if (field === 'businessType' || field === 'structure' || field === 'premisesType') {
    return optionLabel(field, str);
  }
  return str;
}

function Chip({
  label,
  field,
  value,
  missing,
  editable,
  editing,
  onEdit,
  options,
  type,
  onSave,
}: {
  label: string;
  field: FieldKey;
  value: string | number | undefined;
  missing?: boolean;
  editable?: boolean;
  editing?: boolean;
  onEdit?: () => void;
  options?: string[];
  type?: 'text' | 'select' | 'number';
  onSave?: (value: string) => void;
}) {
  const { t } = useTranslation();
  const optionLabel = useOptionLabel();
  const displayVal = formatDisplayValue(value, field, optionLabel);
  const [draft, setDraft] = useState(value != null ? String(value) : '');

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {type === 'select' && options ? (
          <select
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onSave?.(draft)}
            onKeyDown={(e) => e.key === 'Enter' && onSave?.(draft)}
            className="h-9 rounded-lg border-2 border-primary bg-background px-2 text-sm focus:outline-none"
            aria-label={label}
          >
            <option value="">Select…</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {optionLabel(field, o)}
              </option>
            ))}
          </select>
        ) : (
          <Input
            autoFocus
            type={type === 'number' ? 'number' : 'text'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onSave?.(draft)}
            onKeyDown={(e) => e.key === 'Enter' && onSave?.(draft)}
            className="h-9 min-h-[36px] w-40 border-primary"
            placeholder={label}
            aria-label={label}
          />
        )}
        <Button
          size="iconSm"
          variant="ghost"
          onMouseDown={(e) => {
            e.preventDefault();
            onSave?.(draft);
          }}
          aria-label={t('common.save')}
          className="h-8 w-8 min-h-[32px]"
        >
          <Check className="h-4 w-4 text-green-600" />
        </Button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={editable ? onEdit : undefined}
      disabled={!editable}
      className={cn(
        'group inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors min-h-[36px]',
        missing
          ? 'border-dashed border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100'
          : 'border-border bg-muted/40 hover:bg-muted',
        editable && 'hover:border-primary/50',
        !editable && 'cursor-default'
      )}
      aria-label={`${label}: ${displayVal || t('profile.missingField')}`}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {missing ? (
        <span className="flex items-center gap-1 font-medium">
          <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
          {t('profile.missingField')}
        </span>
      ) : (
        <span className="font-medium truncate">{displayVal}</span>
      )}
      {editable && !missing && (
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
      )}
    </button>
  );
}

const fieldAliasMap: Record<string, FieldKey> = {
  businessStructure: 'structure',
  structure: 'structure',
  employeeCount: 'workerCount',
  workerCount: 'workerCount',
  expectedTurnover: 'annualTurnover',
  annualTurnover: 'annualTurnover',
  product: 'productName',
  productName: 'productName',
  material: 'material',
  location: 'location',
  state: 'location',
  city: 'location',
  premisesType: 'premisesType',
  businessType: 'businessType',
};

export function ProfileCard({
  profile,
  questions = [],
  onConfirm,
  onUpdateField,
  editable = true,
  highlight = false,
}: {
  profile: Partial<BusinessProfile>;
  questions?: ProfileQuestion[];
  onConfirm?: () => void;
  onUpdateField?: (field: string, value: string | number) => void;
  editable?: boolean;
  highlight?: boolean;
}) {
  const { t } = useTranslation();
  const [editingField, setEditingField] = useState<FieldKey | null>(null);

  const normalized = normalizeProfileData(profile);

  const fields: {
    key: FieldKey;
    label: string;
    options?: string[];
    type?: 'text' | 'select' | 'number';
  }[] = [
    { key: 'productName', label: t('profile.product') },
    { key: 'material', label: t('profile.material') },
    { key: 'location', label: t('profile.location') },
    { key: 'businessType', label: t('profile.businessType'), options: ['manufacturing', 'trading', 'service', 'import'], type: 'select' },
    { key: 'structure', label: t('profile.structure'), options: ['proprietorship', 'partnership', 'llp', 'private_limited', 'public_limited'], type: 'select' },
    { key: 'premisesType', label: t('profile.premises'), options: ['factory_unit', 'shop', 'home', 'warehouse'], type: 'select' },
    { key: 'workerCount', label: t('profile.workers'), type: 'number' },
    { key: 'annualTurnover', label: t('profile.turnover'), type: 'number' },
  ];

  const missingFields = fields.filter((f) => {
    const val = normalized[f.key as keyof typeof normalized];
    return val == null || val === '';
  });
  const missingCount = missingFields.length;
  const missingFieldKeys = new Set(missingFields.map((f) => f.key));

  const relevantQuestions = questions
    .map((q) => {
      const mappedKey = fieldAliasMap[q.field] ?? (q.field as FieldKey);
      return {
        ...q,
        field: mappedKey,
        question: q.question || (q as unknown as { text?: string }).text || '',
      };
    })
    .filter((q) => missingFieldKeys.has(q.field as FieldKey));

  return (
    <Card
      id="profile-card"
      className={cn(
        'border-primary/30 bg-gradient-to-b from-primary/5 to-transparent',
        highlight && 'ring-2 ring-primary animate-pulse'
      )}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BadgeCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          {t('profile.title')}
          {normalized.profileConfirmed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-medium text-green-700">
              <Check className="h-3 w-3" aria-hidden="true" />
              {t('profile.confirmed')}
            </span>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t('chat.profileExtracted')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {fields.map((f) => {
            const raw = normalized[f.key as keyof typeof normalized] as string | number | undefined;
            const missing = raw == null || raw === '';
            const q = questions.find((item) => (fieldAliasMap[item.field] ?? item.field) === f.key);
            const displayType = f.type ?? (q?.type as 'text' | 'select' | 'number' | undefined) ?? 'text';
            const options = f.options ?? q?.options;
            return (
              <Chip
                key={f.key}
                field={f.key}
                label={f.label}
                value={missing ? undefined : raw}
                missing={missing}
                editable={editable}
                editing={editingField === f.key}
                onEdit={() => setEditingField(f.key)}
                options={options}
                type={displayType === 'select' && options ? 'select' : displayType === 'number' ? 'number' : 'text'}
                onSave={(val) => {
                  onUpdateField?.(f.key, displayType === 'number' && val !== '' ? Number(val) : val);
                  setEditingField(null);
                }}
              />
            );
          })}
        </div>

        {missingCount > 0 && relevantQuestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t('profile.missingField')} ({missingCount})
            </p>
            <QuickReplies questions={relevantQuestions} onAnswer={onUpdateField} />
          </div>
        )}

        {editable && onConfirm && !normalized.profileConfirmed && (
          <div className="flex items-center gap-3 pt-1">
            <Button onClick={onConfirm} className="w-full sm:w-auto">
              <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              {t('chat.confirmProfile')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function QuickReplies({
  questions,
  onAnswer,
}: {
  questions: ProfileQuestion[];
  onAnswer?: (field: string, value: string | number) => void;
}) {
  const { t } = useTranslation();
  const optionLabel = useOptionLabel();
  const [openInput, setOpenInput] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  if (!questions.length) return null;

  return (
    <div className="space-y-3">
      {questions.map((q) => {
        const questionText = q.question || (q as unknown as { text?: string }).text || '';
        return (
          <div key={q.field} className="space-y-1.5">
            {questionText && <p className="text-sm font-medium">{questionText}</p>}
            <div className="flex flex-wrap gap-2">
              {q.options?.map((opt) => (
                <Button
                  key={opt}
                  variant="outline"
                  size="sm"
                  onClick={() => onAnswer?.(q.field, opt)}
                  className="min-h-[36px]"
                >
                  {optionLabel(q.field as FieldKey, opt)}
                </Button>
              ))}
              {openInput === q.field ? (
                <span className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && draft.trim()) {
                        onAnswer?.(q.field, q.type === 'number' ? Number(draft) : draft.trim());
                        setDraft('');
                        setOpenInput(null);
                      }
                    }}
                    placeholder={questionText || t('profile.edit')}
                    className="h-9 min-h-[36px] w-44"
                    aria-label={questionText || t('profile.edit')}
                  />
                  <Button
                    size="iconSm"
                    onClick={() => {
                      if (draft.trim()) {
                        onAnswer?.(q.field, q.type === 'number' ? Number(draft) : draft.trim());
                        setDraft('');
                        setOpenInput(null);
                      }
                    }}
                    aria-label={t('common.save')}
                    className="h-9 w-9 min-h-[36px]"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpenInput(q.field)}
                  className="min-h-[36px] border border-dashed border-border"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('profile.edit')}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
