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
  title: 'KaiPai — Alleni il corpo da sempre. È ora della mente.',
  description:
    'KaiPai è il metodo, la scuola e la rete di coach che allenano la mente di chi fa sport. Perché allenare la testa diventi normale quanto allenare il fisico.',
  openGraph: {
    title: 'KaiPai — È ora di allenare la mente.',
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
      {/* No-JS fallback: le animazioni dipendono dal JavaScript, quindi senza
          di esso il contenuto dev'essere comunque tutto visibile. La classe
          `kp-no-js` fa tornare la scena 2 al suo elenco statico (le regole
          stanno in globals.css, accanto a quelle di reduced-motion). */}
      <noscript>
        <style>{`.kp-reveal{opacity:1!important;transform:none!important;filter:none!important}`}</style>
        <style>{`.kp-scene-mind{height:auto!important;min-height:0!important;padding-block:6rem!important}.kp-scene-stack{min-height:0!important;gap:1.25rem!important}.kp-scene-stack>p{position:relative!important;inset:auto!important;opacity:1!important;visibility:visible!important}`}</style>
        <style>{`.kp-scene-founder{height:auto!important;min-height:0!important;padding-block:6rem!important}.kp-scene-founder [data-eyebrow],.kp-scene-founder .kp-founder{opacity:1!important}.kp-scene-founder .kp-quote span{transform:none!important}`}</style>
      </noscript>
      {children}
    </div>
  );
}
