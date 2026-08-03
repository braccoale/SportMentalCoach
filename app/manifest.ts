import type { MetadataRoute } from 'next';

/**
 * PWA web app manifest. Makes KaiPai installable on mobile (Add to Home
 * Screen) — a prerequisite for Web Push on iOS (16.4+), where notifications
 * only work for an installed PWA.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KaiPai — Mental Coaching',
    short_name: 'KaiPai',
    description:
      'Il tuo percorso di mental coaching sportivo: coach verificati, sessioni e videochiamate.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0404',
    theme_color: '#0a0404',
    lang: 'it',
    dir: 'ltr',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
