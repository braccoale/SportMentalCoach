import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteNav } from '@/components/landing/site-nav';
import { Footer } from '@/components/footer';
import { JsonLd } from '@/components/json-ld';
import { audienceJsonLd, audienceMetadata } from '@/components/landing/audience-paths/audience-seo';
import { ArticleDate, ReadingTime } from '@/components/blog/article-meta';
import { sortArticles } from '@/lib/core/blog';
import { BLOG_ARTICLES } from '@/lib/core/blog/articles';

export const metadata: Metadata = audienceMetadata({
  path: '/blog',
  title: 'Blog di mental coaching sportivo | KaiPai',
  description:
    'Articoli di mental coaching sportivo: ansia da prestazione, concentrazione, motivazione e routine pre-gara, spiegati per atleti, genitori e allenatori.',
  shareTitle: 'Il blog di KaiPai',
  image: '/og/athletes.jpg',
});

export default function BlogPage() {
  const articles = sortArticles(BLOG_ARTICLES);

  return (
    <div className="kp-root flex min-h-screen flex-col bg-kp-ink text-kp-hi">
      <SiteNav />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-7xl px-5 pt-32 pb-20 sm:px-8">
          <h1 className="kp-eyebrow flex items-center gap-3 text-kp-red">
            <span className="h-px w-10 bg-kp-red" aria-hidden />
            Blog · Mental coaching sportivo
          </h1>
          <p className="kp-display mt-5 max-w-3xl text-[clamp(2.25rem,5vw,4.25rem)] leading-[0.98] text-kp-hi">
            Allenare la testa, <span className="text-kp-red">spiegato bene.</span>
          </p>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kp-mid">
            Articoli pratici su pressione, concentrazione, motivazione e routine:
            per chi fa sport, per chi lo accompagna, per chi lo allena.
          </p>

          <ul className="mt-14 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <li key={article.slug}>
                <Link
                  href={`/blog/${article.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-3xl border border-kp-line bg-kp-surface transition-colors hover:border-white/20"
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <Image
                      src={article.image.src}
                      alt={article.image.alt}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-kp-red">
                      {article.tags[0]}
                    </p>
                    <h2 className="mt-3 font-display text-xl font-semibold leading-snug text-kp-hi">
                      {article.title}
                    </h2>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-kp-mid">
                      {article.description}
                    </p>
                    <p className="mt-5 flex items-center justify-between gap-3 text-xs text-kp-mid">
                      <span>
                        <ArticleDate article={article} /> · <ReadingTime article={article} />
                      </span>
                      <ArrowRight className="h-4 w-4 text-kp-red transition-transform group-hover:translate-x-1" aria-hidden />
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <Footer />
      <JsonLd nodes={audienceJsonLd({ name: 'Blog', path: '/blog' })} />
    </div>
  );
}
