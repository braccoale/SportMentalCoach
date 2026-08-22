import { startGoogleOAuth } from '@/app/(login)/oauth-actions';

/**
 * «Continua con Google».
 *
 * Un modulo, non un pulsante con un gestore: l'avvio di OAuth vive in una
 * server action, quindi qui non serve una riga di JavaScript e il pulsante
 * funziona anche mentre la pagina si sta ancora idratando — che sulla pagina di
 * accesso è esattamente il momento in cui viene premuto.
 *
 * `role` viaggia in un campo nascosto perché al ritorno da Google lo stato del
 * wizard non esiste più; l'action lo mette da parte in un cookie.
 */

/** Il marchio, disegnato: un file esterno non passerebbe comunque la CSP. */
function GoogleMark() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function GoogleButton({
  role,
  redirect,
  label = 'Continua con Google',
}: {
  /** Il ruolo scelto al primo passo. Assente sulla pagina di accesso. */
  role?: string;
  /** Dove tornare dopo il completamento, se l'utente arrivava da qualche parte. */
  redirect?: string | null;
  label?: string;
}) {
  return (
    <form action={startGoogleOAuth}>
      {role ? <input type="hidden" name="role" value={role} /> : null}
      {redirect ? (
        <input type="hidden" name="redirect" value={redirect} />
      ) : null}
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-3 rounded-full border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      >
        <GoogleMark />
        {label}
      </button>
    </form>
  );
}
