import Link from 'next/link';
import { SmoothScrollV2 } from '@/components/landing/v2/smooth-scroll';
import { NavV2 } from '@/components/landing/v2/nav';
import { SceneHero } from '@/components/landing/scene-hero';
import { SceneConverge } from '@/components/landing/v2/scene-converge';
import { SceneJourney } from '@/components/landing/v2/scene-journey';
import { SceneCompass } from '@/components/landing/v2/scene-compass';
import { SceneContinuity } from '@/components/landing/v2/scene-continuity';
import { SceneCtaV2 } from '@/components/landing/v2/scene-cta';
import { FooterLinks } from '@/components/landing/footer-links';
import { CookieSettingsButton } from '@/components/google-analytics';

/**
 * Landing v2 — «Una sessione, dal prima al dopo».
 *
 * Sperimentale, non promossa: la home di produzione resta
 * `app/(marketing)/page.tsx` e nessuno dei suoi componenti è stato toccato.
 * Tutto quello che serve a questa pagina vive in `components/landing/v2/` e
 * in `v2.css`, così la promozione — se arriverà — è uno scambio di file, e
 * l'abbandono è una cancellazione di cartella.
 *
 * Sei scene, e una sola cosa da capire per leggerle:
 *
 *   1. l'hero        — quello della home, riusato: stesso componente, non una
 *                      copia, cosi` non possono divergere
 *   2. il confronto  — otto strumenti a sinistra, un posto solo a destra
 *   3. il percorso   — sei tappe su un binario orizzontale, e l'alba
 *   4. il compass    — il report che si scrive da solo
 *   5. la continuità — quattro sedute che si parlano
 *   6. la chiusura   — lo stesso lunedì sera, dall'altra parte
 *
 * Il buio diventa luce dentro la scena 3, al 52% del binario: la stagione
 * della pagina è agganciata all'avanzamento del percorso, non a un'altezza di
 * scroll. Chi torna indietro torna nel buio, ed è il punto.
 *
 * Il pubblico è il coach. La home parla all'atleta, e le due cose non stanno
 * bene nella stessa pagina: la scelta di dove mandare chi è a monte di
 * qualsiasi decisione presa qui dentro.
 */
export default function LandingV2() {
  return (
    <main className="kp2 relative overflow-x-clip">
      <SmoothScrollV2 />
      <NavV2 />

      <SceneHero />
      <SceneConverge />
      <SceneJourney />
      <SceneCompass />
      <SceneContinuity />
      <SceneCtaV2 />

      <SiteFooterV2 />
    </main>
  );
}

/**
 * Il footer torna nel buio.
 *
 * La pagina finisce in luce e questo la chiude: è il margine della fotografia,
 * non un'altra scena. Serve anche a una cosa pratica — le colonne di
 * `FooterLinks` sono scritte per il fondo scuro del prodotto, e riusarle così
 * com'è vale più di riscriverle in chiaro per una pagina sperimentale.
 */
function SiteFooterV2() {
  return (
    <footer className="border-t border-kp-line bg-kp-ink text-kp-hi">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.jpg"
                alt=""
                width={127}
                height={141}
                className="h-8 w-8 rounded-md"
              />
              <span className="font-display text-lg font-semibold">KaiPai</span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-kp-mid">
              La piattaforma dei mental coach dello sport: sedute, videochiamata
              e il percorso che si costruisce da sé.
            </p>
            <p className="mt-4 text-sm text-kp-mid">Genova, Italia</p>
          </div>
          <FooterLinks />
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-kp-line pt-6 text-sm text-kp-low sm:flex-row">
          <p>© {new Date().getFullYear()} KaiPai. Tutti i diritti riservati.</p>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/privacy" className="hover:text-kp-mid">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-kp-mid">
              Termini
            </Link>
            <Link href="/cookie" className="hover:text-kp-mid">
              Cookie
            </Link>
            <CookieSettingsButton className="hover:text-kp-mid" />
          </div>
        </div>
      </div>
    </footer>
  );
}
