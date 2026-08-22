'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { recordPlatformTermsAcceptance } from '@/lib/core/legal/acceptance';

/**
 * «Ho letto» sull'aggiornamento dei documenti legali.
 *
 * Registra una **nuova** accettazione invece di modificare quella vecchia: la
 * tabella è append-only per costruzione, e serve a rispondere alla domanda «che
 * cosa aveva accettato questa persona, e quando». Sovrascrivere cancellerebbe
 * la risposta per il periodo precedente, che resta valida per quello che
 * copriva.
 *
 * L'impronta del testo corrente la mette `recordPlatformTermsAcceptance`, che è
 * la stessa funzione usata alla registrazione: la prova di lettura ha la stessa
 * forma della prova di accettazione, e nasce dallo stesso codice.
 */
export const acknowledgeLegalUpdate = validatedActionWithUser(
  z.object({}),
  async (_data, _formData, user) => {
    const requestHeaders = await headers();

    await recordPlatformTermsAcceptance(user.id, {
      ipAddress:
        requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        requestHeaders.get('x-real-ip') ||
        null,
      userAgent: requestHeaders.get('user-agent'),
    });

    // L'avviso sta nel guscio della dashboard: senza questo resterebbe finché
    // non si cambia pagina.
    revalidatePath('/dashboard', 'layout');
    return {};
  }
);
