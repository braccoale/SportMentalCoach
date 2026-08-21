/**
 * Il ruolo scelto al primo passo, messo da parte per il viaggio verso Google.
 *
 * Il giro OAuth è un cambio di pagina completo: lo stato del wizard vive in
 * `useState` e al ritorno non c'è più. Senza questo cookie l'utente tornerebbe
 * e gli si dovrebbe richiedere se è un atleta o un coach — proprio la domanda a
 * cui aveva appena risposto.
 *
 * **Perché sta in un file suo.** L'azione che lo scrive vive in un file
 * `'use server'`, da cui si possono esportare **solo funzioni asincrone**: una
 * costante esportata da lì non compila. E il nome serve a tre punti diversi —
 * chi lo scrive, la pagina che lo legge e l'azione che lo cancella — quindi
 * ripeterlo a mano in tre posti significherebbe che un giorno uno dei tre
 * cambia e gli altri no.
 */
export const SIGNUP_ROLE_COOKIE = 'kp_signup_role';

/** Il tempo di un accesso Google, non una preferenza da ricordare. */
export const SIGNUP_ROLE_COOKIE_MAX_AGE_SECONDS = 15 * 60;
