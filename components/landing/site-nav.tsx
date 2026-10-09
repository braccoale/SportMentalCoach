'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Menu, PlayCircle, X } from 'lucide-react';
import useSWR from 'swr';
import { SignInModal } from './sign-in-modal';
import { DemoLoginModal } from './demo-login-modal';
import { ContactModal } from './contact-modal';
import { UserMenu } from '@/components/user-menu';
import { UserAvatar } from '@/components/user-avatar';
import { NotificationBell } from '@/components/notification-bell';
import { fetcher } from '@/lib/fetcher';
import type { SessionUser } from '@/lib/auth/session-user';

/**
 * Il menu, raggruppato: erano otto voci in fila, ora sono quattro.
 *
 *  - **Percorsi**: le pagine per chi arriva (atleti, famiglie, società) e per
 *    chi vuole diventare coach;
 *  - **Come funziona**: il metodo, l'ecosistema e l'Academy, cioè il prodotto;
 *  - **Coach**: l'elenco, che è l'azione che porta più lontano, resta a un clic;
 *  - **Risorse**: il blog, chi siamo e i contatti.
 *
 * `contact` non è una pagina ma apre il modulo dei contatti senza perdere il
 * punto in cui si era.
 */
type NavLink = { href: string; label: string } | { contact: true; label: string };
type NavItem = { label: string; href?: string; children?: NavLink[] };

const MENU: NavItem[] = [
  {
    label: 'Percorsi',
    children: [
      { href: '/atleti', label: 'Atleti' },
      { href: '/famiglie', label: 'Famiglie' },
      { href: '/societa', label: 'Società sportive' },
      { href: '/diventa-coach', label: 'Diventa coach' },
    ],
  },
  {
    label: 'Come funziona',
    children: [
      { href: '/#metodo', label: 'Il metodo' },
      { href: '/#ecosistema-atleta', label: 'L’ecosistema' },
      { href: '/academy', label: 'Academy' },
    ],
  },
  { label: 'Coach', href: '/coaches' },
  {
    label: 'Risorse',
    children: [
      { href: '/blog', label: 'Blog' },
      { href: '/chi-siamo', label: 'Chi siamo' },
      { contact: true, label: 'Contatti' },
    ],
  },
];

const linkCls =
  'kp-link-wipe text-base font-medium text-kp-mid transition-colors hover:text-kp-hi';

const panelItemCls =
  'block w-full rounded-lg px-3.5 py-2.5 text-left text-sm font-medium text-kp-mid transition-colors hover:bg-white/5 hover:text-kp-hi focus-visible:bg-white/5 focus-visible:text-kp-hi focus-visible:outline-none';

/**
 * Una voce con sottomenu. Si apre al passaggio del mouse e alla tastiera
 * (`focus-within`), senza stato: il pannello sta attaccato al pulsante da un
 * bordo trasparente, così il puntatore non lo chiude attraversando lo spazio
 * in mezzo.
 */
function NavGroup({
  item,
  onContact,
}: {
  item: NavItem;
  onContact: () => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-haspopup="menu"
        className={`${linkCls} inline-flex items-center gap-1.5`}
      >
        {item.label}
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform group-hover:rotate-180 group-focus-within:rotate-180"
          aria-hidden
        />
      </button>
      <div className="invisible absolute left-1/2 top-full z-10 -translate-x-1/2 pt-3 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <ul
          role="menu"
          className="min-w-[13rem] rounded-2xl border border-kp-line bg-kp-ink/95 p-2 shadow-2xl backdrop-blur-xl"
        >
          {item.children?.map((child) => (
            <li key={child.label} role="none">
              {'contact' in child ? (
                <button type="button" role="menuitem" onClick={onContact} className={panelItemCls}>
                  {child.label}
                </button>
              ) : (
                <Link href={child.href} role="menuitem" className={panelItemCls}>
                  {child.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

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
          {MENU.map((item) =>
            item.children ? (
              <NavGroup key={item.label} item={item} onContact={() => setContactOpen(true)} />
            ) : (
              <Link key={item.label} href={item.href!} className={linkCls}>
                {item.label}
              </Link>
            )
          )}
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
                isDemo={user.isDemo}
              />
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setDemoOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-kp-hi transition-colors hover:border-white/50 hover:bg-white/10"
              >
                <PlayCircle className="h-4 w-4 text-green-500" />
                Demo
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('signin')}
                className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-kp-hi transition-colors hover:border-white/50 hover:bg-white/10"
              >
                Accedi
              </button>
              <Link
                href="/sign-up"
                className="rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
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
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 text-kp-hi"
              >
                <PlayCircle className="h-4 w-4 text-green-500" />
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
        <div className="fixed inset-0 top-16 z-[64] flex flex-col gap-1 overflow-y-auto bg-kp-ink/98 px-5 pb-10 pt-4 backdrop-blur-xl lg:hidden">
          {MENU.map((item) =>
            item.children ? (
              <div key={item.label} className="border-b border-kp-line py-3">
                <p className="kp-eyebrow mb-1 text-[0.65rem] text-kp-low">{item.label}</p>
                {item.children.map((child) =>
                  'contact' in child ? (
                    <button
                      key={child.label}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        setContactOpen(true);
                      }}
                      className="block w-full py-2.5 text-left font-display text-xl text-kp-hi"
                    >
                      {child.label}
                    </button>
                  ) : (
                    <Link
                      key={child.label}
                      href={child.href}
                      onClick={() => setOpen(false)}
                      className="block py-2.5 font-display text-xl text-kp-hi"
                    >
                      {child.label}
                    </Link>
                  )
                )}
              </div>
            ) : (
              <Link
                key={item.label}
                href={item.href!}
                onClick={() => setOpen(false)}
                className="border-b border-kp-line py-4 font-display text-2xl text-kp-hi"
              >
                {item.label}
              </Link>
            )
          )}
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
                  className="rounded-full bg-green-600 px-5 py-3.5 text-center font-semibold text-white transition-colors hover:bg-green-700"
                >
                  Inizia gratis
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setDemoOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 px-5 py-3.5 text-center font-semibold text-kp-hi"
                >
                  <PlayCircle className="h-4 w-4 text-green-500" />
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
