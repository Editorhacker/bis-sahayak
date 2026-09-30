import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, HelpCircle, MessageSquareWarning, SearchCheck, ArrowLeft, MessageSquare } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { DisclaimerBanner } from '../../components/shared/verified';
import { useChatStore } from '../../stores';

const cardKeys = ['hallmark', 'mark', 'complaint', 'licence'] as const;

const icons = {
  hallmark: BadgeCheck,
  mark: HelpCircle,
  complaint: MessageSquareWarning,
  licence: SearchCheck,
} as const;

const prompts: Record<(typeof cardKeys)[number], string> = {
  hallmark: 'How do I verify a gold hallmark and what does the HUID mean?',
  mark: 'What does the BIS mark on my product mean?',
  complaint: 'How do I file a complaint about a product?',
  licence: 'How do I check a BIS licence or certificate number?',
};

export function ConsumerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setDraft = useChatStore((s) => s.setDraftMessage);
  const setMode = useChatStore((s) => s.setMode);

  const askInChat = (key: (typeof cardKeys)[number]) => {
    setMode('consumer');
    setDraft(prompts[key]);
    navigate('/chat');
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-5">
      <div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t('common.back')}
        </button>
        <h1 className="text-xl font-bold">{t('consumer.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('consumer.subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {cardKeys.map((key) => {
          const Icon = icons[key];
          return (
            <Card key={key} className="flex flex-col p-5 transition-shadow hover:shadow-md">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5.5 w-5.5 text-primary" aria-hidden="true" />
              </div>
              <h2 className="text-sm font-semibold">{t(`consumer.cards.${key}.title`)}</h2>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{t(`consumer.cards.${key}.desc`)}</p>
              <div className="mt-4">
                <Button size="sm" variant="outline" onClick={() => askInChat(key)} className="w-full sm:w-auto">
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  {t('consumer.openChat')}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <DisclaimerBanner />
    </div>
  );
}
