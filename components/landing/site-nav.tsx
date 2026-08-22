'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, PlayCircle, X } from 'lucide-react';
import useSWR from 'swr';
import { SignInModal } from './sign-in-modal';
import { DemoLoginModal } from './demo-login-modal';
import { ContactModal } from './contact-modal';
import { UserMenu } from '@/components/user-menu';
import { UserAvatar } from '@/components/user-avatar';
import { NotificationBell } from '@/components/notification-bell';
import { fetcher } from '@/lib/fetcher';
import type { SessionUser } from '@/lib/auth/session-user';

const LINKS = [
  { href: '#ecosistema-atleta', label: 'Ecosistema' },
  { href: '#metodo', label: 'Metodo' },
  { href: '#academy', label: 'Academy' },
  { href: '#pacchetti', label: 'Prezzi' },
  { href: '#visione', label: 'Visione' },
  { href: '/coaches', label: 'Coach' },
];

const linkCls =
  'kp-link-wipe text-base font-medium text-kp-mid transition-colors hover:text-kp-hi';

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
  const [contactOpen, setContactOpen] = useState(false);
  /**
   * La demo si apre da qui e non da una pagina a sé.
   *
   * È il primo gesto che chiede a un visitatore di provare invece di leggere,
   * e sta accanto ad «Accedi» perché è quello: un modo di entrare, non una
   * sezione del sito. Il modulo lo lascia scegliere se guardare da atleta o da
   * coach — le due esperienze non si somigliano, e mostrarne una sola
   * significherebbe far giudicare il prodotto a metà.
   */
  const [demoOpen, setDemoOpen] = useState(false);
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
            <Link key={l.href} href={l.href} className={linkCls}>
              {l.label}
            </Link>
          ))}
          {/* Contatti apre il form invece di puntare a una pagina: la
              richiesta si scrive senza perdere il punto in cui si era. */}
          <button
            type="button"
            onClick={() => setContactOpen(true)}
            className={linkCls}
          >
            Contatti
          </button>
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
              <UserMenu
                name={[user.name, user.lastName].filter(Boolean).join(' ') || null}
                email={user.email}
                avatarUrl={user.avatarUrl}
              />
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setDemoOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-kp-red/50 px-4 py-2 text-sm font-semibold text-kp-hi transition-colors hover:border-kp-red hover:bg-kp-red/10"
              >
                <PlayCircle className="h-4 w-4 text-kp-red" />
                Demo
              </button>
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
                Inizia gratis
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
                  src={user.avatarUrl}
                />
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setDemoOpen(true)}
                aria-label="Apri demo"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-kp-red/50 text-kp-red"
              >
                <PlayCircle className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('signin')}
                className="rounded-full border border-kp-line px-3.5 py-1.5 text-sm font-medium text-kp-hi"
              >
                Accedi
              </button>
            </>
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
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setContactOpen(true);
            }}
            className="border-b border-kp-line py-4 text-left font-display text-2xl text-kp-hi"
          >
            Contatti
          </button>
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
                  Inizia gratis
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setDemoOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-kp-red/50 px-5 py-3.5 text-center font-semibold text-kp-hi"
                >
                  <PlayCircle className="h-4 w-4 text-kp-red" />
                  Prova la Demo
                </button>
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
    <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    <DemoLoginModal open={demoOpen} onClose={() => setDemoOpen(false)} />
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
