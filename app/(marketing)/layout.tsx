import type { Metadata } from 'next';
import localFont from 'next/font/local';

// Font ospitati nel progetto (vedi app/fonts/README.md): la build non scarica più nulla da Google.
const display = localFont({
  src: '../fonts/space-grotesk-latin-wght-normal.woff2',
  variable: '--font-kp-display',
  weight: '300 700',
  display: 'swap',
});
const body = localFont({
  src: '../fonts/inter-latin-wght-normal.woff2',
  variable: '--font-kp-body',
  weight: '100 900',
  display: 'swap',
});
const mono = localFont({
  src: '../fonts/jetbrains-mono-latin-wght-normal.woff2',
  variable: '--font-kp-mono',
  weight: '100 800',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'KaiPai — Alleni il corpo da sempre. È ora della mente.',
  description:
    'KaiPai è il metodo, la scuola e la rete di coach che allenano la mente di chi fa sport. Perché allenare la testa diventi normale quanto allenare il fisico.',
  openGraph: {
    title: 'KaiPai — È ora di allenare la mente.',
    description:
      'Il metodo, la scuola e la rete di coach che allenano la mente di atleti, squadre e famiglie.',
    type: 'website',
    siteName: 'KaiPai',
    locale: 'it_IT',
    // Immagine di default per le pagine senza una propria (home compresa):
    // senza, un link condiviso usciva senza anteprima.
    images: [{ url: '/og/teams.jpg', width: 1200, height: 630, alt: 'KaiPai' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og/teams.jpg'],
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${display.variable} ${body.variable} ${mono.variable} kp-root min-h-screen`}
    >
      {/* No-JS fallback: reveal animations depend on JS, so ensure content is
          fully visible when JS is unavailable. */}
      <noscript>
        <style>{`.kp-reveal{opacity:1!important;transform:none!important;filter:none!important}`}</style>
      </noscript>
      {children}
    </div>
  );
}
