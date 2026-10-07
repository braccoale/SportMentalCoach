'use server';

import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { setAthleteSubscriptionCancellation } from '@/lib/core/billing';

const ATHLETE_TAB = '/dashboard/athlete/abbonamenti';

/**
 * Dove tornare dopo l'azione: la pagina dell'atleta se la richiesta viene da
 * lì, altrimenti il profilo del coach. Il valore del browser non è mai un
 * indirizzo: è una parola d'ordine (`abbonamenti`) o uno slug ripulito.
 */
function returnPath(formData: FormData): { path: string; anchor: string } {
  if (formData.get('returnTo') === 'abbonamenti') {
    return { path: ATHLETE_TAB, anchor: '' };
  }
  const raw = formData.get('slug');
  const slug = typeof raw === 'string' ? raw.trim() : '';
  return {
    path: /^[a-z0-9-]{1,120}$/.test(slug) ? `/coaches/${slug}` : '/coaches',
    anchor: '#percorsi',
  };
}

async function change(formData: FormData, cancel: boolean): Promise<void> {
  const { path: profilePath, anchor } = returnPath(formData);
  const user = await getUser();
  if (!user) redirect(`/sign-in?redirect=${encodeURIComponent(profilePath)}`);

  const subscriptionRowId = Number(formData.get('subscriptionId'));
  if (!Number.isInteger(subscriptionRowId) || subscriptionRowId <= 0) {
    redirect(`${profilePath}?abbonamento=errore${anchor}`);
  }

  let outcome: 'fine-periodo' | 'riattivato' | 'errore';
  try {
    const result = await setAthleteSubscriptionCancellation({
      athleteUserId: user.id,
      subscriptionRowId,
      cancelAtPeriodEnd: cancel,
    });
    outcome = result.ok ? (cancel ? 'fine-periodo' : 'riattivato') : 'errore';
  } catch (error) {
    console.error('[payments] annullamento non applicato', {
      athleteUserId: user.id,
      subscriptionRowId,
      reason: error instanceof Error ? error.message : 'sconosciuto',
    });
    outcome = 'errore';
  }
  redirect(`${profilePath}?abbonamento=${outcome}${anchor}`);
}

/** Annulla alla fine del periodo già pagato (non subito). */
export async function cancelSubscriptionAction(formData: FormData): Promise<void> {
  await change(formData, true);
}

/** Toglie l'annullamento programmato, prima che il periodo finisca. */
export async function resumeSubscriptionAction(formData: FormData): Promise<void> {
  await change(formData, false);
}
