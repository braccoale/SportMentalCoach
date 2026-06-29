import Link from 'next/link';
import {
  CircleIcon,
  Mail,
  Phone,
  MapPin,
  Instagram,
  Facebook,
  Linkedin,
  Youtube,
} from 'lucide-react';
import { getVerticalConfig, t } from '@/lib/core/config';

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
    <footer className="mt-auto border-t border-gray-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-3 lg:px-8">
        <div>
          <Link href="/" className="flex items-center">
            <CircleIcon className="h-6 w-6 text-orange-500" />
            <span className="ml-2 text-lg font-semibold text-gray-900">
              {brand}
            </span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-gray-500">
            {t('brand.tagline', config)}
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-900">Contatti</h3>
          <ul className="mt-3 space-y-2 text-sm text-gray-500">
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-400" />
              <a href="mailto:info@kaipai.com" className="hover:text-gray-900">
                info@kaipai.com
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-gray-400" />
              <a href="tel:+390212345678" className="hover:text-gray-900">
                +39 02 1234 5678
              </a>
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-400" />
              <span>Milano, Italia</span>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-900">Seguici</h3>
          <div className="mt-3 flex items-center gap-3">
            {SOCIALS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                title={label}
                className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:border-orange-300 hover:text-orange-500"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100">
        <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-gray-400 sm:px-6 lg:px-8">
          © {year} {brand}. Tutti i diritti riservati.
        </div>
      </div>
    </footer>
  );
}
