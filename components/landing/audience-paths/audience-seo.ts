import type { Metadata } from 'next';
import {
  breadcrumbJsonLd,
  faqJsonLd,
  type FaqEntry,
  type JsonLdNode,
} from '@/lib/core/seo';

/**
 * Metadati e dati strutturati delle cinque pagine percorso, scritti una volta.
 *
 * Il canonical è il percorso stesso (la base assoluta è `metadataBase` nel
 * layout radice). L'immagine di condivisione è un JPG statico in /public/og:
 * la foto della pagina, la sfumatura del brand e il logo, senza testo
 * disegnato — il titolo lo mostra già la piattaforma che condivide.
 */
export function audienceMetadata(input: {
  path: string;
  title: string;
  description: string;
  shareTitle: string;
  shareDescription?: string;
  image: string;
}): Metadata {
  const shareDescription = input.shareDescription ?? input.description;
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: input.path },
    openGraph: {
      title: input.shareTitle,
      description: shareDescription,
      url: input.path,
      type: 'website',
      siteName: 'KaiPai',
      locale: 'it_IT',
      images: [{ url: input.image, width: 1200, height: 630, alt: input.shareTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: input.shareTitle,
      description: shareDescription,
      images: [input.image],
    },
  };
}

/** Briciole (Home › pagina), FAQ se la pagina ne ha, più i nodi specifici. */
export function audienceJsonLd(input: {
  name: string;
  path: string;
  faq?: FaqEntry[];
  extra?: JsonLdNode[];
}): JsonLdNode[] {
  return [
    breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: input.name, path: input.path },
    ]),
    ...(input.faq && input.faq.length > 0 ? [faqJsonLd(input.faq)] : []),
    ...(input.extra ?? []),
  ];
}
