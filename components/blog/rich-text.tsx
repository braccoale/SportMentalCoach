import Link from 'next/link';
import { parseInline } from '@/lib/core/blog';

/** Testo di un blocco, con i link interni `[testo](/percorso)` resi come Link. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, i) =>
        part.href ? (
          <Link
            key={i}
            href={part.href}
            className="font-semibold text-kp2-dayhi underline decoration-kp-red decoration-2 underline-offset-4 hover:decoration-4"
          >
            {part.text}
          </Link>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}
