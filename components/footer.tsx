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
import { useTranslations } from 'next-intl';
import { CookieSettingsButton } from '@/components/google-analytics';

const SOCIALS = [
  { label: 'Instagram', href: 'https://instagram.com/kaipai', Icon: Instagram },
  { label: 'Facebook', href: 'https://facebook.com/kaipai', Icon: Facebook },
  { label: 'LinkedIn', href: 'https://linkedin.com/company/kaipai', Icon: Linkedin },
  { label: 'YouTube', href: 'https://youtube.com/@kaipai', Icon: Youtube },
];

export function Footer() {
  const t = useTranslations('Footer');
  const brand = t('brandName');
  const year = new Date().getFullYear();
  const legalLinks = [
    { href: '/terms', label: t('terms') },
    { href: '/privacy', label: t('privacyPolicy') },
    { href: '/cookie', label: t('cookiePolicy') },
  ];

  return (
    <footer className="mt-auto border-t border-kp-line bg-kp-ink2">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div>
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.jpg" alt="KaiPai" width={127} height={141} className="h-8 w-auto rounded-md" />
            <span className="text-lg font-semibold text-kp-hi">{brand}</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-kp-mid">
            {t('tagline')}
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-kp-hi">{t('contacts')}</h3>
          <ul className="mt-3 space-y-2 text-sm text-kp-mid">
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-kp-low" />
              <a href="mailto:info@kaipaicoaching.com" className="hover:text-kp-hi">
                info@kaipaicoaching.com
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
              <span>{t('location')}</span>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-kp-hi">{t('legal')}</h3>
          <ul className="mt-3 space-y-2 text-sm text-kp-mid">
            {legalLinks.map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className="hover:text-kp-hi">
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <CookieSettingsButton className="hover:text-kp-hi" />
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-kp-hi">{t('followUs')}</h3>
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
          {t('allRightsReserved', { year, brand })}
        </div>
      </div>
    </footer>
  );
}
