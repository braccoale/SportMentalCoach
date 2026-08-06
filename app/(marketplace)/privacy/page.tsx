import { LegalPage } from '../legal-layout';
import {
  AI_AUDIO_RETENTION_DAYS,
  SUB_PROCESSORS,
  LEGAL_LAST_UPDATED,
  INACTIVITY_MONTHS,
  POST_CLOSURE_RETENTION_MONTHS,
  LEGAL_CONTACT_EMAIL,
} from '@/lib/core/legal/processors';
import { MIN_SIGNUP_AGE } from '@/lib/core/guardians/age';

export const metadata = { title: 'Privacy Policy — KaiPai' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={LEGAL_LAST_UPDATED}>
      <h2>1. Titolare del trattamento</h2>
      <p>
        {/* DA COMPLETARE: ragione sociale, sede legale, P.IVA / C.F., indirizzo
            PEC e, se nominato, i contatti del Responsabile della protezione dei
            dati (DPO). Senza questi elementi l'informativa non è conforme
            all'art. 13 GDPR. Un DPO non risulta obbligatorio ex art. 37 finché
            non trattiamo categorie particolari su larga scala — il che è
            un'altra ragione per tenere ferma la posizione della sezione 5. */}
        Il titolare del trattamento dei dati è KaiPai, con sede a Genova
        (contatto: {LEGAL_CONTACT_EMAIL}). La presente informativa è resa ai sensi
        del Regolamento (UE) 2016/679 («GDPR»).
      </p>

      <h2>2. Dati trattati</h2>
      <ul>
        <li>
          <strong>Dati di account</strong>: nome, cognome, email e password. La
          password non è mai conservata in chiaro: l’autenticazione è gestita
          da Supabase Auth, che ne custodisce solo una versione cifrata.
        </li>
        <li>
          <strong>Dati di profilo</strong>: per gli atleti, sport praticato,
          livello e obiettivi che scegli di indicare; per i Coach, le
          informazioni professionali pubblicate volontariamente (biografia,
          certificazioni, specializzazioni, foto e video di presentazione).
        </li>
        <li>
          <strong>Dati d’uso</strong>: richieste di sessione, appuntamenti,
          messaggi di chat, recensioni, preferiti e notifiche.
        </li>
        <li>
          <strong>Dati di svolgimento delle sessioni</strong>: orario di inizio
          e di fine effettivi delle videochiamate. Il contenuto della
          videochiamata non viene mai registrato.
        </li>
        <li>
          <strong>Dati delle notifiche push</strong>, se le attivi: un
          identificativo del browser sul dispositivo e le chiavi crittografiche
          necessarie a cifrare i messaggi. Non contengono il tuo nome e non
          consentono di seguirti su altri siti.
        </li>
        <li>
          <strong>Dati del genitore o tutore</strong>, per gli atleti fra i 15 e
          i 17 anni: nome, email e rapporto dichiarato, insieme alla prova
          dell’autorizzazione prestata (vedi la sezione 14).
        </li>
        <li>
          <strong>Dati tecnici</strong>: indirizzo IP e informazioni sul
          browser, trattati dall’infrastruttura di hosting per servire le
          pagine e per la sicurezza.
        </li>
        <li>
          <strong>Dati analytics</strong>, solo se presti il consenso: pagine
          visitate, eventi di utilizzo, informazioni sul browser e dispositivo,
          area geografica approssimativa e identificativi pseudonimi conservati
          nei cookie di Google Analytics. Non trasmettiamo a Google nome, email
          o altri identificativi del tuo account.
        </li>
      </ul>

      <p>
        <strong>Cosa è obbligatorio e cosa no.</strong> Sono necessari per
        erogare il servizio, e senza di essi non è possibile usare la
        piattaforma: nome, email, password e — per gli atleti — la data di
        nascita, che serve ad applicare l’età minima e le tutele per i
        minorenni. Tutto il resto è <strong>facoltativo</strong>: sport,
        livello, obiettivi, città, fotografia, preferiti e notifiche push. Non
        fornirli limita alcune funzioni, ma non impedisce di usare il servizio.
      </p>

      <h2>3. Finalità e base giuridica</h2>
      <p>
        I dati sono trattati per erogare il servizio e permettere l’incontro fra
        atleti e Coach (esecuzione del contratto), per inviare comunicazioni di
        servizio come conferme e promemoria di sessione (esecuzione del
        contratto), per garantire la sicurezza della piattaforma e prevenirne
        gli abusi (legittimo interesse) e per adempiere a obblighi di legge.
      </p>
      <p>
        <strong>Non trattiamo i tuoi dati per finalità di marketing</strong> e
        non inviamo comunicazioni commerciali o newsletter: tutte le email che
        riceverai sono legate a un fatto che ti riguarda. Non profiliamo gli
        utenti e non prendiamo decisioni automatizzate che producano effetti
        giuridici nei tuoi confronti.
      </p>
      <p>
        Con il tuo <strong>consenso</strong> (art. 6.1.a GDPR) utilizziamo Google
        Analytics per produrre statistiche aggregate e migliorare il sito. Il
        tag non viene caricato e nessun dato viene inviato a Google prima della
        tua scelta. Puoi rifiutare senza conseguenze sull’uso di KaiPai e puoi
        revocare il consenso in qualsiasi momento da «Preferenze cookie» nel
        footer.
      </p>

      <h2>4. Navigazione del sito pubblico</h2>
      <p>
        Le pagine pubbliche — la home, l’elenco dei coach e i profili — sono
        consultabili <strong>senza registrarsi</strong>. Anche in questo caso i
        sistemi che servono il sito registrano automaticamente alcuni dati
        tecnici: indirizzo IP, tipo di browser e di dispositivo, pagina
        richiesta, data e ora.
      </p>
      <p>
        Servono a consegnare le pagine, diagnosticare i malfunzionamenti e
        difendere il sito dagli abusi; la base giuridica è il nostro legittimo
        interesse a un servizio funzionante e sicuro (art. 6.1.f GDPR). Questi
        log sono conservati per il breve periodo necessario alla diagnostica e
        alla sicurezza, e comunque non oltre 12 mesi.
      </p>
      <p>
        Solo dopo il consenso, Google Analytics misura le visite e le
        interazioni con il sito. Le funzioni pubblicitarie, Google Signals e la
        personalizzazione degli annunci restano disattivate; non impostiamo un
        identificativo utente collegato all’account e non usiamo Analytics per
        profilare le persone.
      </p>

      <h2>5. Dati sulla salute: non li chiediamo</h2>
      <p>
        KaiPai eroga allenamento mentale sportivo, <strong>non prestazioni
        sanitarie</strong>. Di conseguenza{' '}
        <strong>
          non richiediamo, non raccogliamo e non vogliamo dati relativi alla
          salute
        </strong>{' '}
        — che il Regolamento classifica fra le «categorie particolari» (art. 9
        GDPR) e sottopone a tutele rafforzate.
      </p>
      <p>
        I campi liberi della piattaforma — obiettivi, note alla richiesta,
        messaggi in chat — servono a descrivere il tuo momento sportivo e su
        cosa vuoi lavorare: concentrazione, gestione della pressione, fiducia.{' '}
        <strong>Non vanno usati per diagnosi, terapie, farmaci o altre
        informazioni cliniche</strong>, né tue né di terzi.
      </p>
      <p>
        Se attivi gli Appunti AI, la conversazione viene registrata e trascritta
        così com’è: può quindi capitare che vi finisca, per tua libera scelta di
        parlarne, un contenuto che rivela il tuo stato psicologico o di salute.
        Non lo chiediamo e non lo cerchiamo, ma è la ragione per cui quella
        funzione richiede un consenso esplicito e separato, revocabile in ogni
        momento, e per cui il report resta invisibile finché il coach non lo ha
        rivisto.
      </p>
      <p>
        Se durante il percorso emerge un bisogno di natura clinica, il coach non
        è la figura appropriata: il suo compito è fermarsi e indirizzarti verso
        un professionista sanitario, coinvolgendo la famiglia quando l’atleta è
        minorenne. In caso di emergenza contatta i servizi sanitari competenti o
        il numero unico 112.
      </p>

      <h2>6. Dati pubblici del profilo Coach</h2>
      <p>
        Se ti registri come Coach, una volta approvato il tuo profilo diventa
        pubblico e consultabile anche da chi non ha un account. Sono pubblici il
        nome, la fotografia, la biografia, le specializzazioni, le
        certificazioni dichiarate, le recensioni ricevute e alcuni indicatori
        di esperienza calcolati automaticamente dalla piattaforma — il numero di
        atleti seguiti e il totale delle ore di sessione erogate, entrambi
        ricavati dalle sole sessioni completate. Questi indicatori sono
        aggregati e non rendono identificabili i singoli atleti.
      </p>
      <p>
        Il profilo di un atleta non è mai pubblico: è visibile soltanto ai Coach
        con cui ha una sessione in corso o già svolta.
      </p>

      <h2>7. Se sei un Coach</h2>
      <p>
        Questa informativa si rivolge principalmente agli atleti, ma anche tu
        sei un interessato e alcune regole ti riguardano in modo specifico.
      </p>
      <ul>
        <li>
          <strong>Cosa trattiamo</strong>: dati di account e di profilo
          professionale (biografia, certificazioni, specializzazioni, tariffe,
          foto e video), disponibilità settimanale, sessioni erogate e
          recensioni ricevute.
        </li>
        <li>
          <strong>Cosa diventa pubblico</strong>: quanto descritto alla sezione
          6, inclusi gli indicatori di esperienza calcolati automaticamente. Sono
          il fondamento della fiducia degli atleti, quindi restano visibili
          finché il profilo è pubblicato.
        </li>
        <li>
          <strong>Documenti di verifica</strong>: le certificazioni che invii per
          l’approvazione sono viste solo dal personale autorizzato, servono a
          verificare quanto dichiari e non vengono pubblicate.
        </li>
        <li>
          <strong>Conservazione</strong>: valgono i termini della sezione 12. Le
          recensioni ricevute e lo storico delle sessioni restano oltre la
          chiusura del profilo, perché riguardano anche gli atleti coinvolti.
        </li>
        <li>
          <strong>I tuoi diritti</strong> sono quelli della sezione 15, con la
          stessa procedura.
        </li>
      </ul>
      <p>
        Per la tua attività professionale sei tu il titolare del trattamento dei
        dati degli atleti che segui: sei tenuto a rispettare la normativa e gli
        obblighi previsti dai{' '}
        <a href="/terms" className="text-red-600 underline hover:text-red-700">
          Termini
        </a>
        , fra cui la riservatezza e il divieto di usare quei dati per finalità
        diverse dalle sessioni.
      </p>

      <h2>8. Videochiamate e chat</h2>
      <p>
        Le videochiamate si svolgono attraverso un’infrastruttura specializzata.
        Il <strong>video non viene mai registrato</strong>: transita per il tempo
        della sessione e non viene conservato. Della sessione restano l’orario di
        inizio e di fine.
      </p>
      <p>
        L’<strong>audio</strong> viene registrato in un solo caso, descritto nel
        dettaglio al paragrafo successivo: quando entrambi i partecipanti hanno
        attivato gli <strong>Appunti AI</strong>. Senza quel consenso non viene
        registrato nulla.
      </p>
      <p>
        I messaggi di chat sono conservati, per permettere a entrambi di
        rileggere gli accordi presi, e sono accessibili unicamente ai due
        partecipanti alla conversazione.
      </p>

      <h2>9. Appunti AI della sessione</h2>
      <p>
        Gli <strong>Appunti AI</strong> sono una funzione facoltativa, spenta per
        impostazione predefinita. Quando è attiva, l’audio della sessione viene
        registrato, trascritto automaticamente e usato per preparare una bozza di
        report che il coach rivede prima di qualsiasi condivisione.
      </p>
      <p>
        <strong>Serve il consenso di entrambi.</strong> La registrazione parte
        solo se coach e atleta accettano, ciascuno per sé, prima che cominci. Se
        anche uno solo rifiuta, non viene registrato nulla. Il consenso è la base
        giuridica del trattamento (art. 6.1.a e, per quanto la conversazione
        possa rivelare, art. 9.2.a GDPR) ed è{' '}
        <strong>revocabile in ogni momento</strong>, anche a sessione in corso:
        dal momento della revoca la registrazione si interrompe.
      </p>
      <p>Cosa viene conservato, e per quanto:</p>
      <ul>
        <li>
          la <strong>registrazione audio grezza</strong>, in un archivio privato,
          per <strong>{AI_AUDIO_RETENTION_DAYS} giorni</strong>, dopodiché viene
          cancellata automaticamente. Serve solo a produrre la trascrizione;
        </li>
        <li>
          la <strong>trascrizione</strong> e il <strong>report</strong> restano
          legati alla sessione e seguono i tempi di conservazione del paragrafo
          sulla conservazione;
        </li>
        <li>
          il video <strong>non viene mai registrato</strong>, in nessun caso.
        </li>
      </ul>
      <p>
        L’audio viene registrato su tracce separate, una per partecipante: serve
        a distinguere con certezza chi ha detto cosa, senza doverlo dedurre.
      </p>
      <p>
        La trascrizione è prodotta da <strong>Deepgram</strong> e la bozza di
        report da <strong>OpenAI</strong>, entrambi elencati fra i responsabili
        del trattamento. I contenuti{' '}
        <strong>non vengono usati per addestrare i loro modelli</strong>.
      </p>
      <p>
        <strong>Il report non è mai automatico.</strong> L’AI produce una bozza
        visibile al solo coach, che la corregge, elimina ciò che non deve
        restare e decide che cosa condividere con te. Esistono due piani
        distinti: le <em>note condivise</em>, che vedi anche tu, e le{' '}
        <em>note private del coach</em>, che restano sue. Nessun contenuto della
        sessione ti viene mostrato prima che il coach lo abbia approvato.
      </p>
      <p>
        Il contenuto della trascrizione e del report{' '}
        <strong>non viene mai inserito nelle email</strong> che ti inviamo: la
        notifica dice soltanto che qualcosa è pronto, e si consulta accedendo
        alla piattaforma.
      </p>
      <p>
        Se sei minorenne, la funzione richiede che l’account sia già stato
        autorizzato da un genitore o tutore, oltre al tuo consenso e a quello del
        coach.
      </p>

      <h2>10. Email e notifiche push</h2>
      <p>
        Le email che inviamo sono esclusivamente di servizio, legate a fatti che
        ti riguardano: una richiesta ricevuta, una sessione confermata o
        annullata, un nuovo messaggio. Non inviamo comunicazioni commerciali.
        Dalle preferenze di notifica del tuo account puoi scegliere, per ogni
        tipo di evento, se riceverlo nell’applicazione, via email, in entrambi i
        modi o in nessuno. Fanno eccezione gli avvisi di sicurezza e le email che
        contengono un link necessario ad accedere: quelli non sono
        disattivabili.
      </p>
      <p>
        Le notifiche push sono facoltative e disattivate finché non le attivi
        esplicitamente su un dispositivo. Per recapitarle, il messaggio cifrato
        passa necessariamente dal servizio push del tuo browser (Google, Apple o
        Mozilla, a seconda di quale usi). Puoi revocarle in ogni momento dal
        pulsante nelle notifiche o dalle impostazioni del browser: in quel
        momento l’iscrizione del dispositivo viene cancellata dai nostri
        archivi.
      </p>

      <h2>11. Il Coach come destinatario dei tuoi dati</h2>
      <p>
        {/* DA COMPLETARE: far confermare al legale la qualificazione scelta.
            L'alternativa è la contitolarità ex art. 26 GDPR, che tutela di più
            l'atleta ma richiede un accordo di contitolarità sottoscritto da
            ogni coach e la messa a disposizione del suo contenuto essenziale.
            Non dichiararla finché quell'accordo non esiste. */}
        Il Coach non è un nostro fornitore tecnico: è un{' '}
        <strong>professionista indipendente</strong>, che opera come autonomo
        titolare del trattamento per la propria attività professionale. KaiPai
        non è parte del rapporto professionale fra te e il Coach e non
        interviene nel merito delle sessioni.
      </p>
      <p>
        Quando invii una richiesta, comunichiamo al Coach i dati necessari a
        valutarla e a condurre il percorso: nome, indirizzo email, sport,
        livello, gli obiettivi che hai indicato, il messaggio della richiesta,
        i messaggi scambiati in chat e — se hai fra i 15 e i 17 anni — il fatto
        che sei minorenne. La base giuridica è l’esecuzione del contratto.
      </p>
      <p>
        Il Coach è tenuto contrattualmente alla riservatezza e può usare questi
        dati <strong>solo</strong> per erogare le sessioni sulla piattaforma:
        non può contattarti per altre finalità, cederli o usarli per proprie
        comunicazioni commerciali. Nessun altro Coach vede i tuoi dati: la
        visibilità è limitata a chi ha con te una sessione richiesta, in corso o
        già svolta.
      </p>

      <h2>12. Responsabili del trattamento</h2>
      <p>
        Ci avvaliamo inoltre dei seguenti fornitori, che trattano i dati per
        nostro conto e su nostra istruzione, in qualità di responsabili del
        trattamento. <strong>Non vendiamo i dati personali a terzi</strong> e
        non li cediamo per finalità pubblicitarie.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300 text-gray-900">
              <th className="py-2 pr-4 font-semibold">Fornitore</th>
              <th className="py-2 pr-4 font-semibold">Finalità</th>
              <th className="py-2 pr-4 font-semibold">Dati</th>
              <th className="py-2 font-semibold">Ubicazione</th>
            </tr>
          </thead>
          <tbody>
            {SUB_PROCESSORS.map((p) => (
              <tr key={p.name} className="border-b border-gray-200 align-top">
                <td className="py-3 pr-4 font-medium text-gray-900">{p.name}</td>
                <td className="py-3 pr-4">{p.purpose}</td>
                <td className="py-3 pr-4">{p.data}</td>
                <td className="py-3">{p.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Per i fornitori che trattano dati al di fuori dell’Unione Europea il
        trasferimento avviene solo verso Paesi coperti da una decisione di
        adeguatezza della Commissione (art. 45 GDPR) oppure, in mancanza, sulla
        base delle Clausole Contrattuali Standard approvate dalla Commissione
        (art. 46 GDPR), che ti attribuiscono diritti azionabili e mezzi di
        ricorso effettivi.
      </p>

      <h2>13. Conservazione</h2>
      <p>
        Un account si considera <strong>cessato</strong> dopo{' '}
        {INACTIVITY_MONTHS} mesi senza alcuna attività sulla piattaforma, oppure
        dal momento della chiusura volontaria. Da lì decorrono i termini che
        seguono.
      </p>
      <ul>
        <li>
          <strong>Account e profilo</strong>: per tutta la durata dell’account
          attivo e per {POST_CLOSURE_RETENTION_MONTHS} mesi dalla cessazione.
        </li>
        <li>
          <strong>Prenotazioni e storico delle sessioni</strong>:{' '}
          {POST_CLOSURE_RETENTION_MONTHS} mesi dalla cessazione, termine
          necessario a far valere o difendere un diritto. Se pende un
          contenzioso, la conservazione prosegue fino alla sua definizione.
        </li>
        <li>
          <strong>Messaggi di chat</strong>: finché resta attivo l’account di
          almeno uno dei due partecipanti, e comunque non oltre{' '}
          {POST_CLOSURE_RETENTION_MONTHS} mesi dalla cessazione di entrambi.
        </li>
        <li>
          <strong>Registrazione audio degli Appunti AI</strong>:{' '}
          {AI_AUDIO_RETENTION_DAYS} giorni dalla sessione, poi cancellata
          automaticamente. È il termine più breve di tutti perché l’audio serve
          soltanto a produrre la trascrizione: una volta ottenuta, non ha più
          ragione di esistere.
        </li>
        <li>
          <strong>Trascrizione e report della sessione</strong>: seguono lo
          storico delle sessioni, quindi{' '}
          {POST_CLOSURE_RETENTION_MONTHS} mesi dalla cessazione. Puoi chiederne
          la cancellazione anticipata anche senza chiudere l’account.
        </li>
        <li>
          <strong>Iscrizioni alle notifiche push</strong>: fino alla revoca, o
          fino a quando il servizio push segnala il dispositivo come non più
          raggiungibile — nel qual caso l’iscrizione viene rimossa
          automaticamente.
        </li>
        <li>
          <strong>Google Analytics</strong>: i cookie analytics scadono dopo 6
          mesi e non vengono rinnovati a ogni visita. I dati evento associati
          sono conservati nella proprietà Analytics per un massimo di 14 mesi;
          revocando il consenso cancelliamo dal browser i cookie analytics.
        </li>
        <li>
          <strong>Recensioni</strong>: restano pubblicate anche dopo la
          chiusura dell’account di chi le ha scritte, perché concorrono alla
          reputazione del Coach recensito.
        </li>
      </ul>

      <h2>14. Chiusura dell’account</h2>
      <p>
        Dalla sezione Sicurezza puoi chiudere il tuo account in autonomia.
        L’operazione disattiva immediatamente l’accesso: le credenziali di
        autenticazione vengono eliminate, l’indirizzo email viene reso
        inutilizzabile e il profilo non è più raggiungibile né consultabile.
      </p>
      <p>
        Lo storico collegato — prenotazioni, messaggi scambiati e recensioni —
        viene invece conservato, perché riguarda anche l’altra persona
        coinvolta nella sessione, che mantiene il diritto di consultarlo. Se
        desideri la <strong>cancellazione integrale</strong> dei tuoi dati ai
        sensi dell’art. 17 GDPR, scrivi a {LEGAL_CONTACT_EMAIL}: vi daremo seguito nei
        limiti degli obblighi di conservazione previsti dalla legge.
      </p>

      <h2>15. Atleti minorenni</h2>
      <p>
        La piattaforma è offerta agli atleti dai {MIN_SIGNUP_AGE} anni in su.
        Poiché la soglia italiana per il consenso digitale è fissata a 14 anni
        (art. 2-quinquies del Codice Privacy), <strong>ogni atleta di KaiPai
        può prestare validamente da sé il consenso al trattamento dei propri
        dati</strong>: non chiediamo un’autorizzazione del genitore per questo.
      </p>
      <p>
        L’autorizzazione del genitore o tutore serve per una ragione diversa e
        di natura contrattuale — un minore non può concludere validamente il
        contratto con la piattaforma — ed è descritta nei{' '}
        <a href="/terms" className="text-red-600 underline hover:text-red-700">
          Termini e Condizioni
        </a>
        . Per raccoglierla trattiamo i dati del genitore o tutore: nome,
        indirizzo email, rapporto dichiarato con l’atleta e, come prova del
        consenso prestato, data, ora e indirizzo di rete della conferma. La base
        giuridica è l’esecuzione del contratto e l’adempimento di obblighi di
        legge; questi dati sono conservati finché l’atleta ha un account attivo
        e non sono usati per nessun’altra finalità.
      </p>
      <p>
        Il genitore o tutore resta il referente per le comunicazioni che
        riguardano il minore e può esercitarne i diritti in sua vece.
      </p>

      <h2>16. Diritti dell’interessato</h2>
      <p>
        {/* DA COMPLETARE: attivare una casella dedicata (es. privacy@kaipai.com)
            e sostituirla a info@. Un indirizzo generico rende più difficile
            dimostrare di aver rispettato il termine di un mese dell'art. 12.3. */}
        Puoi esercitare in ogni momento i diritti previsti dagli artt. 15–22
        GDPR scrivendo a {LEGAL_CONTACT_EMAIL}: risponderemo entro un mese dalla
        richiesta.
      </p>
      <ul>
        <li>
          <strong>Accesso</strong>: sapere quali dati trattiamo e ottenerne
          copia.
        </li>
        <li>
          <strong>Rettifica</strong>: correggere dati inesatti o completare
          quelli incompleti.
        </li>
        <li>
          <strong>Cancellazione</strong>, al ricorrere delle condizioni
          dell’art. 17 e salvo quanto dobbiamo conservare per legge.
        </li>
        <li>
          <strong>Limitazione</strong> del trattamento nei casi dell’art. 18.
        </li>
        <li>
          <strong>Portabilità</strong>: ricevere i tuoi dati in un formato
          strutturato e leggibile da un dispositivo automatico.
        </li>
        <li>
          <strong>Opposizione (art. 21)</strong>: puoi opporti in qualsiasi
          momento ai trattamenti che svolgiamo sulla base del{' '}
          <em>legittimo interesse</em> — nel nostro caso la sicurezza della
          piattaforma e la prevenzione degli abusi. Opporsi non ti impedisce di
          continuare a usare il servizio.
        </li>
      </ul>
      <p>
        Se ritieni che il trattamento violi il Regolamento, hai diritto di
        proporre reclamo a un’autorità di controllo (art. 77 GDPR): in Italia il{' '}
        <strong>Garante per la protezione dei dati personali</strong>{' '}
        (www.garanteprivacy.it), oppure l’autorità dello Stato UE in cui
        risiedi o lavori.
      </p>

      <h2>17. Come proteggiamo i dati</h2>
      <p>
        Il trattamento avviene con strumenti informatici, secondo i principi di
        liceità, minimizzazione ed esattezza, e con misure tecniche e
        organizzative adeguate al rischio. In concreto:
      </p>
      <ul>
        <li>
          il traffico fra il tuo browser e la piattaforma è cifrato (HTTPS), e i
          dati sono cifrati anche a riposo dall’infrastruttura che li ospita;
        </li>
        <li>
          le password non sono mai conservate in chiaro: le custodisce Supabase
          Auth in forma cifrata, e nessuno in KaiPai può leggerle;
        </li>
        <li>
          l’accesso ai dati è limitato al personale autorizzato e istruito, e ai
          fornitori nominati responsabili;
        </li>
        <li>
          le videochiamate non vengono registrate e i loro contenuti non
          transitano nei nostri archivi;
        </li>
        <li>
          <strong>i dati personali non vengono in alcun modo diffusi</strong>,
          fatta eccezione per le informazioni che il Coach sceglie di pubblicare
          sul proprio profilo.
        </li>
      </ul>
      <p>
        Nessuna misura elimina del tutto il rischio: se dovesse verificarsi una
        violazione dei dati personali che comporta un rischio elevato per i tuoi
        diritti, te ne daremo comunicazione secondo l’art. 34 GDPR.
      </p>

      <h2>18. Modifiche a questa informativa</h2>
      <p>
        Questa informativa può essere aggiornata quando cambiano il servizio, i
        fornitori o la normativa. La data di ultimo aggiornamento è indicata in
        cima alla pagina; le modifiche rilevanti sono comunicate agli utenti
        registrati.
      </p>
    </LegalPage>
  );
}
