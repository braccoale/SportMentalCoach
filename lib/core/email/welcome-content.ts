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
