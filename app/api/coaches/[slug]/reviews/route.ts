import { getPublicCoachReviewsBySlug } from '@/lib/core/reviews';

/**
 * Le recensioni di un coach, per la finestra che si apre dalle stelline
 * nell'elenco. Sono le stesse che il profilo pubblico mostra già, quindi la
 * rotta è pubblica; si caricano solo quando la finestra si apre, non con
 * l'elenco. Un coach non approvato o demo risponde come uno che non esiste.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) {
    return Response.json({ error: 'Richiesta non valida.' }, { status: 400 });
  }
  try {
    const result = await getPublicCoachReviewsBySlug(slug);
    if (!result) return Response.json({ error: 'Coach non trovato.' }, { status: 404 });
    return Response.json(
      {
        average: result.summary.average,
        count: result.summary.count,
        reviews: result.reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          body: r.body,
          createdAt: r.createdAt.toISOString(),
          authorName: r.authorName,
          verified: r.verified,
          reply: r.reply,
        })),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
    );
  } catch (error) {
    console.error('[reviews] errore', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Non riusciamo a caricare le recensioni.' }, { status: 500 });
  }
}
