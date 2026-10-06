/**
 * Chi è entrato in una seduta e che cosa ha deciso sulla trascrizione AI, per
 * ciascuna delle due persone: la riga dell'amministrazione lo mostra accanto al
 * nome (verde se è entrato, una spunta se ha accettato).
 *
 * «Entrato» è un fatto registrato (l'ingresso nella stanza notificato da
 * LiveKit), non «doveva esserci»: una seduta fissata alle 18:00 può non essere
 * mai iniziata. Il consenso è quello **dell'ultima sessione di appunti** della
 * prenotazione, che è l'unico che conta per quella chiamata.
 *
 * Modulo puro: i calcoli con il segreto e il database stanno altrove.
 */

export type TranscriptionConsent =
  /** Ha accettato di registrare e trascrivere. */
  | 'accepted'
  /** Ha rifiutato, o ha revocato dopo aver accettato. */
  | 'declined'
  /** Gli è stato chiesto e non ha ancora risposto. */
  | 'pending'
  /** Nessuna sessione di appunti per questa chiamata: niente da mostrare. */
  | 'none';

export type ParticipantPresence = {
  joined: boolean;
  consent: TranscriptionConsent;
};

export const NOBODY: ParticipantPresence = { joined: false, consent: 'none' };

export function transcriptionConsentFrom(
  status: string | null | undefined
): TranscriptionConsent {
  switch (status) {
    case 'accepted':
      return 'accepted';
    case 'rejected':
    case 'revoked':
      return 'declined';
    case 'pending':
      return 'pending';
    default:
      return 'none';
  }
}

export function participantPresence(params: {
  /** I riferimenti dei partecipanti entrati, come registrati negli eventi. */
  joinedRefs: ReadonlySet<string>;
  /** Il riferimento di questa persona, calcolato con lo stesso segreto. */
  ref: string | null;
  consentStatus: string | null | undefined;
}): ParticipantPresence {
  return {
    joined: params.ref !== null && params.joinedRefs.has(params.ref),
    consent: transcriptionConsentFrom(params.consentStatus),
  };
}
