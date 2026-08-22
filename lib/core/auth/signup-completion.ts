/**
 * Dove si finisce una registrazione iniziata da un fornitore d'identità.
 *
 * **Perché una costante e non tre stringhe uguali.** Questo percorso era
 * scritto a mano in tre file, sotto due nomi diversi: chi lo mette in `next`
 * partendo verso Google, chi lo legge nel callback per capire quale flusso è
 * fallito, e il middleware che ci riporta chi ha una sessione senza account.
 * Funzionavano solo perché le tre stringhe coincidevano. Al primo rinominamento
 * — o a un prefisso di lingua — il callback avrebbe smesso di riconoscere un
 * fallimento OAuth e avrebbe rimandato alla pagina di ripristino password: il
 * difetto già corretto una volta, che sarebbe tornato **senza rompere nessun
 * test e nessun typecheck**.
 *
 * Sta fuori dall'area riservata: dentro, il cancello del middleware
 * rimanderebbe alla pagina stessa all'infinito.
 */
export const COMPLETE_SIGNUP_PATH = '/registrazione/completa';
