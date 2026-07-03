import type { Metadata } from 'next';
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';

const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-kp-display',
  weight: ['500', '600', '700'],
});
const body = Inter({ subsets: ['latin'], variable: '--font-kp-body' });
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-kp-mono',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Kai Pai — Alleni il corpo da sempre. È ora della mente.',
  description:
    'Kai Pai è il metodo, la scuola e la rete di coach che allenano la mente di chi fa sport. Perché allenare la testa diventi normale quanto allenare il fisico.',
  openGraph: {
    title: 'Kai Pai — È ora di allenare la mente.',
    description:
      'Il metodo, la scuola e la rete di coach che allenano la mente di atleti, squadre e famiglie.',
    type: 'website',
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
