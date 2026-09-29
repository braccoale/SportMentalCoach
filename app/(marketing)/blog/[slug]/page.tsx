import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, CircleAlert } from 'lucide-react';
import { SiteNav } from '@/components/landing/site-nav';
import { Footer } from '@/components/footer';
import { JsonLd } from '@/components/json-ld';
import { RichText } from '@/components/blog/rich-text';
import { ArticleDate, ReadingTime } from '@/components/blog/article-meta';
import { AUDIENCE_PRIMARY_CTA } from '@/components/landing/audience-paths/audience-page-hero';
import { findArticle, tableOfContents, type BlogBlock } from '@/lib/core/blog';
import { BLOG_ARTICLES } from '@/lib/core/blog/articles';
import { articleJsonLd, breadcrumbJsonLd, faqJsonLd } from '@/lib/core/seo';

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return BLOG_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const article = findArticle(BLOG_ARTICLES, (await params).slug);
  if (!article) return {};
  const path = `/blog/${article.slug}`;
  return {
    title: `${article.seoTitle} | KaiPai`,
    description: article.description,
    alternates: { canonical: path },
    // Finché Francesco non l'ha validato, l'articolo si legge ma non si
    // indicizza (vedi `reviewed` in lib/core/blog).
    robots: article.reviewed ? undefined : { index: false, follow: true },
    openGraph: {
      title: article.title,
      description: article.description,
      url: path,
      type: 'article',
      siteName: 'KaiPai',
      locale: 'it_IT',
      publishedTime: article.publishedAt,
      authors: [article.author.name],
      images: [{ url: article.image.og, width: 1200, height: 630, alt: article.image.alt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.description,
      images: [article.image.og],
    },
  };
}

function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case 'h2':
      return (
        <h2
          id={block.id}
          className="mt-14 scroll-mt-28 font-display text-[clamp(1.5rem,3vw,2rem)] font-semibold leading-tight text-kp2-dayhi"
        >
          {block.text}
        </h2>
      );
    case 'h3':
      return (
        <h3 className="mt-8 font-display text-lg font-semibold text-kp2-dayhi">{block.text}</h3>
      );
    case 'list':
      return (
        <ul className="mt-5 space-y-3">
          {block.items.map((item) => (
            <li key={item} className="flex gap-3 text-[1.0625rem] leading-relaxed text-kp2-daymid">
              <span className="mt-3 h-1 w-3 shrink-0 bg-kp-red" aria-hidden />
              <span>
                <RichText text={item} />
              </span>
            </li>
          ))}
        </ul>
      );
    case 'callout':
      return (
        <aside className="mt-6 flex gap-4 rounded-2xl border-l-4 border-kp-red bg-white p-5 shadow-sm">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-kp-red" aria-hidden />
          <div>
            <p className="font-display font-semibold text-kp2-dayhi">{block.title}</p>
            <p className="mt-1 leading-relaxed text-kp2-daymid">
              <RichText text={block.text} />
            </p>
          </div>
        </aside>
      );
    default:
      return (
        <p className="mt-5 text-[1.0625rem] leading-relaxed text-kp2-daymid">
          <RichText text={block.text} />
        </p>
      );
  }
}

export default async function BlogArticlePage({ params }: { params: Promise<Params> }) {
  const article = findArticle(BLOG_ARTICLES, (await params).slug);
  if (!article) notFound();
  const path = `/blog/${article.slug}`;
  const toc = tableOfContents(article);

  return (
    <div className="kp-root flex min-h-screen flex-col bg-kp-ink text-kp-hi">
      <SiteNav />

      <main className="flex-1">
        <article>
          <header className="mx-auto w-full max-w-5xl px-5 pt-32 sm:px-8">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-sm font-medium text-kp-mid transition-colors hover:text-kp-hi"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Blog
            </Link>
            <ul className="mt-6 flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full border border-kp-line px-3 py-1 text-xs font-medium text-kp-mid"
                >
                  {tag}
                </li>
              ))}
            </ul>
            <h1 className="kp-display mt-5 max-w-4xl text-[clamp(2rem,4.6vw,3.75rem)] leading-[1.02] text-kp-hi">
              {article.title}
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-kp-mid">
              {article.description}
            </p>
            <p className="mt-6 text-sm text-kp-mid">
              di{' '}
              <Link href={article.author.href} className="font-semibold text-kp-hi hover:underline">
                {article.author.name}
              </Link>{' '}
              · <ArticleDate article={article} /> · <ReadingTime article={article} />
            </p>
            <div className="relative mt-10 aspect-[16/9] overflow-hidden rounded-3xl">
              <Image
                src={article.image.src}
                alt={article.image.alt}
                fill
                priority
                sizes="(min-width: 1024px) 64rem, 100vw"
                className="object-cover"
              />
            </div>
          </header>

          <div className="mt-[-6rem] bg-kp2-day2 pt-32 pb-20">
            <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
              {toc.length > 2 ? (
                <nav
                  aria-label="In questo articolo"
                  className="rounded-2xl border border-kp2-dayline bg-white p-5"
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-kp2-daymid">
                    In questo articolo
                  </p>
                  <ol className="mt-3 space-y-1.5">
                    {toc.map((item) => (
                      <li key={item.id}>
                        <a
                          href={`#${item.id}`}
                          className="text-sm font-medium text-kp2-dayhi hover:text-kp-red"
                        >
                          {item.text}
                        </a>
                      </li>
                    ))}
                  </ol>
                </nav>
              ) : null}

              {article.blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}

              {article.faq && article.faq.length > 0 ? (
                <section className="mt-14">
                  <h2 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-semibold text-kp2-dayhi">
                    Domande frequenti
                  </h2>
                  <div className="mt-5 divide-y divide-kp2-dayline border-y border-kp2-dayline">
                    {article.faq.map((f) => (
                      <details key={f.q} className="group">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-display font-semibold text-kp2-dayhi [&::-webkit-details-marker]:hidden">
                          {f.q}
                          <ArrowRight
                            className="h-4 w-4 shrink-0 text-kp-red transition-transform group-open:rotate-90"
                            aria-hidden
                          />
                        </summary>
                        <p className="mb-4 border-l-2 border-kp-red pl-5 leading-relaxed text-kp2-daymid">
                          {f.a}
                        </p>
                      </details>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="mt-14 flex flex-col items-start gap-5 rounded-3xl bg-kp-ink p-8 text-kp-hi sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-display text-xl font-semibold">
                    Vuoi allenare la testa con un mental coach?
                  </p>
                  <p className="mt-1 text-sm text-kp-mid">
                    La prima sessione conoscitiva è gratuita, in videochiamata.
                  </p>
                </div>
                <Link href={article.related.href} className={`${AUDIENCE_PRIMARY_CTA} shrink-0`}>
                  {article.related.label}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>
          </div>
        </article>
      </main>

      <Footer />
      <JsonLd
        nodes={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Blog', path: '/blog' },
            { name: article.title, path },
          ]),
          articleJsonLd({
            path,
            title: article.title,
            description: article.description,
            image: article.image.og,
            publishedAt: article.publishedAt,
            updatedAt: article.updatedAt,
            authorName: article.author.name,
            authorPath: article.author.href,
            keywords: article.tags,
          }),
          ...(article.faq && article.faq.length > 0 ? [faqJsonLd(article.faq)] : []),
        ]}
      />
    </div>
  );
}
