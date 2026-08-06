import type { MetadataRoute } from 'next';
import { getApprovedCoaches } from '@/lib/core/listings';

const SITE_URL = 'https://www.kaipaicoaching.com';

export const revalidate = 3600;

const publicPages: MetadataRoute.Sitemap = [
  {
    url: SITE_URL,
    changeFrequency: 'weekly',
    priority: 1,
  },
  {
    url: `${SITE_URL}/coaches`,
    changeFrequency: 'daily',
    priority: 0.9,
  },
  {
    url: `${SITE_URL}/famiglie`,
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    url: `${SITE_URL}/privacy`,
    changeFrequency: 'yearly',
    priority: 0.2,
  },
  {
    url: `${SITE_URL}/terms`,
    changeFrequency: 'yearly',
    priority: 0.2,
  },
  {
    url: `${SITE_URL}/cookie`,
    changeFrequency: 'yearly',
    priority: 0.2,
  },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const coaches = await getApprovedCoaches();
    const coachPages: MetadataRoute.Sitemap = coaches.map(({ slug }) => ({
      url: `${SITE_URL}/coaches/${encodeURIComponent(slug)}`,
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    return [...publicPages, ...coachPages];
  } catch (error) {
    // Keep the core sitemap available even during a temporary database outage.
    console.error('Unable to add coach profiles to sitemap', error);
    return publicPages;
  }
}
