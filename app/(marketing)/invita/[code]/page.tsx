import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BrainCircuit, CheckCircle2 } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import {
  buildInviteUrl,
  normaliseCode,
  resolvePublicInvite,
} from '@/lib/core/referrals';
import { InviteTracking } from './invite-tracking';
import { SignupCta } from './signup-cta';

const SUBTITLE = 'Trova il mental coach più adatto ai tuoi obiettivi sportivi.';
const OG_IMAGE = '/cta-athlete.jpg';

const NEEDS = [
  'Gestire l’ansia',
  'Migliorare la concentrazione',
  'Ritrovare motivazione',
  'Tornare dopo un infortunio',
  'Costruire una routine pre-gara',
];

function inviteTitle(name: string | null): string {
  return name
    ? `${name} ti invita a scoprire KaiPai`
    : 'Un amico ti invita a scoprire KaiPai';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code: raw } = await params;
  const code = normaliseCode(raw);
  const { valid, inviterFirstName } = await resolvePublicInvite(code);
  const title = inviteTitle(valid ? inviterFirstName : null);
  const base = process.env.BASE_URL ?? 'http://localhost:3000';

  return {
    metadataBase: new URL(base),
    title,
    description: SUBTITLE,
    alternates: { canonical: `/invita/${code}` },
    openGraph: {
      type: 'website',
      title,
      description: SUBTITLE,
      url: buildInviteUrl(code, base),
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'KaiPai' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: SUBTITLE,
      images: [OG_IMAGE],
    },
    // Invalid/personal links shouldn't be indexed; OG previews still work.
    robots: valid ? undefined : { index: false, follow: true },
  };
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: raw } = await params;
  const code = normaliseCode(raw);
  const [{ valid, inviterFirstName }, user] = await Promise.all([
    resolvePublicInvite(code),
    getUser(),
  ]);

  const name = valid ? inviterFirstName : null;
  // Even an invalid code never blocks signup: we still send the visitor to the
  // normal flow (attribution simply no-ops server-side for a bad code).
  const signupHref = `/sign-up?ref=${encodeURIComponent(code)}`;

  return (
    <main className="kp-grain relative flex min-h-svh flex-col overflow-hidden bg-kp-ink">
      {/* Ambient brand glow + subtle hero image, same identity as the landing. */}
      <div className="kp-red-glow absolute -top-24 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 opacity-50" />

      {/* Minimal header */}
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label="KaiPai — home">
          <img src="/logo.jpg" alt="KaiPai" className="h-8 w-8 rounded-md" />
          <span className="font-display text-lg font-semibold text-kp-hi">
            KaiPai
          </span>
        </Link>
        {user ? (
          <Link href="/dashboard" className="text-sm text-kp-mid hover:text-kp-hi">
            La tua dashboard
          </Link>
        ) : (
          <Link href="/sign-in" className="text-sm text-kp-mid hover:text-kp-hi">
            Accedi
          </Link>
        )}
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-12 text-center sm:px-8">
        <p className="kp-eyebrow text-kp-red">
          <span className="inline-flex items-center gap-2">
            <BrainCircuit className="h-4 w-4" /> Allena la mente
          </span>
        </p>
        <h1 className="kp-display mt-5 text-[clamp(2rem,6vw,3.6rem)] leading-tight text-kp-hi">
          {inviteTitle(name)}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-kp-mid">
          {SUBTITLE}
        </p>

        <ul className="mx-auto mt-9 grid max-w-lg gap-2.5 text-left sm:grid-cols-2">
          {NEEDS.map((n) => (
            <li
              key={n}
              className="flex items-center gap-3 rounded-xl border border-kp-line bg-white/[0.02] px-4 py-3 text-kp-hi"
            >
              <CheckCircle2 className="h-5 w-5 shrink-0 text-kp-verify" />
              <span className="text-sm">{n}</span>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-col items-center gap-4">
          {user ? (
            <Link
              href="/dashboard"
              className="kp-cta group inline-flex items-center gap-2 rounded-full px-8 py-4 font-semibold text-white"
            >
              Vai alla dashboard
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          ) : (
            <SignupCta href={signupHref} />
          )}
          <p className="text-xs text-kp-low">
            Registrazione gratuita · nessuna carta richiesta
          </p>
        </div>
      </section>

      {/* Only record analytics/opens for a real, resolvable code. */}
      {valid && <InviteTracking code={code} />}
    </main>
  );
}
