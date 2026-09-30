import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Sparkles, LogIn, UserPlus, ArrowRight } from 'lucide-react';
import { authApi, setAccessToken } from '../../services/api';
import { useAuthStore } from '../../stores';
import { Button } from '../../components/ui/button';
import { Input, Label } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: LoginForm) => {
    setServerError(null);
    setLoading(true);
    try {
      const res = await authApi.login(values.email, values.password);
      if (res.success && res.data) {
        const data = res.data as unknown as { accessToken: string; user?: { id: string; email: string; name: string } };
        setAccessToken(data.accessToken);
        setUser(data.user ?? { id: '', email: values.email, name: values.email });
        navigate('/chat');
      } else {
        setServerError(res.error?.code === 'VALIDATION_ERROR' ? t('auth.invalidCredentials') : t('auth.error'));
      }
    } catch {
      setServerError(t('auth.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title={t('auth.loginTitle')} icon={<LogIn className="h-5 w-5" />}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input id="email" type="email" autoComplete="email" required {...register('email')} aria-invalid={!!errors.email} />
          {errors.email && <p className="text-xs text-destructive">{t('errors.VALIDATION_ERROR')}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">{t('auth.password')}</Label>
          <Input id="password" type="password" autoComplete="current-password" required {...register('password')} aria-invalid={!!errors.password} />
        </div>

        {serverError && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {serverError}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t('common.loading') : t('auth.login')}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>

        <Button type="button" variant="ghost" className="w-full" onClick={() => navigate('/chat')}>
          {t('auth.continueAnon')}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {t('auth.noAccount')}{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          {t('auth.register')}
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (values: RegisterForm) => {
    setServerError(null);
    setLoading(true);
    try {
      const res = await authApi.register(values.email, values.password, values.name);
      if (res.success && res.data) {
        const data = res.data as unknown as { accessToken: string; user?: { id: string; email: string; name: string } };
        setAccessToken(data.accessToken);
        setUser(data.user ?? { id: '', email: values.email, name: values.name });
        navigate('/chat');
      } else {
        setServerError(res.error?.message ?? t('auth.error'));
      }
    } catch {
      setServerError(t('auth.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title={t('auth.registerTitle')} icon={<UserPlus className="h-5 w-5" />}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">{t('auth.name')}</Label>
          <Input id="name" autoComplete="name" required {...register('name')} aria-invalid={!!errors.name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input id="email" type="email" autoComplete="email" required {...register('email')} aria-invalid={!!errors.email} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">{t('auth.password')}</Label>
          <Input id="password" type="password" autoComplete="new-password" required {...register('password')} aria-invalid={!!errors.password} />
          {errors.password && <p className="text-xs text-destructive">Minimum 8 characters</p>}
        </div>

        {serverError && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {serverError}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t('common.loading') : t('auth.register')}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {t('auth.hasAccount')}{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t('auth.login')}
        </Link>
      </p>
    </AuthShell>
  );
}

function AuthShell({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-gradient-to-b from-primary/5 to-background px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          {t('app.name')}
        </Link>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              {icon}
            </div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{t('app.tagline')}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
