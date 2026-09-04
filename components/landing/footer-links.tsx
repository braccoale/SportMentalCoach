'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ContactModal } from './contact-modal';

/**
 * Colonne di navigazione del footer.
 *
 * Erano `<span>` che si comportavano da link — cursore a mano, hover che si
 * accende — e non portavano da nessuna parte. Ogni voce ora ha una
 * destinazione reale; "Contatti" apre il popup del form invece di rimandare a
 * una pagina che non esiste.
 */
const COLUMNS: {
  h: string;
  links: { label: string; href?: string; action?: 'contact' }[];
}[] = [
  {
    h: 'Inizia',
    links: [
      { label: 'Trova la tua guida', href: '/coaches' },
      { label: 'Come funziona', href: '/#ecosistema-atleta' },
    ],
  },
  {
    h: 'Metodo',
    links: [
      { label: 'I 4 muscoli', href: '/#metodo' },
      { label: 'Academy', href: '/#academy' },
      { label: 'Perché oggi', href: '/#perche-oggi' },
    ],
  },
  {
    h: 'Per chi',
    links: [
      { label: 'Atleti', href: '/#per-chi' },
      { label: 'Famiglie', href: '/famiglie' },
      { label: 'Coach', href: '/coaches' },
      { label: 'Società', href: '/#per-chi' },
    ],
  },
  {
    h: 'Azienda',
    links: [
      { label: 'Origine', href: '/#origine' },
      { label: 'Movimento', href: '/#visione' },
      { label: 'Contatti', action: 'contact' },
    ],
  },
];

const linkCls = 'text-sm text-kp-mid transition-colors hover:text-kp-hi';

export function FooterLinks() {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <>
      {COLUMNS.map((c) => (
        <div key={c.h}>
          <p className="kp-eyebrow text-kp-low">{c.h}</p>
          <ul className="mt-4 space-y-2.5">
            {c.links.map((l) => (
              <li key={l.label}>
                {l.href ? (
                  <Link href={l.href} className={linkCls}>
                    {l.label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setContactOpen(true)}
                    className={linkCls}
                  >
                    {l.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </>
  );
}
