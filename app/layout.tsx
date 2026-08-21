import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/db/queries';
import { SWRConfig } from 'swr';
import { GoogleAnalytics } from '@/components/google-analytics';
import { getClientMessages } from '@/lib/i18n/client-messages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Metadata');

  return {
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
