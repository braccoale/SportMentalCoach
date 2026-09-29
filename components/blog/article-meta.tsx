import type { BlogArticle } from '@/lib/core/blog';
import { readingMinutes } from '@/lib/core/blog';

const dateFormat = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Rome',
});

/** Data di pubblicazione leggibile, con `<time>` per i motori. */
export function ArticleDate({ article }: { article: BlogArticle }) {
  return (
    <time dateTime={article.publishedAt}>
      {dateFormat.format(new Date(`${article.publishedAt}T12:00:00Z`))}
    </time>
  );
}

export function ReadingTime({ article }: { article: BlogArticle }) {
  return <span>{readingMinutes(article)} min di lettura</span>;
}
