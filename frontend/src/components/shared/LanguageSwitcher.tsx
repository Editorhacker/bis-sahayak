import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { useUIStore } from '../../stores';
import type { Language } from '../../types';
import { cn } from '../../lib/utils';

const languages: { code: Language; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
];

export function LanguageSwitcher({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { i18n } = useTranslation();
  const language = useUIStore((s) => s.language);
  const setLanguage = useUIStore((s) => s.setLanguage);

  const change = (code: Language) => {
    setLanguage(code);
    i18n.changeLanguage(code);
  };

  if (compact) {
    return (
      <div className={cn('flex items-center rounded-lg border bg-background p-0.5', className)} role="group" aria-label="Language">
        {languages.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => change(l.code)}
            aria-pressed={language === l.code}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors min-h-[32px]',
              language === l.code ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {l.native}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('relative flex items-center gap-1.5', className)}>
      <Languages className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <select
        value={language}
        onChange={(e) => change(e.target.value as Language)}
        aria-label="Language"
        className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[36px]"
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </div>
  );
}
