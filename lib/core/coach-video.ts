/**
 * Come si riproduce il video di presentazione di un coach.
 *
 * Tre casi, decisi dall'indirizzo: un video di YouTube o Vimeo (si incorpora,
 * ma solo dopo un clic, per non mandare a terzi l'indirizzo IP del visitatore
 * prima del suo consenso — vedi `VideoEmbed`), un file caricato sulla
 * piattaforma (si riproduce in pagina), oppure un altro indirizzo (solo un
 * link). Lo usano la scheda del coach e il pannello dell'elenco: una regola
 * sola, non due copie.
 *
 * Modulo puro, senza `server-only`.
 */
export type CoachVideoSource =
  | { kind: 'embed'; src: string; provider: string }
  | { kind: 'file'; src: string }
  | { kind: 'link'; href: string };

/**
 * Converts a YouTube/Vimeo URL to a safe embed URL plus the provider name, or
 * null (link fallback).
 *
 * YouTube embeds use `youtube-nocookie.com`, which skips the tracking cookies
 * the standard domain sets. That alone isn't enough — Google still sees the
 * IP — so the embed is additionally click-to-load via `VideoEmbed`.
 */
export function toEmbed(url: string): { src: string; provider: string } | null {
  const yt = (id: string) => ({
    src: `https://www.youtube-nocookie.com/embed/${id}`,
    provider: 'YouTube',
  });
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1);
      return id ? yt(id) : null;
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname.startsWith('/embed/')) {
        return yt(u.pathname.replace('/embed/', ''));
      }
      const v = u.searchParams.get('v');
      return v ? yt(v) : null;
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return id && /^\d+$/.test(id)
        ? { src: `https://player.vimeo.com/video/${id}`, provider: 'Vimeo' }
        : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Il file caricato sulla piattaforma, se l'indirizzo è di quel tipo. */
export function uploadedVideoSrc(url: string): string | null {
  return url.startsWith('/uploads/') || /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url) ? url : null;
}

/** La sorgente da usare per un indirizzo video, o `null` se il coach non ne ha. */
export function coachVideoSource(url: string | null | undefined): CoachVideoSource | null {
  const value = url?.trim();
  if (!value) return null;
  const embed = toEmbed(value);
  if (embed) return { kind: 'embed', ...embed };
  const file = uploadedVideoSrc(value);
  if (file) return { kind: 'file', src: file };
  return { kind: 'link', href: value };
}
