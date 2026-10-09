'use client';

import { useState } from 'react';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RatingStars } from '@/components/rating-stars';

type ReviewItem = {
  id: number;
  rating: number;
  body: string | null;
  createdAt: string;
  authorName: string;
  verified: boolean;
  reply: string | null;
};

type Loaded = { average: number | null; count: number; reviews: ReviewItem[] };

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));

/**
 * Le stelline con il voto: un pulsante che apre le recensioni del coach in una
 * finestra. Le recensioni si caricano quando la finestra si apre, non con
 * l'elenco. Lo stesso pulsante serve nella scheda e nel pannello dei dettagli.
 *
 * Non è dentro un link: il pulsante in un `<a>` sarebbe HTML non valido, e il
 * clic aprirebbe anche la scheda.
 */
export function CoachReviewsDialog({
  slug,
  coachName,
  average,
  count,
}: {
  slug: string;
  coachName: string;
  average: number | null;
  count: number;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (data || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/coaches/${slug}/reviews`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Non riusciamo a caricare le recensioni.');
      setData(json as Loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Non riusciamo a caricare le recensioni.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog onOpenChange={(open) => open && void load()}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Leggi le ${count} ${count === 1 ? 'recensione' : 'recensioni'} di ${coachName}`}
          className="inline-flex items-center gap-1.5 rounded-md text-sm text-gray-700 hover:text-gray-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
        >
          <RatingStars value={average ?? 0} />
          <span className="font-medium">{average}</span>
          <span className="text-gray-400 underline-offset-2 hover:underline">({count})</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] max-w-xl">
        <DialogTitle className="pr-10 text-xl">Recensioni di {coachName}</DialogTitle>
        <DialogDescription className="flex items-center gap-2">
          <RatingStars value={average ?? 0} size="sm" />
          <span>
            {average} su 5 · {count} {count === 1 ? 'recensione verificata' : 'recensioni verificate'}
          </span>
        </DialogDescription>

        <div className="mt-4" aria-live="polite">
          {loading && (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carico le recensioni…
            </p>
          )}
          {error && <p className="text-sm text-gray-700">{error}</p>}
          {data && data.reviews.length === 0 && (
            <p className="text-sm text-gray-500">Non ci sono ancora recensioni da mostrare.</p>
          )}
          {data && data.reviews.length > 0 && (
            <ul className="flex flex-col gap-3">
              {data.reviews.map((r) => (
                <li key={r.id} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-gray-900">{r.authorName}</span>
                    <RatingStars value={r.rating} size="sm" />
                  </div>
                  {r.body && <p className="mt-1.5 text-sm text-gray-600">{r.body}</p>}
                  <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                    {r.verified && <BadgeCheck className="h-3.5 w-3.5 text-green-600" aria-hidden />}
                    {r.verified ? 'Recensione verificata · ' : ''}
                    {formatDate(r.createdAt)}
                  </p>
                  {r.reply && (
                    <div className="mt-3 rounded-lg border-l-2 border-gray-200 bg-gray-50 px-3 py-2">
                      <p className="text-xs font-medium text-gray-700">Risposta di {coachName}</p>
                      <p className="mt-0.5 text-sm text-gray-600">{r.reply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
