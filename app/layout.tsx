import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/db/queries';
import { SWRConfig } from 'swr';
import { GoogleAnalytics } from '@/components/google-analytics';
import { getClientMessages } from '@/lib/i18n/client-messages';
import { JsonLd } from '@/components/json-ld';
import { organizationJsonLd, websiteJsonLd } from '@/lib/core/seo';
import { CANONICAL_APP_URL } from '@/lib/core/site';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Metadata');

  return {
    // Senza questo, ogni `alternates.canonical` e ogni immagine Open Graph
    // dichiarati come percorso relativo nelle pagine figlie resterebbero
    // relativi: un canonical relativo non identifica nulla.
    metadataBase: new URL(CANONICAL_APP_URL),
    title: t('title'),
    description: t('description'),
    other: {
      google: 'notranslate',
    },
  };
}

export const viewport: Viewport = {
  maximumScale: 1
};

const manrope = Manrope({ subsets: ['latin'] });

const googleAnalyticsId =
  process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID?.trim() ||
  (process.env.NODE_ENV === 'production' ? 'G-773FBGVP7J' : null);

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  const clientMessages = getClientMessages(messages);

  return (
    <html
      lang={locale}
      translate="no"
      className={`bg-white dark:bg-gray-950 text-black dark:text-white ${manrope.className}`}
    >
      <body className="notranslate min-h-[100dvh] bg-gray-50">
        {/* L'entita' KaiPai, dichiarata una volta sola: le pagine figlie vi si
            agganciano per @id invece di ridescriverla ognuna a modo suo. */}
        <JsonLd nodes={[organizationJsonLd(), websiteJsonLd()]} />
        <NextIntlClientProvider locale={locale} messages={clientMessages}>
          <SWRConfig
            value={{
              fallback: {
                // We do NOT await here
                // Only components that read this data will suspend
                '/api/user': getSessionUser()
              }
            }}
          >
            {children}
          </SWRConfig>
          {googleAnalyticsId && (
            <GoogleAnalytics measurementId={googleAnalyticsId} />
          )}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
