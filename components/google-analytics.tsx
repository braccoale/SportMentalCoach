'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  analyticsConsentCookie,
  readAnalyticsConsent,
  type AnalyticsConsent,
} from '@/lib/core/analytics-consent';

const OPEN_COOKIE_SETTINGS_EVENT = 'kp:open-cookie-settings';
const ANALYTICS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

function gtag(...args: unknown[]) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || ((...command) => window.dataLayer!.push(command));
  window.gtag(...args);
}

function removeGoogleAnalyticsCookies(measurementId: string) {
  const names = ['_ga', `_ga_${measurementId.replace(/^G-/, '')}`];
  const domains = [undefined, location.hostname, `.${location.hostname}`];

  for (const name of names) {
    for (const domain of domains) {
      document.cookie = [
        `${name}=`,
        'Path=/',
        'Max-Age=0',
        'SameSite=Lax',
        domain ? `Domain=${domain}` : null,
        location.protocol === 'https:' ? 'Secure' : null,
      ]
        .filter(Boolean)
        .join('; ');
    }
  }
}

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}

export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openCookieSettings} className={className}>
      Preferenze cookie
    </button>
  );
}

export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const configured = useRef(false);
  const lastTrackedPath = useRef<string | null>(null);
  const [consent, setConsent] = useState<AnalyticsConsent | null | undefined>(
    undefined
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  const validMeasurementId = /^G-[A-Z0-9]+$/.test(measurementId);

  useEffect(() => {
    setConsent(readAnalyticsConsent(document.cookie));

    const openSettings = () => setSettingsOpen(true);
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
  }, []);

  useEffect(() => {
    if (consent !== 'granted' || !validMeasurementId || configured.current) {
      return;
    }

    window[`ga-disable-${measurementId}`] = false;
    gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    gtag('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    gtag('set', 'ads_data_redaction', true);
    gtag('js', new Date());
    gtag('config', measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: ANALYTICS_COOKIE_MAX_AGE_SECONDS,
      cookie_update: false,
      page_path: pathname,
    });

    const scriptId = 'kaipai-google-analytics';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      document.head.appendChild(script);
    }

    configured.current = true;
    lastTrackedPath.current = pathname;
  }, [consent, measurementId, pathname, validMeasurementId]);

  useEffect(() => {
    if (
      consent !== 'granted' ||
      !configured.current ||
      pathname === lastTrackedPath.current
    ) {
      return;
    }

    gtag('event', 'page_view', {
      page_path: pathname,
      page_location: `${location.origin}${pathname}`,
      page_title: document.title,
    });
    lastTrackedPath.current = pathname;
  }, [consent, pathname]);

  function choose(nextConsent: AnalyticsConsent) {
    document.cookie = analyticsConsentCookie(
      nextConsent,
      location.protocol === 'https:'
    );

    if (nextConsent === 'denied') {
      window.gtag?.('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });
      window[`ga-disable-${measurementId}`] = true;
      removeGoogleAnalyticsCookies(measurementId);
    }

    setConsent(nextConsent);
    setSettingsOpen(false);
  }

  if (!validMeasurementId || consent === undefined) return null;
  if (consent !== null && !settingsOpen) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-consent-title"
        className="relative mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-5 text-gray-700 shadow-2xl sm:p-6"
      >
        <button
          type="button"
          onClick={() => choose('denied')}
          aria-label="Chiudi e continua senza cookie analytics"
          className="absolute right-3 top-3 rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
        >
          <X className="size-5" />
        </button>

        <h2 id="cookie-consent-title" className="pr-10 text-lg font-semibold text-gray-950">
          Cookie e misurazione del sito
        </h2>
        <p className="mt-2 text-sm leading-6">
          Usiamo cookie tecnici necessari al funzionamento. Con il tuo consenso,
          Google Analytics ci aiuta a capire in forma aggregata come viene usato
          KaiPai. Non usiamo questi dati per pubblicità o profilazione.
        </p>
        <p className="mt-1 text-sm">
          Puoi cambiare scelta in qualsiasi momento. Leggi la{' '}
          <Link href="/cookie" className="font-medium text-blue-800 underline">
            Cookie Policy
          </Link>
          .
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => choose('denied')}
            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
          >
            Continua senza analytics
          </button>
          <button
            type="button"
            onClick={() => choose('granted')}
            className="rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"
          >
            Accetta analytics
          </button>
        </div>
      </section>
    </div>
  );
}
