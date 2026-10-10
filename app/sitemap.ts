import type { MetadataRoute } from 'next';
import { getApprovedCoaches } from '@/lib/core/listings';
import { eligibleSportPages } from '@/lib/core/sport-pages';
import { getActiveSports } from '@/lib/core/taxonomies';
import { CANONICAL_APP_URL as SITE_URL } from '@/lib/core/site';
import { indexableArticles } from '@/lib/core/blog';
import { BLOG_ARTICLES } from '@/lib/core/blog/articles';

export const revalidate = 3600;

/**
 * Ultima revisione dei contenuti delle pagine pubbliche. Una data scritta a
 * mano e non `new Date()`: una data che cambia a ogni richiesta dice a Google
 * che la pagina cambia sempre, cioè niente. Va aggiornata quando cambiano i
 * testi.
 */
const CONTENT_REVISED = new Date('2026-10-10');

const publicPages: MetadataRoute.Sitemap = [
  {
    url: SITE_URL,
    lastModified: CONTENT_REVISED,
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
    lastModified: CONTENT_REVISED,
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    url: `${SITE_URL}/atleti`,
    lastModified: CONTENT_REVISED,
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    url: `${SITE_URL}/academy`,
    lastModified: CONTENT_REVISED,
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    url: `${SITE_URL}/diventa-coach`,
    lastModified: CONTENT_REVISED,
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    url: `${SITE_URL}/societa`,
    lastModified: CONTENT_REVISED,
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    url: `${SITE_URL}/chi-siamo`,
    lastModified: CONTENT_REVISED,
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    url: `${SITE_URL}/blog`,
    lastModified: CONTENT_REVISED,
    changeFrequency: 'weekly',
    priority: 0.7,
  },
  // Solo gli articoli validati: una bozza si legge ma non si indicizza.
  ...indexableArticles(BLOG_ARTICLES).map((article) => ({
    url: `${SITE_URL}/blog/${article.slug}`,
    lastModified: new Date(article.updatedAt ?? article.publishedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  })),
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
  // Listino leggibile da un agente. Sta in sitemap perche' e' una risorsa
  // pubblica a se' stante, non un doppione della sezione «Pacchetti».
  {
    url: `${SITE_URL}/pricing.md`,
    changeFrequency: 'monthly',
    priority: 0.6,
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

    // Una pagina per sport, solo dove ci sono abbastanza coach (stessa regola della pagina).
    const sportPages: MetadataRoute.Sitemap = eligibleSportPages(
      await getActiveSports(),
      coaches.map((c) => c.categories)
    ).map((page) => ({
      url: `${SITE_URL}/mental-coach/${page.slug}`,
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    return [...publicPages, ...sportPages, ...coachPages];
  } catch (error) {
    // Keep the core sitemap available even during a temporary database outage.
    console.error('Unable to add coach profiles to sitemap', error);
    return publicPages;
  }
}
