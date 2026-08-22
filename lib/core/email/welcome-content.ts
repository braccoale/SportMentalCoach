export type WelcomeEmailRole = 'athlete' | 'coach' | 'club' | null;

export type WelcomeEmailContent = {
  subject: string;
  preview: string;
  eyebrow: string;
  title: string;
  paragraphs: string[];
  actionLabel: string;
  actionPath: string;
};

/** Testo puro e verificabile della mail inviata subito dopo la registrazione. */
export function buildWelcomeEmailContent(input: {
  brand: string;
  name?: string | null;
  role?: WelcomeEmailRole;
  guardianAuthorizationRequired?: boolean;
}): WelcomeEmailContent {
  const name = input.name?.trim() || null;
  const greeting = name ? `Ciao ${name},` : 'Ciao,';

  if (input.role === 'coach') {
    return {
      subject: name
        ? `Benvenuto tra i coach KaiPai, ${name}`
        : 'Benvenuto tra i coach KaiPai',
      preview:
        'Completa profilo e servizi, poi invia tutto all’amministratore per l’approvazione.',
      eyebrow: 'Account coach creato',
      title: 'Il tuo account coach è pronto',
      paragraphs: [
        greeting,
        'Per rendere pubblico il tuo profilo e ricevere richieste dagli atleti, completa questi passaggi:',
        '1. Completa il profilo professionale: titolo, biografia, sport e specializzazioni.',
        '2. Controlla la sezione Servizi. Abbiamo già creato “Sessione online”: dura 40 minuti, costa 0 € e ha la descrizione “Sport Mental Coach”. Modificala prima dell’invio se vuoi cambiare durata, prezzo o descrizione.',
        '3. Quando profilo e servizi sono corretti, premi “Invia per la revisione” nella tua area coach.',
        '4. L’amministratore di KaiPai controllerà le informazioni. Fino all’approvazione, il profilo non sarà pubblico e gli atleti non potranno prenotare le tue sessioni.',
        'Riceverai un’altra comunicazione quando il profilo sarà approvato oppure se serviranno modifiche.',
      ],
      actionLabel: 'Completa profilo e servizi',
      actionPath: '/dashboard/coach',
    };
  }

  if (input.role === 'athlete' && input.guardianAuthorizationRequired) {
    return {
      subject: name
        ? `Il tuo account KaiPai è pronto, ${name}: serve l’autorizzazione di un genitore`
        : 'Il tuo account KaiPai è pronto: serve l’autorizzazione di un genitore',
      preview:
        'Apri la tua area e invita un genitore o tutore: senza la sua conferma non puoi prenotare sessioni.',
      eyebrow: 'Account atleta minorenne creato',
      title: 'Prima di iniziare serve un genitore o tutore',
      paragraphs: [
        greeting,
        'il tuo account KaiPai è stato creato. Poiché hai meno di 18 anni, prima di prenotare o partecipare a una sessione serve l’autorizzazione di un genitore o tutore.',
        'Ecco cosa devi fare:',
        '1. Apri la tua area atleta.',
        '2. Nel riquadro dedicato all’autorizzazione inserisci nome, cognome, rapporto con te ed email personale del genitore o tutore.',
        '3. Premi “Invia la richiesta”. Il genitore riceverà un’email con un collegamento personale, utilizzabile una sola volta e valido per 72 ore.',
        '4. Il genitore dovrà aprire il collegamento, leggere il documento, confermare la propria responsabilità genitoriale o tutela, accettare Termini e Privacy e digitare il proprio nome e cognome.',
        'Fino alla conferma non potrai prenotare o partecipare alle sessioni. Appena il genitore autorizza il percorso, nella tua area vedrai che puoi iniziare.',
        'Gli Appunti AI sono separati e facoltativi. Il genitore può non autorizzare registrazione audio, trascrizione e preparazione del report: in quel caso potrai comunque svolgere normalmente le sessioni, senza registrazione.',
        'Se il collegamento scade o l’indirizzo email è sbagliato, torna nella tua area e invia una nuova richiesta.',
      ],
      actionLabel: 'Invita il genitore o tutore',
      actionPath: '/dashboard/athlete',
    };
  }

  return {
    subject: `Benvenuto su ${input.brand}${name ? `, ${name}` : ''}`,
    preview: 'Il tuo account è pronto.',
    eyebrow: 'Benvenuto',
    title: `Benvenuto su ${input.brand}`,
    paragraphs: [
      greeting,
      'il tuo spazio KaiPai è pronto. Da qui puoi conoscere i coach, scegliere il percorso più adatto a te e allenare la mente con la stessa cura che dedichi al tuo sport.',
      'Ogni piccolo passo conta: quando vuoi, puoi iniziare dalla tua area.',
    ],
    actionLabel: 'Scopri la tua area',
    actionPath: '/dashboard',
  };
}
