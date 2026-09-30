import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Quote, Map, ShieldCheck, FileSearch, Sparkles, MessageSquare } from 'lucide-react';
import { useChatStore, useUIStore } from '../../stores';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/input';
import { LanguageSwitcher } from '../../components/shared/LanguageSwitcher';
import { DisclaimerBanner } from '../../components/shared/verified';
import { cn } from '../../lib/utils';
import type { Language } from '../../types';

const exampleKeys = ['bottle', 'food', 'helmet', 'hallmark', 'hindi', 'marathi'] as const;

export function LandingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const setDraft = useChatStore((s) => s.setDraftMessage);
  const language = useUIStore((s) => s.language);
  const setLanguage = useUIStore((s) => s.setLanguage);

  const go = (text: string) => {
    if (!text.trim()) return;
    setDraft(text.trim());
    navigate('/chat');
  };

  const features = [
    { icon: Quote, title: t('landing.features.cited'), desc: t('landing.features.citedDesc') },
    { icon: Map, title: t('landing.features.roadmap'), desc: t('landing.features.roadmapDesc') },
    { icon: ShieldCheck, title: t('landing.features.honest'), desc: t('landing.features.honestDesc') },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          {t('app.name')}
        </Link>
        <nav className="flex items-center gap-2" aria-label="Main">
          <Link to="/standards" className="hidden sm:block px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            {t('nav.standards')}
          </Link>
          <Link to="/labs" className="hidden sm:block px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            {t('nav.labs')}
          </Link>
          <Link to="/consumer" className="hidden sm:block px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            {t('nav.consumer')}
          </Link>
          <LanguageSwitcher compact />
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">{t('nav.login')}</Link>
          </Button>
          <Button size="sm" asChild className="hidden sm:inline-flex">
            <Link to="/register">{t('nav.register')}</Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:pt-16 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
          <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
          {t('app.tagline')}
        </div>

        <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          {t('landing.headline')}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
          {t('landing.subheadline')}
        </p>

        <form
          className="mx-auto mt-8 max-w-2xl"
          onSubmit={(e) => {
            e.preventDefault();
            go(prompt);
          }}
        >
          <div className="relative rounded-2xl border bg-card p-2 shadow-lg focus-within:ring-2 focus-within:ring-ring">
            <label htmlFor="landing-prompt" className="sr-only">
              {t('landing.inputPlaceholder')}
            </label>
            <Textarea
              id="landing-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  go(prompt);
                }
              }}
              placeholder={t('landing.inputPlaceholder')}
              rows={3}
              className="min-h-[72px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 text-base"
            />
            <div className="flex items-center justify-between gap-2 px-1 pb-1">
              <div className="flex items-center gap-2">
                <label htmlFor="landing-lang" className="sr-only">
                  {t('chat.language')}
                </label>
                <select
                  id="landing-lang"
                  value={language}
                  onChange={(e) => {
                    const l = e.target.value as Language;
                    setLanguage(l);
                  }}
                  className="h-9 rounded-lg border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[36px]"
                >
                  <option value="en">English</option>
                  <option value="hi">हिन्दी</option>
                  <option value="mr">मराठी</option>
                </select>
              </div>
              <Button type="submit" disabled={!prompt.trim()} className="h-10">
                {t('landing.submit')}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </form>

        <div className="mt-8">
          <p className="text-sm font-medium text-muted-foreground">{t('landing.examplesTitle')}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {exampleKeys.map((key) => {
              const text = t(`landing.examples.${key}`);
              const isHiMr = key === 'hindi' || key === 'marathi';
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => go(text)}
                  className={cn(
                    'max-w-full rounded-full border bg-card px-4 py-2.5 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/5 min-h-[44px]',
                    isHiMr && 'font-devanagari',
                    key === 'hindi' || key === 'marathi' ? 'truncate' : ''
                  )}
                >
                  <span className="line-clamp-1">{text}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-3 text-left">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <f.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center gap-3">
          <Button variant="outline" asChild>
            <Link to="/chat">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              {t('chat.emptyTitle')}
            </Link>
          </Button>
          <DisclaimerBanner className="max-w-xl text-left" />
        </div>
      </main>
    </div>
  );
}
