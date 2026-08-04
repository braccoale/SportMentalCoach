import { LegalPage } from '../legal-layout';
import {
  AI_AUDIO_RETENTION_DAYS,
  LEGAL_LAST_UPDATED,
  INACTIVITY_MONTHS,
  TERMS_CHANGE_NOTICE_DAYS,
  CANCELLATION_NOTICE_HOURS,
  LEGAL_CONTACT_EMAIL,
} from '@/lib/core/legal/processors';
import { REQUEST_RESPONSE_WINDOW_HOURS } from '@/lib/core/sessions';
import { MIN_SIGNUP_AGE, AGE_OF_MAJORITY } from '@/lib/core/guardians/age';

export const metadata = { title: 'Termini e Condizioni — KaiPai' };

/** Inline link styling, matching the rest of the legal pages. */
const A = 'text-red-600 underline hover:text-red-700';

export default function TermsPage() {
  return (
    <LegalPage title="Termini e Condizioni" updated={LEGAL_LAST_UPDATED}>
      <p>
        Questi Termini regolano l’uso della piattaforma KaiPai e costituiscono
        un contratto fra te e KaiPai. Puoi salvarli o stamparli in qualsiasi
        momento da questa pagina, come previsto dall’art. 12 del D.Lgs. 70/2003.
        Se agisci come consumatore, si applicano inoltre le tutele del Codice
        del Consumo (D.Lgs. 206/2005).
      </p>

      <h2>1. Definizioni</h2>
      <ul>
        <li>
          {/* DA COMPLETARE: ragione sociale, sede legale e P.IVA del gestore. */}
          <strong>KaiPai</strong>: il gestore della piattaforma, con sede a
          Genova.
        </li>
        <li>
          <strong>Piattaforma</strong>: il sito web KaiPai e le funzionalità
          accessibili tramite esso, comprese la messaggistica e le
          videochiamate.
        </li>
        <li>
          <strong>Atleta</strong>: la persona fisica che si registra per
          ricevere sessioni di allenamento mentale sportivo.
        </li>
        <li>
          <strong>Coach</strong>: il mental coach sportivo, professionista
          indipendente, il cui profilo è stato approvato da KaiPai e pubblicato
          sulla Piattaforma.
        </li>
        <li>
          <strong>Club</strong>: la società sportiva, squadra o organizzazione
          che stipula un accordo con KaiPai per dare accesso al servizio ai
          propri tesserati.
        </li>
        <li>
          <strong>Sessione</strong>: il singolo incontro fra Atleta e Coach che
          si svolge in videochiamata sulla Piattaforma.
        </li>
        <li>
          <strong>Tutore</strong>: chi esercita la responsabilità genitoriale o
          la tutela legale su un Atleta minorenne.
        </li>
      </ul>

      <h2>2. Oggetto del servizio</h2>
      <p>
        KaiPai è una piattaforma che mette in contatto atleti, squadre e
        famiglie con mental coach sportivi professionisti. KaiPai facilita la
        ricerca del Coach, la richiesta di sessioni, la comunicazione e lo
        svolgimento delle sessioni in videochiamata; non è parte del rapporto
        professionale tra Atleta e Coach, che si instaura direttamente fra le
        due parti.
      </p>

      <h2>3. Accettazione e modifiche dei Termini</h2>
      <p>
        Questi Termini vanno letti e accettati prima di completare la
        registrazione. L’accettazione avviene selezionando l’apposita conferma
        nel modulo di iscrizione.
      </p>
      <p>
        KaiPai può aggiornarli quando cambiano il servizio o la normativa. Le
        modifiche sono comunicate agli utenti registrati con almeno{' '}
        <strong>{TERMS_CHANGE_NOTICE_DAYS} giorni</strong> di preavviso e hanno
        effetto solo per il futuro. Se non le accetti puoi chiudere l’account
        entro quel termine, senza costi; l’uso della Piattaforma dopo la
        decorrenza vale come accettazione.
      </p>

      <h2>4. Registrazione e account</h2>
      <p>
        La registrazione richiede un indirizzo email valido e, per gli Atleti,
        la data di nascita. Sei responsabile della riservatezza delle tue
        credenziali e delle attività svolte con il tuo account.
      </p>
      <p>
        I dati forniti devono essere veri, completi e aggiornati. È vietato
        registrarsi con dati falsi o di fantasia, creare account multipli per la
        stessa persona o registrarsi con i dati di un’altra persona senza
        esserne legittimato. KaiPai può sospendere gli account che violano
        questa regola.
      </p>
      <p>
        L’account è personale: non condividere le credenziali né consentire a
        terzi di accedere alla tua area riservata.
      </p>

      <h2>5. Età minima e atleti minorenni</h2>
      <p>
        KaiPai è offerto agli Atleti a partire dai{' '}
        <strong>{MIN_SIGNUP_AGE} anni</strong>. Al di sotto di questa età la
        registrazione non è consentita e le richieste vengono rifiutate.
      </p>
      <p>
        Fra i {MIN_SIGNUP_AGE} e i {AGE_OF_MAJORITY} anni l’Atleta può
        registrarsi e consultare la Piattaforma, ma{' '}
        <strong>
          non può richiedere né ricevere Sessioni finché il Tutore non ha
          autorizzato il percorso
        </strong>
        . La ragione è che questi Termini sono un contratto e un minore non ha
        la capacità di concluderlo validamente (artt. 2 e 1425 c.c.): il
        contratto è quindi concluso dal Tutore, che lo accetta per conto
        dell’Atleta e ne risponde.
      </p>
      <p>
        L’autorizzazione si presta da un link personale inviato per email, senza
        creare un account. Chi la presta{' '}
        <strong>dichiara e garantisce</strong> di esercitare la responsabilità
        genitoriale o la tutela legale sull’Atleta e di agire, ove presente,
        anche con l’accordo dell’altro genitore (art. 316 c.c.). Registriamo
        data, ora e indirizzo di rete della conferma come prova.
      </p>
      <p>
        KaiPai può <strong>richiedere idonea documentazione</strong> a comprova
        della responsabilità genitoriale o della tutela — in particolare a chi
        dichiari di esercitarla in via esclusiva — e sospendere il percorso
        finché non viene fornita. Chi presta l’autorizzazione riconosce che
        KaiPai fa affidamento sulle sue dichiarazioni e si impegna a{' '}
        <strong>manlevare e tenere indenne KaiPai</strong> da danni, costi e
        spese, incluse quelle legali, derivanti da dichiarazioni non veritiere,
        inesatte o incomplete sulla responsabilità genitoriale o sul consenso
        dell’altro genitore.
      </p>
      <p>
        L’autorizzazione può essere revocata in ogni momento scrivendo a
        {LEGAL_CONTACT_EMAIL}: da quel momento l’Atleta non può più prenotare nuove
        Sessioni.
      </p>
      <p>
        Il Coach è informato che l’Atleta è minorenne prima di accettare la
        richiesta. La riservatezza di quanto il ragazzo condivide non è mai un
        ostacolo alla sua tutela: quando emergono elementi che riguardano la sua
        salute o la sua incolumità, il Coach coinvolge la famiglia.
      </p>

      <h2>6. Coach e verifica dei profili</h2>
      <p>
        I profili dei Coach sono soggetti ad approvazione da parte di KaiPai
        prima della pubblicazione. Le verifiche di identità e delle
        certificazioni indicate sul profilo sono effettuate sulla base della
        documentazione fornita dal Coach, che ne garantisce la veridicità. Il
        profilo pubblico riporta inoltre indicatori di esperienza calcolati
        automaticamente dalla Piattaforma sulle sole Sessioni completate.
      </p>
      <p>
        KaiPai seleziona i Coach con cura ma non garantisce l’esito del percorso
        né l’idoneità del singolo Coach alle tue esigenze specifiche. Se il
        rapporto non funziona puoi interromperlo in qualsiasi momento e
        rivolgerti a un altro Coach.
      </p>

      <h2>7. Accesso tramite Club e società sportive</h2>
      <p>
        L’accesso al servizio può avvenire nell’ambito di un accordo fra KaiPai
        e un Club. In tal caso il Club individua i tesserati che possono
        registrarsi, ma{' '}
        <strong>
          il rapporto sulla Piattaforma resta fra l’Atleta (o il suo Tutore) e
          KaiPai
        </strong>
        : il Club non accede ai contenuti delle Sessioni né alle chat, e non
        riceve informazioni su ciò di cui l’Atleta parla con il Coach.
      </p>
      <p>
        La cessazione dell’accordo fra KaiPai e il Club, o del tesseramento
        dell’Atleta presso il Club, può comportare la cessazione dell’accesso al
        servizio: in tal caso ne sarai informato con ragionevole preavviso.
      </p>

      <h2>8. Sessioni e prenotazioni</h2>
      <p>
        La richiesta di Sessione inviata dall’Atleta costituisce una proposta;
        la Sessione è confermata solo con l’accettazione del Coach. Se il Coach
        non risponde entro {REQUEST_RESPONSE_WINDOW_HOURS} ore, o se nel
        frattempo l’orario richiesto è trascorso, la richiesta decade
        automaticamente e nessuna delle due parti è vincolata.
      </p>
      <p>
        Un Coach può inoltre proporre direttamente un appuntamento a un Atleta
        con cui ha già lavorato: in tal caso la Sessione nasce già confermata, e
        l’Atleta resta libero di annullarla se l’orario non gli è congeniale.
      </p>
      <p>
        Entrambe le parti possono annullare una Sessione fino al suo
        svolgimento. È buona norma farlo con almeno{' '}
        <strong>{CANCELLATION_NOTICE_HOURS} ore</strong> di preavviso: il tempo
        è comunque riservato dall’altra parte. Alla data di questi Termini
        nessuna penale è dovuta per un annullamento tardivo; se in futuro
        verranno introdotti corrispettivi, le regole di cancellazione saranno
        aggiornate e comunicate prima di applicarsi.
      </p>

      <h2>9. Accesso al servizio e corrispettivi</h2>
      <p>
        Alla data di ultimo aggiornamento di questi Termini, l’accesso alle
        Sessioni avviene attraverso accordi stipulati con Club e organizzazioni,
        e{' '}
        <strong>
          la Piattaforma non gestisce pagamenti diretti da parte degli utenti
        </strong>
        : non sono richiesti dati di pagamento né sono previsti addebiti
        all’Atleta o alla famiglia. Qualora venissero introdotte funzioni di
        pagamento, queste condizioni saranno aggiornate e la modifica comunicata
        prima dell’attivazione.
      </p>

      <h2>10. Videochiamate e messaggi</h2>
      <p>
        La Sessione si svolge in videochiamata all’interno della Piattaforma. La
        stanza virtuale si apre pochi minuti prima dell’orario concordato e
        resta accessibile per una finestra ragionevole successiva, così da
        assorbire piccoli ritardi. Il video{' '}
        <strong>non viene mai registrato</strong>. L’audio viene registrato solo
        se entrambi attivano gli Appunti AI, alle condizioni dell’art. 11.
      </p>
      <p>
        La Sessione va svolta da un luogo che ne garantisca la riservatezza,{' '}
        <strong>
          senza la presenza di terzi non autorizzati, dichiarata o meno
        </strong>
        . È una responsabilità di entrambe le parti: la qualità del lavoro
        dipende dal fatto che l’Atleta possa parlare liberamente.
      </p>
      <p>
        La chat collegata alla Sessione è riservata ai due partecipanti e serve
        a organizzare gli appuntamenti e a dare continuità al percorso. È
        vietato registrare, riprendere, fotografare o diffondere il contenuto di
        una Sessione o di una conversazione senza il consenso esplicito
        dell’altra parte. La violazione di questo divieto consente a KaiPai di
        sospendere immediatamente l’account, fermo il risarcimento del danno.
      </p>

      <h2>11. Appunti AI della Sessione</h2>
      <p>
        Gli <strong>Appunti AI</strong> sono una funzione facoltativa e
        disattivata per impostazione predefinita. Quando è attiva, l’audio della
        Sessione viene registrato e trascritto automaticamente, e da quella
        trascrizione viene preparata una bozza di report.
      </p>
      <p>
        <strong>
          La registrazione richiede il consenso di entrambi i partecipanti
        </strong>
        , raccolto separatamente prima dell’inizio. Se anche uno solo rifiuta,
        non viene registrato nulla. Il consenso è revocabile in qualsiasi
        momento, anche a Sessione in corso: dalla revoca la registrazione si
        interrompe. Il rifiuto non pregiudica in alcun modo lo svolgimento della
        Sessione né la qualità del servizio.
      </p>
      <p>
        <strong>Il report non viene mai pubblicato automaticamente.</strong> La
        bozza è visibile al solo Coach, che ha l’obbligo di rivederla prima di
        qualsiasi condivisione: deve correggere ciò che è impreciso, eliminare
        ciò che non deve restare e decidere che cosa condividere con l’Atleta.
        Il Coach distingue fra note condivise e note private; l’Atleta vede
        soltanto le prime.
      </p>
      <p>
        La trascrizione è generata automaticamente e{' '}
        <strong>può contenere errori</strong>: non è un verbale, non fa fede fra
        le parti e non sostituisce il ricordo o il giudizio del Coach. Il report
        non costituisce documento clinico né valutazione diagnostica, e vale
        quanto detto all’articolo seguente sulla natura del servizio.
      </p>
      <p>
        Tempi di conservazione, fornitori coinvolti e diritti esercitabili sono
        descritti nell’Informativa Privacy. La registrazione audio grezza viene
        cancellata automaticamente decorsi {AI_AUDIO_RETENTION_DAYS} giorni.
      </p>
      <p>
        Se l’Atleta è minorenne, la funzione richiede che l’account sia già
        autorizzato dal genitore o tutore, in aggiunta ai consensi di cui sopra.
      </p>

      <h2>12. Natura del servizio e limiti dell’intervento</h2>
      <p>
        Il coaching mentale sportivo non costituisce prestazione sanitaria né
        sostituisce percorsi clinici, psicoterapeutici o medici.{' '}
        <strong>
          KaiPai non fornisce assistenza in situazioni di emergenza
        </strong>{' '}
        — fra cui pensieri suicidari, rischio di lesioni a sé o ad altri: in
        questi casi contatta immediatamente i servizi sanitari competenti o il
        numero unico di emergenza <strong>112</strong>.
      </p>
      <p>
        Poiché il servizio non è sanitario, la Piattaforma{' '}
        <strong>non è destinata a contenere informazioni cliniche</strong>. Non
        inserire nei campi liberi — obiettivi, note, messaggi in chat —
        diagnosi, terapie, farmaci o altri dati relativi alla salute, tuoi o di
        terzi. Trovi il dettaglio nella{' '}
        <a href="/privacy" className={A}>
          Privacy Policy
        </a>
        .
      </p>
      <p>
        Il Coach è tenuto a riconoscere i limiti del proprio intervento: quando
        emerge un bisogno di natura clinica deve interrompere il percorso e
        indirizzare la persona verso un professionista sanitario, coinvolgendo
        la famiglia se l’Atleta è minorenne.
      </p>

      <h2>13. Obblighi del Coach verso l’Atleta</h2>
      <p>
        Il Coach è un professionista indipendente e, per la propria attività,
        tratta i dati dell’Atleta in qualità di autonomo titolare. Accettando
        questi Termini si obbliga a:
      </p>
      <ul>
        <li>
          mantenere la <strong>riservatezza</strong> su quanto appreso durante
          le Sessioni e nella chat;
        </li>
        <li>
          usare i dati dell’Atleta <strong>esclusivamente</strong> per erogare
          le Sessioni richieste, senza cederli a terzi né impiegarli per proprie
          comunicazioni commerciali;
        </li>
        <li>
          non contattare l’Atleta al di fuori della Piattaforma per finalità
          diverse dal percorso concordato;
        </li>
        <li>
          non registrare né diffondere audio, video o testi delle Sessioni;
        </li>
        <li>
          adottare particolare cautela con gli Atleti minorenni, dei quali è
          informato prima di accettare la richiesta.
        </li>
      </ul>
      <p>
        Se un Coach cessa di operare sulla Piattaforma, i percorsi in corso si
        interrompono: KaiPai te ne dà notizia e ti aiuta a individuare un altro
        Coach. Lo storico delle Sessioni già svolte resta disponibile nella tua
        area personale.
      </p>

      <h2>14. Recensioni</h2>
      <p>
        Solo l’Atleta che ha effettivamente svolto una Sessione può recensirla,
        e può farlo una sola volta per Sessione: ogni recensione pubblicata
        corrisponde quindi a un incontro realmente avvenuto. Il Coach può
        replicare pubblicamente. KaiPai può rimuovere le recensioni che violano
        questi Termini, ma non le modifica e non le rimuove su semplice
        richiesta del Coach recensito.
      </p>

      <h2>15. Condotta degli utenti</h2>
      <ul>
        <li>È vietato pubblicare contenuti offensivi, falsi o illeciti.</li>
        <li>
          È vietato utilizzare la Piattaforma per finalità diverse dal coaching
          sportivo.
        </li>
        <li>
          È vietato contattare altri utenti per proporre servizi non attinenti o
          per sollecitazioni commerciali.
        </li>
        <li>
          È vietato tentare di accedere ad aree o dati non destinati al proprio
          account.
        </li>
      </ul>

      <h2>16. Contenuti che carichi tu</h2>
      <p>
        I contenuti che carichi — fotografia, video di presentazione, biografia,
        descrizioni dei servizi — restano di tua proprietà. Caricandoli concedi a
        KaiPai una licenza gratuita e non esclusiva, limitata a mostrarli sulla
        Piattaforma per la finalità per cui li hai forniti, revocabile
        rimuovendo il contenuto o chiudendo l’account. Garantisci di avere i
        diritti necessari sul materiale che pubblichi, comprese le liberatorie
        delle persone eventualmente ritratte.
      </p>

      <h2>17. Proprietà intellettuale di KaiPai</h2>
      <p>
        La Piattaforma, il suo codice, la struttura, le interfacce, i testi, la
        grafica, il marchio e il nome «KaiPai» sono protetti da diritti di
        proprietà intellettuale di titolarità esclusiva di KaiPai. Ti è concessa
        una licenza d’uso <strong>non esclusiva, gratuita, non trasferibile e
        non sublicenziabile</strong>, limitata a fruire del servizio.
      </p>
      <p>In particolare non è consentito:</p>
      <ul>
        <li>
          copiare, riprodurre, distribuire o pubblicare contenuti, funzionalità
          o elementi grafici della Piattaforma;
        </li>
        <li>
          usare robot, spider, crawler o qualsiasi altro strumento automatico
          per <strong>estrarre, raccogliere o indicizzare</strong> in modo
          massivo i dati della Piattaforma, in particolare l’elenco dei Coach e
          i loro profili;
        </li>
        <li>
          decompilare, disassemblare o effettuare reverse engineering del
          software;
        </li>
        <li>
          aggirare misure tecniche di protezione o accedere ad aree non
          autorizzate;
        </li>
        <li>
          usare know-how, testi, format o materiali di KaiPai per realizzare
          servizi analoghi o derivati.
        </li>
      </ul>

      <h2>18. Diritto di recesso</h2>
      <p>
        Se agisci come consumatore hai diritto di recedere dal contratto entro{' '}
        <strong>14 giorni</strong> dalla registrazione, senza doverne indicare
        il motivo, scrivendo a {LEGAL_CONTACT_EMAIL} o chiudendo l’account dalla
        sezione Sicurezza.
      </p>
      <p>
        Poiché alla data di questi Termini il servizio non prevede corrispettivi
        a carico dell’Atleta, dal recesso non deriva alcun rimborso né alcun
        addebito. Se in futuro verranno introdotti pagamenti, ti sarà chiesto di
        confermare espressamente la richiesta di avviare il servizio prima della
        scadenza dei 14 giorni: in tal caso, una volta fruita la Sessione,
        perderai il diritto di recesso rispetto ad essa ai sensi dell’art. 59,
        co. 1, lett. a) del Codice del Consumo.
      </p>
      <p>
        Resta in ogni caso ferma la tua facoltà di interrompere il percorso con
        un Coach in qualsiasi momento, e quella di annullare una singola
        Sessione secondo l’art. 8.
      </p>

      <h2>19. Chiusura dell’account e inattività</h2>
      <p>
        Puoi chiudere il tuo account in qualsiasi momento dalla sezione
        Sicurezza. Un account resta inoltre soggetto a chiusura dopo{' '}
        {INACTIVITY_MONTHS} mesi senza alcuna attività sulla Piattaforma: da
        quel momento decorrono i termini di conservazione indicati nella Privacy
        Policy.
      </p>
      <p>
        La chiusura disattiva immediatamente l’accesso; lo storico delle
        Sessioni, i messaggi e le recensioni restano conservati perché
        riguardano anche l’altra parte coinvolta. Per la cancellazione integrale
        dei dati personali si applica quanto previsto dalla{' '}
        <a href="/privacy" className={A}>
          Privacy Policy
        </a>
        .
      </p>

      <h2>20. Sospensione e risoluzione</h2>
      <p>
        Gli obblighi previsti dagli articoli 4 (registrazione e veridicità dei
        dati), 10 (divieto di registrazione e diffusione delle Sessioni), 14
        (condotta) e 16 (proprietà intellettuale) hanno carattere{' '}
        <strong>essenziale</strong>: il loro inadempimento consente a KaiPai di
        risolvere il contratto di diritto ai sensi dell’art. 1456 c.c., con
        comunicazione all’indirizzo email associato all’account, fermo il
        risarcimento del danno.
      </p>
      <p>
        Nei casi meno gravi, o quando è necessario un accertamento, KaiPai può
        sospendere temporaneamente l’accesso dandone notizia. La sospensione o
        la risoluzione non danno diritto ad alcun rimborso.
      </p>

      <h2>21. Disponibilità del servizio e forza maggiore</h2>
      <p>
        KaiPai cura la manutenzione della Piattaforma perché il servizio
        funzioni, ma può doverla sospendere temporaneamente per interventi di
        aggiornamento, manutenzione o sicurezza, dandone preavviso quando
        possibile.
      </p>
      <p>
        KaiPai non risponde del mancato o ritardato adempimento dovuto a eventi
        fuori dal proprio ragionevole controllo — fra cui guasti della rete
        internet, blackout, malfunzionamenti di fornitori terzi, eventi naturali
        eccezionali, o l’impedimento del Coach per malattia. In tali casi le
        Sessioni interessate vengono riprogrammate.
      </p>

      <h2>22. Limitazione di responsabilità</h2>
      <p>
        KaiPai non garantisce specifici risultati sportivi o personali derivanti
        dalle Sessioni. Nei limiti consentiti dalla legge, KaiPai non risponde
        dei contenuti e delle prestazioni professionali erogate dai Coach, che
        agiscono in piena autonomia professionale, né delle interruzioni del
        servizio dovute a cause non imputabili alla Piattaforma, compresi i
        malfunzionamenti della connessione degli utenti o dei fornitori terzi.
      </p>
      <p>
        Nulla in questi Termini limita la responsabilità di KaiPai per dolo o
        colpa grave, né i diritti che la legge riconosce inderogabilmente al
        consumatore.
      </p>

      <h2>23. Nullità parziale</h2>
      <p>
        Se una clausola di questi Termini fosse dichiarata nulla, illegittima o
        inefficace, ciò non pregiudica la validità e l’efficacia delle restanti
        previsioni, che continuano ad applicarsi.
      </p>

      <h2>24. Legge applicabile e controversie</h2>
      <p>
        {/* DA COMPLETARE: indicare il foro competente. Attenzione: verso un
            consumatore è inderogabilmente competente il giudice del suo luogo
            di residenza o domicilio (art. 66-bis Codice del Consumo), quindi
            una clausola di foro esclusivo a Genova sarebbe vessatoria e nulla
            nei suoi confronti. Un foro convenzionale può valere solo verso
            Coach e Club che agiscono professionalmente. */}
        Questi Termini sono regolati dalla legge italiana. Per quanto non
        espressamente disciplinato si rinvia al Codice del Consumo, ove
        applicabile.
      </p>
      <p>
        Se sei un consumatore, per le controversie è competente il giudice del
        luogo in cui risiedi o hai eletto domicilio. Prima di rivolgerti al
        giudice puoi tentare una risoluzione stragiudiziale rivolgendoti a un
        organismo ADR accreditato: scrivici a {LEGAL_CONTACT_EMAIL} e ti indicheremo
        quello competente.
      </p>

      <h2>25. Contatti</h2>
      <p>Per qualsiasi domanda su questi Termini: {LEGAL_CONTACT_EMAIL}.</p>
    </LegalPage>
  );
}
