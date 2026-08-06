import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { getSessionUser } from '@/lib/db/queries';
import { SWRConfig } from 'swr';
import { GoogleAnalytics } from '@/components/google-analytics';

export const metadata: Metadata = {
  title: 'KaiPai — Coaching mentale per atleti e squadre',
  description:
    'KaiPai: trova il tuo mental coach e richiedi una sessione. Coaching mentale per atleti, coach e club.',
  other: {
    google: 'notranslate'
  }
};

export const viewport: Viewport = {
  maximumScale: 1
};

const manrope = Manrope({ subsets: ['latin'] });

const googleAnalyticsId =
  process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID?.trim() ||
  (process.env.NODE_ENV === 'production' ? 'G-773FBGVP7J' : null);

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="it"
      translate="no"
      className={`bg-white dark:bg-gray-950 text-black dark:text-white ${manrope.className}`}
    >
      <body className="notranslate min-h-[100dvh] bg-gray-50">
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
      </body>
    </html>
  );
}
