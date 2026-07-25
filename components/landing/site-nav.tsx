'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import useSWR from 'swr';
import { SignInModal } from './sign-in-modal';
import { UserMenu } from '@/components/user-menu';
import { UserAvatar } from '@/components/user-avatar';
import { NotificationBell } from '@/components/notification-bell';
import { fetcher } from '@/lib/fetcher';

type SessionUser = {
  id: number;
  name: string | null;
  lastName?: string | null;
  email: string;
};

const LINKS = [
  { href: '#ecosistema-atleta', label: 'Ecosistema' },
  { href: '#metodo', label: 'Metodo' },
  { href: '#academy', label: 'Academy' },
  { href: '#pacchetti', label: 'Prezzi' },
  { href: '#visione', label: 'Visione' },
  { href: '/coaches', label: 'Coach' },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center" aria-label="KaiPai — home">
      <img
        src="/logo.jpg"
        alt="KaiPai"
        width={127}
        height={141}
        className="h-11 w-auto"
      />
    </Link>
  );
}

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | null>(null);
  const router = useRouter();
  // Shared auth state (root layout seeds `/api/user` into SWR).
  const { data: user } = useSWR<SessionUser | null>('/api/user', fetcher);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
    <header
      className={`fixed inset-x-0 top-0 z-[65] transition-all duration-300 ${
        scrolled
          ? 'border-b border-kp-line bg-kp-ink/80 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Logo />

        <div className="hidden items-center gap-8 lg:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="kp-link-wipe text-base font-medium text-kp-mid transition-colors hover:text-kp-hi"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          {user ? (
            <div className="flex items-center gap-2.5">
              <Link
                href="/dashboard"
                className="text-sm font-medium text-kp-mid transition-colors hover:text-kp-hi"
              >
                {user.name ?? 'Dashboard'}
              </Link>
              <NotificationBell />
              <UserMenu name={[user.name, user.lastName].filter(Boolean).join(' ') || null} email={user.email} />
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAuthMode('signin')}
                className="text-sm font-medium text-kp-mid transition-colors hover:text-kp-hi"
              >
                Accedi
              </button>
              <Link
                href="/sign-up"
                className="kp-cta rounded-full px-4 py-2 text-sm font-semibold text-white"
              >
                Inizia ora
              </Link>
            </>
          )}
        </div>

        {/* Mobile: account entry point stays visible next to the hamburger —
            no need to open the menu to sign in or reach the dashboard. */}
        <div className="flex items-center gap-1.5 lg:hidden">
          {user ? (
            <>
              <NotificationBell />
              {/* Direct link (not the dropdown) so a tap goes straight to the
                  dashboard; sign-out is reachable from inside the dashboard. */}
              <Link href="/dashboard" aria-label="Dashboard">
                <UserAvatar
                  name={[user.name, user.lastName].filter(Boolean).join(' ') || user.email}
                />
              </Link>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setAuthMode('signin')}
              className="rounded-full border border-kp-line px-3.5 py-1.5 text-sm font-medium text-kp-hi"
            >
              Accedi
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-kp-hi"
            aria-label={open ? 'Chiudi menu' : 'Apri menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 top-16 z-[64] flex flex-col gap-1 bg-kp-ink/98 px-5 pt-6 backdrop-blur-xl lg:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="border-b border-kp-line py-4 font-display text-2xl text-kp-hi"
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-6 flex flex-col gap-3">
            {user ? (
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="rounded-full border border-kp-line px-5 py-3.5 text-center font-medium text-kp-hi"
              >
                {user.name ?? 'Dashboard'}
              </Link>
            ) : (
              <>
                <Link
                  href="/sign-up"
                  onClick={() => setOpen(false)}
                  className="kp-cta rounded-full px-5 py-3.5 text-center font-semibold text-white"
                >
                  Inizia ora
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setAuthMode('signin');
                  }}
                  className="rounded-full border border-kp-line px-5 py-3.5 text-center font-medium text-kp-hi"
                >
                  Accedi
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
    <SignInModal
      open={authMode === 'signin'}
      onClose={() => setAuthMode(null)}
      onSwitch={() => {
        setAuthMode(null);
        router.push('/sign-up');
      }}
    />
    </>
  );
}
