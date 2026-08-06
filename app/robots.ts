import type { MetadataRoute } from 'next';

const SITE_URL = 'https://www.kaipaicoaching.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/auth/',
        '/dashboard/',
        '/invita/',
        '/onboarding/',
        '/pricing',
        '/reset-password/',
        '/sign-in',
        '/sign-up',
        '/tutore/',
        '/video/',
      ],
    },
    host: SITE_URL,
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
