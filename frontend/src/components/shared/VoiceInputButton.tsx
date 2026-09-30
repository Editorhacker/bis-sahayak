import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, MicOff } from 'lucide-react';
import { useUIStore } from '../../stores';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | null;
}

const langMap: Record<string, string> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };

export function VoiceInputButton({
  onTranscript,
  className,
}: {
  onTranscript: (text: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const language = useUIStore((s) => s.language);
  const [listening, setListening] = useState(false);
  const [supported] = useState(() => !!getRecognitionCtor());
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  if (!supported) {
    return (
      <Button variant="ghost" size="icon" disabled className={cn(className)} title={t('chat.micUnsupported')} aria-label={t('chat.micUnsupported')}>
        <MicOff className="h-5 w-5" aria-hidden="true" />
      </Button>
    );
  }

  const toggle = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = langMap[language] ?? 'en-IN';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      if (last && last[0]) {
        onTranscript(last[0].transcript);
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  return (
    <Button
      variant={listening ? 'default' : 'ghost'}
      size="icon"
      onClick={toggle}
      className={cn(listening && 'bg-destructive hover:bg-destructive/90 text-destructive-foreground animate-pulse', className)}
      title={listening ? t('chat.micListening') : t('chat.mic')}
      aria-label={listening ? t('chat.micListening') : t('chat.mic')}
      aria-pressed={listening}
    >
      <Mic className="h-5 w-5" aria-hidden="true" />
    </Button>
  );
}
