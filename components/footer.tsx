import Link from 'next/link';
import {
  Mail,
  Phone,
  MapPin,
  Instagram,
  Facebook,
  Linkedin,
  Youtube,
} from 'lucide-react';
import { getVerticalConfig, t } from '@/lib/core/config';

const LEGAL_LINKS = [
  { href: '/terms', label: 'Termini e Condizioni' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/cookie', label: 'Cookie Policy' },
];

const SOCIALS = [
  { label: 'Instagram', href: 'https://instagram.com/kaipai', Icon: Instagram },
  { label: 'Facebook', href: 'https://facebook.com/kaipai', Icon: Facebook },
  { label: 'LinkedIn', href: 'https://linkedin.com/company/kaipai', Icon: Linkedin },
  { label: 'YouTube', href: 'https://youtube.com/@kaipai', Icon: Youtube },
];

export function Footer() {
  const config = getVerticalConfig();
  const brand = t('brand.name', config);
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-kp-line bg-kp-ink2">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div>
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.jpg" alt="KaiPai" width={127} height={141} className="h-8 w-auto rounded-md" />
            <span className="text-lg font-semibold text-kp-hi">{brand}</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-kp-mid">
            {t('brand.tagline', config)}
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-kp-hi">Contatti</h3>
          <ul className="mt-3 space-y-2 text-sm text-kp-mid">
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-kp-low" />
              <a href="mailto:info@kaipai.it" className="hover:text-kp-hi">
                info@kaipai.it
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-kp-low" />
              <a href="tel:+393286212598" className="hover:text-kp-hi">
                +39 328 6212598
              </a>
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-kp-low" />
              <span>Genova, Italia</span>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-kp-hi">Legale</h3>
          <ul className="mt-3 space-y-2 text-sm text-kp-mid">
            {LEGAL_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className="hover:text-kp-hi">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-kp-hi">Seguici</h3>
          <div className="mt-3 flex items-center gap-3">
            {SOCIALS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                title={label}
                className="rounded-full border border-kp-line p-2 text-kp-mid transition hover:border-kp-red/50 hover:text-kp-red"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-kp-line">
        <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-kp-low sm:px-6 lg:px-8">
          © {year} {brand}. Tutti i diritti riservati.
        </div>
      </div>
    </footer>
  );
}
