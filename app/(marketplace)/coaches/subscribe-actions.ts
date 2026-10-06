'use server';

import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { startPlanCheckout } from '@/lib/core/billing';

/** Gli slug sono minuscole, numeri e trattini: altro non va in un indirizzo. */
function safeProfilePath(raw: FormDataEntryValue | null): string {
  const slug = typeof raw === 'string' ? raw.trim() : '';
  return /^[a-z0-9-]{1,120}$/.test(slug) ? `/coaches/${slug}` : '/coaches';
}

/**
 * Porta l'atleta al pagamento di un percorso mensile.
 *
 * Dal browser arrivano solo l'id del piano e lo slug (usato soltanto per
 * tornare alla pagina giusta, dopo averlo ripulito). Tutto il resto lo ricava
 * `startPlanCheckout`, che applica anche la regola di idoneità: nascondere il
 * pulsante a un minorenne non è un cancello, questo sì.
 *
 * `redirect` solleva un'eccezione per funzionare: va chiamato fuori dal
 * `try`, altrimenti verrebbe scambiato per un errore di Stripe.
 */
export async function startPlanCheckoutAction(formData: FormData): Promise<void> {
  const profilePath = safeProfilePath(formData.get('slug'));

  const user = await getUser();
  if (!user) redirect(`/sign-in?redirect=${encodeURIComponent(profilePath)}`);

  const planId = Number(formData.get('planId'));
  if (!Number.isInteger(planId) || planId <= 0) {
    redirect(`${profilePath}?abbonamento=errore#percorsi`);
  }

  let destination: string;
  try {
    const result = await startPlanCheckout({
      athleteUserId: user.id,
      planId,
    });
    // Il motivo del rifiuto è un codice chiuso: la pagina sceglie il testo.
    destination = result.ok
      ? result.url
      : `${profilePath}?abbonamento=${result.reason ?? 'errore'}#percorsi`;
  } catch (error) {
    console.error('[payments] checkout non avviato', {
      athleteUserId: user.id,
      planId,
      reason: error instanceof Error ? error.message : 'sconosciuto',
    });
    destination = `${profilePath}?abbonamento=errore#percorsi`;
  }

  redirect(destination);
}
