import type { FaqItem } from './audience-faq';
import { CANCELLATION_NOTICE_HOURS } from '@/lib/core/legal/processors';
import { INTRO_SESSION } from '@/lib/core/services/introduction';

/**
 * Le domande frequenti delle pagine percorso, in un posto solo: le leggono le
 * cinque pagine pubbliche e la pagina di supporto dentro l'area riservata
 * (/dashboard/supporto). Una seconda copia sarebbe la prima a restare
 * indietro quando cambia una regola.
 */

export const ATHLETE_FAQ: FaqItem[] = [
  {
    q: 'Che differenza c’è tra mental coach e psicologo dello sport?',
    a: 'Il mental coach allena abilità mentali legate alla prestazione sportiva; lo psicologo dello sport è uno psicologo iscritto all’Albo, che può valutare e, se psicoterapeuta, curare. Su KaiPai lavorano mental coach: se emerge un bisogno clinico, il coach indirizza verso un professionista sanitario.',
  },
  {
    q: 'Come scelgo il coach giusto per me?',
    a: 'Nella lista dei coach puoi filtrare per sport, specializzazione, livello e lingua, e leggere il profilo di ognuno. Se hai un dubbio, la sessione conoscitiva gratuita serve proprio a capire se è la persona giusta.',
    link: { href: '/coaches', label: 'Vai alla lista dei coach' },
  },
  {
    q: 'Ho meno di 18 anni: posso iniziare?',
    a: 'Dai 15 anni puoi registrarti ed esplorare. Per richiedere sedute serve l’autorizzazione di un genitore o del tutore legale: la piattaforma gli manda un’email con un link, e conferma in un minuto.',
  },
  {
    q: 'La prima sessione è gratuita?',
    a: `Sì. La prima sessione con ogni coach è una sessione conoscitiva di ${INTRO_SESSION.durationMin} minuti, gratuita, in videochiamata: vi conoscete e parlate dei tuoi obiettivi.`,
  },
  {
    q: 'Le sedute vengono registrate o trascritte?',
    a: 'Solo se lo accetti. Se il coach usa gli Appunti AI, ti viene chiesto il consenso prima di iniziare e puoi rifiutare: la seduta si svolge normalmente. Se sei minorenne serve anche che il genitore abbia autorizzato la registrazione, non solo le sedute. Il riepilogo lo rivede il coach prima di condividerlo con te.',
  },
  {
    q: 'Il mental coaching è una terapia?',
    a: 'No. Allena abilità mentali legate alla prestazione sportiva. Se emerge un bisogno di natura clinica, il coach ti indirizza verso un professionista sanitario.',
  },
  {
    q: 'Cosa succede se non mi trovo bene con il coach?',
    a: 'Puoi sceglierne un altro in qualsiasi momento. Anche con il nuovo coach la prima sessione conoscitiva è gratuita.',
  },
  {
    q: 'Come vengono monitorati i miei progressi?',
    a: 'Nella tua pagina del percorso trovi gli obiettivi concordati con il coach, le azioni prese seduta dopo seduta e l’andamento nel tempo. Se attivi gli Appunti AI, la bozza del riepilogo è assistita dall’intelligenza artificiale e la rivede e approva il coach.',
  },
  {
    q: 'Si paga qualcosa, e posso spostare un appuntamento?',
    a: 'La prima sessione conoscitiva è gratis. Oggi KaiPai non ti addebita nulla e non chiede dati di pagamento: l’accesso alle sedute passa da accordi con club e organizzazioni. Se verranno introdotti pagamenti, le condizioni saranno aggiornate e comunicate prima. Un appuntamento non ancora svolto puoi spostarlo tu o il coach, su un orario libero del suo calendario.',
  },
];


/**
 * Le domande dei genitori. Le regole sui minori sono quelle di
 * `lib/core/guardians` (15–17 anni: serve l’autorizzazione, e a parte quella
 * alla registrazione); non vanno scritte qui in modo diverso da là.
 */
export const FAMILY_FAQ: FaqItem[] = [
  {
    q: 'Come funziona il percorso per mio figlio?',
    a: `Scegliete insieme un coach, fate la sessione conoscitiva gratuita di ${INTRO_SESSION.durationMin} minuti in videochiamata e, se vi convince, si parte con le sedute: ognuna è una richiesta che il coach conferma. Obiettivi e progressi restano scritti nella pagina del percorso.`,
  },
  {
    q: 'Se mio figlio è minorenne, cosa devo fare?',
    a: 'Un atleta fra i 15 e i 17 anni può registrarsi ed esplorare, ma non può richiedere sedute finché non autorizzi tu, come genitore o tutore legale. Ricevi un’email con un link, leggi cosa stai autorizzando e confermi in un minuto, senza creare un account. Puoi revocare l’autorizzazione in qualsiasi momento.',
  },
  {
    q: 'Possiamo fare la sessione conoscitiva insieme?',
    a: 'Sì. La sessione conoscitiva è gratuita e potete farla insieme, genitore e figlio: è il momento per conoscere il coach, raccontare da dove parte il ragazzo e capire se è la persona giusta.',
  },
  {
    q: 'Come scelgo il coach più adatto?',
    a: 'Nella lista dei coach puoi filtrare per sport, specializzazione, livello e lingua, e leggere il profilo di ognuno. Ogni profilo è approvato da un amministratore KaiPai prima di comparire. Se hai un dubbio, scrivici: ti aiutiamo a orientarti.',
    link: { href: '/coaches', label: 'Vai alla lista dei coach' },
  },
  {
    q: 'Posso partecipare anch’io al percorso?',
    a: 'Resti il primo riferimento, e puoi chiedere al coach un confronto sull’andamento e sugli obiettivi. Alle sedute, con gli adolescenti, di norma funziona meglio uno spazio suo: per i più giovani la modalità si concorda con il coach.',
  },
  {
    q: 'Cosa mi viene condiviso delle sedute?',
    a: 'Non i contenuti: uno spazio riservato è ciò che permette al ragazzo di aprirsi. Ricevi invece il quadro generale del percorso. La riservatezza non è mai un ostacolo alla tutela: se emerge qualcosa che riguarda la sua salute o la sua sicurezza, vieni sempre coinvolto.',
  },
  {
    q: 'Le sedute vengono registrate o trascritte?',
    a: 'Solo con il consenso. Se il coach usa gli Appunti AI, per un minorenne serve che tu abbia autorizzato anche la registrazione, a parte rispetto alle sedute; e il ragazzo può comunque rifiutare all’inizio della seduta, che si svolge normalmente. Il riepilogo lo rivede il coach prima di condividerlo.',
  },
  {
    q: 'Come vengono monitorati i progressi?',
    a: 'Nella pagina del percorso ci sono gli obiettivi concordati con il coach, le azioni prese seduta dopo seduta e l’andamento nel tempo. Se attivi gli Appunti AI, la bozza del riepilogo è assistita dall’intelligenza artificiale e la rivede e approva il coach.',
  },
  {
    q: 'Cosa succede se emergono difficoltà che vanno oltre lo sport?',
    a: 'Il mental coaching non è una terapia: allena abilità mentali legate alla prestazione. Se emerge un bisogno di natura clinica, il coach lo dice chiaramente, coinvolge la famiglia e indirizza verso un professionista sanitario.',
  },
  {
    q: 'Come vengono trattati i dati di mio figlio?',
    a: 'Nel rispetto del GDPR, solo per erogare il servizio. Puoi accedere ai dati, chiederne la rettifica o la cancellazione in ogni momento scrivendo a privacy@kaipaicoaching.com. I dettagli sono nella Privacy Policy.',
  },
  {
    q: 'Si paga qualcosa, e posso spostare un appuntamento?',
    a: 'La prima sessione conoscitiva è gratis. Oggi KaiPai non addebita nulla e non chiede dati di pagamento: l’accesso alle sedute passa da accordi con club e organizzazioni. Se verranno introdotti pagamenti, le condizioni saranno aggiornate e comunicate prima. Un appuntamento non ancora svolto si può spostare su un orario libero del calendario del coach.',
  },
];


/**
 * Le domande di un coach che valuta KaiPai. Le risposte sui soldi seguono i
 * Termini (§ 9): oggi la piattaforma non gestisce pagamenti fra atleta e
 * coach. Se il modello cambia, cambiano prima i Termini e poi queste righe.
 */
export const COACH_FAQ: FaqItem[] = [
  {
    q: 'Il profilo viene pubblicato subito?',
    a: 'No. Ogni profilo viene rivisto dal team KaiPai prima di diventare visibile agli atleti. Finché non è approvato puoi completarlo, ma non ricevere prenotazioni.',
  },
  {
    q: 'Come funziona la revisione del profilo?',
    a: 'Un amministratore KaiPai controlla il profilo prima della pubblicazione: completezza delle informazioni, chiarezza della presentazione e documentazione di identità e certificazioni che indichi, di cui resti garante. Non è previsto un colloquio né una selezione sul tuo metodo. Se manca qualcosa te lo diciamo, e puoi correggerlo.',
  },
  {
    q: 'Quanto costa usare KaiPai?',
    a: 'Oggi candidarsi e usare la piattaforma non ha costi per il coach, e non ti chiediamo dati di pagamento. Se in futuro verranno introdotte funzioni a pagamento, le condizioni saranno aggiornate e comunicate prima dell’attivazione.',
  },
  {
    q: 'Come vengo pagato per le sedute?',
    a: 'KaiPai oggi non incassa né gira pagamenti fra atleta e coach: l’accesso alle sedute passa da accordi con club e organizzazioni. Il rapporto professionale resta fra te e chi segui, e sei tu il professionista indipendente che lo gestisce. Quando la piattaforma introdurrà i pagamenti, le regole saranno pubblicate prima.',
  },
  {
    q: 'Quando inizio a ricevere richieste dagli atleti?',
    a: 'Dal momento in cui il profilo è approvato: compari nella lista dei coach, e gli atleti possono chiederti una seduta negli orari che hai reso disponibili. Nulla è confermato finché non accetti tu.',
  },
  {
    q: 'Cos’è la sessione conoscitiva gratuita?',
    a: `Ogni coach ha una sessione conoscitiva di ${INTRO_SESSION.durationMin} minuti, gratuita, in videochiamata: è il primo incontro con un atleta nuovo, per conoscervi e parlare dei suoi obiettivi. Ogni atleta può richiederla una volta per coach.`,
  },
  {
    q: 'Decido io orari e appuntamenti?',
    a: `Sì. Imposti la tua disponibilità settimanale e accetti o rifiuti ogni richiesta. Con un atleta che già segui puoi anche proporre tu un appuntamento, e spostarlo se serve. Le sedute si possono annullare fino al loro svolgimento: è buona norma farlo con almeno ${CANCELLATION_NOTICE_HOURS} ore di preavviso.`,
  },
  {
    q: 'Come mi preparo alla prossima seduta?',
    a: 'Con il bottone «Preparati», nella scheda della prossima call. Apre la sintesi da leggere prima di entrare: gli obiettivi concordati con l’atleta, dove eravate rimasti nell’ultimo riepilogo approvato, le tue note e i momenti che hai segnato dal vivo nelle sedute precedenti. Non inventa niente: raccoglie solo quello che hai già scritto o approvato.',
  },
  {
    q: 'Posso portare su KaiPai gli atleti che seguo già?',
    a: 'Sì. Hai un link personale per invitarli, e dalla dashboard vedi quanti si sono registrati grazie a te.',
  },
  {
    q: 'Gli Appunti AI registrano la seduta anche senza consenso?',
    a: 'No. La registrazione parte solo dopo il consenso dell’atleta, che può anche rifiutare: in quel caso la seduta si svolge normalmente, senza appunti. Il report lo rivedi e lo approvi tu prima che l’atleta lo veda.',
  },
  {
    q: 'Posso lavorare con atleti minorenni?',
    a: 'Sì. Un atleta fra i 15 e i 17 anni può registrarsi, ma non può richiedere sedute finché un genitore o il tutore legale non lo autorizza: la piattaforma gestisce la richiesta per te. Sai che l’atleta è minorenne prima di accettare, e per registrare la seduta serve un’autorizzazione a parte.',
  },
  {
    q: 'Il mental coaching su KaiPai è una terapia?',
    a: 'No. Si allenano abilità mentali legate alla prestazione sportiva. Se emerge un bisogno clinico, l’atleta va indirizzato verso un professionista sanitario.',
  },
];


/**
 * Le domande di chi valuta l’Academy. Le risposte seguono `lib/core/academy`:
 * i corsi li assegna il team a coach con profilo approvato, le ore di un
 * corso sono la somma dei suoi moduli, il modulo si completa con la presenza
 * alla sessione e dopo ogni sessione arriva il riepilogo (anche in PDF).
 */
export const ACADEMY_FAQ: FaqItem[] = [
  {
    q: 'Chi può seguire i corsi dell’Academy?',
    a: 'I coach KaiPai: dopo la candidatura e l’approvazione del profilo, il team assegna i corsi del percorso. L’Academy è la strada con cui un professionista si prepara a lavorare sulla piattaforma.',
  },
  {
    q: 'I corsi sono online o in presenza?',
    a: 'Entrambi. Le sessioni live si seguono in videochiamata da dove sei; alcuni momenti del percorso si svolgono in presenza.',
  },
  {
    q: 'Come si svolge una sessione live?',
    a: 'In videochiamata dentro KaiPai, con il docente: nessun link esterno. Trovi le prossime sessioni del tuo corso nella tua area, con data e orario.',
  },
  {
    q: 'Quanto dura il percorso?',
    a: 'Dipende dal corso. Ogni corso è diviso in moduli, e le ore totali che vedi sono la somma dei suoi moduli: sai fin dall’inizio quanto impegno richiede.',
  },
  {
    q: 'Ci sono momenti pratici o mentorship?',
    a: 'Sì, è il cuore del percorso: si lavora nelle sessioni live con coach esperti che fanno da mentor, su casi ed esercizi, non davanti a un video registrato.',
  },
  {
    q: 'Chi sono i docenti?',
    a: 'Coach esperti che fanno da mentor: guidano le sessioni live e seguono i partecipanti lungo i moduli.',
  },
  {
    q: 'Cosa resta dopo ogni sessione?',
    a: 'Il riepilogo con i punti chiave, che puoi anche scaricare in PDF, e i materiali del modulo: letture, schede ed esercizi, per ripassare invece di ricordare a memoria.',
  },
  {
    q: 'Come vedo a che punto sono?',
    a: 'La partecipazione alle sessioni completa i moduli, e l’avanzamento del corso si aggiorna da solo: sai sempre quanti moduli hai chiuso e quanti ne mancano.',
  },
  {
    q: 'Se salto una sessione?',
    a: 'Il modulo di quella sessione resta da completare. Parlane con il team dell’Academy: ti aiuta a capire come recuperarlo.',
  },
  {
    q: 'Si riceve un attestato?',
    a: 'Sì: chi completa il corso riceve un attestato di completamento. Non sostituisce titoli o abilitazioni professionali.',
  },
];


export const TEAMS_FAQ: FaqItem[] = [
  {
    q: 'Lavorate anche con i settori giovanili?',
    a: 'Sì, è uno dei percorsi per i club: lavoro con i ragazzi, workshop per staff e genitori. Ogni atleta minorenne partecipa con l’autorizzazione di un genitore, che la piattaforma richiede e registra.',
  },
  {
    q: 'Il mental coach lavora al campo o online?',
    a: 'Dipende dal percorso: i programmi per i club prevedono presenza al campo, e le sedute individuali possono svolgersi anche in videochiamata su KaiPai.',
  },
  {
    q: 'Il mental coach sostituisce lo psicologo del club?',
    a: 'No. Il mental coaching allena abilità mentali legate alla prestazione e non è una terapia. Se emerge un bisogno clinico, il coach lo segnala e indirizza verso un professionista sanitario.',
  },
  {
    q: 'Come si parte?',
    a: 'Con una richiesta dal modulo contatti: fissiamo una chiamata conoscitiva, analizziamo con voi bisogni e obiettivi e proponiamo un programma su misura.',
  },
];

