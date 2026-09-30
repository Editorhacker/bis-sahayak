import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MessageSquare,
  Map,
  FileText,
  FlaskConical,
  ShieldQuestion,
  LogOut,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '../../stores';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const publicNav = [
  { to: '/standards', labelKey: 'nav.standards', icon: FileText },
  { to: '/labs', labelKey: 'nav.labs', icon: FlaskConical },
  { to: '/consumer', labelKey: 'nav.consumer', icon: ShieldQuestion },
];

const userNav = [
  { to: '/chat', labelKey: 'nav.chat', icon: MessageSquare },
  { to: '/roadmap', labelKey: 'nav.roadmap', icon: Map },
  { to: '/applications', labelKey: 'nav.applications', icon: FileText },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuthStore();

  const navItems = [...(isAuthenticated ? userNav : []), ...publicNav];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold text-foreground shrink-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="hidden sm:inline">{t('app.name')}</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 flex-1 ml-4" aria-label="Main">
            {navItems.map(({ to, labelKey, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {t(labelKey)}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher compact className="hidden sm:flex" />
            {isAuthenticated ? (
              <div className="hidden md:flex items-center gap-2">
                <span className="text-xs text-muted-foreground max-w-[120px] truncate">{user?.name}</span>
                <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground">
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  {t('nav.logout')}
                </Button>
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/login">{t('nav.login')}</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/register">{t('nav.register')}</Link>
                </Button>
              </div>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? t('nav.close') : t('nav.menu')}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t md:hidden p-4 space-y-1 animate-slide-down" role="navigation" aria-label="Mobile">
            {navItems.map(({ to, labelKey, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium',
                    isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                  )
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {t(labelKey)}
              </NavLink>
            ))}
            <div className="flex items-center justify-between gap-2 pt-3 mt-2 border-t">
              <LanguageSwitcher compact />
              {isAuthenticated ? (
                <Button variant="outline" size="sm" onClick={() => { logout(); setMobileOpen(false); }}>
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  {t('nav.logout')}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/login" onClick={() => setMobileOpen(false)}>{t('nav.login')}</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link to="/register" onClick={() => setMobileOpen(false)}>{t('nav.register')}</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1" key={location.pathname}>
        {children}
      </main>

      <footer className="border-t py-6">
        <div className="mx-auto max-w-7xl px-4 text-center text-xs text-muted-foreground space-y-1">
          <p>{t('chat.disclaimer')}</p>
          <p>{t('app.name')} · {t('app.tagline')}</p>
        </div>
      </footer>
    </div>
  );
}
