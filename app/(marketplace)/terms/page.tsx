import { LegalPage } from '../legal-layout';
import { LEGAL_LAST_UPDATED } from '@/lib/core/legal/processors';
import { REQUEST_RESPONSE_WINDOW_HOURS } from '@/lib/core/sessions';
import { MIN_SIGNUP_AGE, AGE_OF_MAJORITY } from '@/lib/core/guardians/age';

export const metadata = { title: 'Termini e Condizioni — KaiPai' };

export default function TermsPage() {
  return (
    <LegalPage title="Termini e Condizioni" updated={LEGAL_LAST_UPDATED}>
      <h2>1. Oggetto del servizio</h2>
      <p>
        {/* DA COMPLETARE: ragione sociale, sede legale e P.IVA del gestore
            della piattaforma, oltre al foro competente in caso di
            controversia. */}
        KaiPai è una piattaforma che mette in contatto atleti, squadre e
        famiglie con mental coach sportivi professionisti («Coach»). KaiPai
        facilita la ricerca del coach, la richiesta di sessioni, la
        comunicazione e lo svolgimento di sessioni in videochiamata; non è
        parte del rapporto professionale tra atleta e Coach, che si instaura
        direttamente fra le due parti.
      </p>

      <h2>2. Registrazione e account</h2>
      <p>
        La registrazione richiede un indirizzo email valido e, per gli atleti,
        la data di nascita. L’utente è responsabile della riservatezza delle
        proprie credenziali e delle attività svolte con il proprio account.
      </p>

      <h2>3. Età minima e atleti minorenni</h2>
      <p>
        KaiPai è offerto agli atleti a partire dai{' '}
        <strong>{MIN_SIGNUP_AGE} anni</strong>. Al di sotto di questa età la
        registrazione non è consentita e le richieste vengono rifiutate.
      </p>
      <p>
        Fra i {MIN_SIGNUP_AGE} e i {AGE_OF_MAJORITY} anni l’atleta può
        registrarsi e consultare la piattaforma, ma{' '}
        <strong>
          non può richiedere né ricevere sessioni finché chi esercita la
          responsabilità genitoriale non ha autorizzato il percorso
        </strong>
        . La ragione è che questi Termini sono un contratto e un minore non ha
        la capacità di concluderlo validamente (artt. 2 e 1425 c.c.): il
        contratto è quindi concluso dal genitore o tutore, che lo accetta per
        conto dell’atleta.
      </p>
      <p>
        L’autorizzazione si presta da un link personale inviato per email, senza
        creare un account. Chi la presta dichiara di esercitare la
        responsabilità genitoriale e di agire, ove presente, anche con
        l’accordo dell’altro genitore (art. 316 c.c.). Registriamo data, ora e
        indirizzo di rete della conferma come prova. L’autorizzazione può essere
        revocata in ogni momento scrivendo a info@kaipai.com: da quel momento
        l’atleta non può più prenotare nuove sessioni.
      </p>
      <p>
        Il coach è informato che l’atleta è minorenne prima di accettare la
        richiesta. La riservatezza di quanto il ragazzo condivide non è mai un
        ostacolo alla sua tutela: quando emergono elementi che riguardano la
        sua salute o la sua incolumità, il coach coinvolge la famiglia.
      </p>
      <p>
        Il genitore o tutore risponde delle attività svolte dal minore sulla
        piattaforma e resta il referente per ogni comunicazione che lo riguardi.
      </p>

      <h2>4. Coach e verifica dei profili</h2>
      <p>
        I profili dei Coach sono soggetti ad approvazione da parte di KaiPai
        prima della pubblicazione. Le verifiche di identità e delle
        certificazioni indicate sul profilo sono effettuate sulla base della
        documentazione fornita dal Coach, che ne garantisce la veridicità. Il
        profilo pubblico riporta inoltre indicatori di esperienza calcolati
        automaticamente dalla piattaforma sulle sole sessioni completate.
      </p>

      <h2>5. Sessioni e prenotazioni</h2>
      <p>
        La richiesta di sessione inviata dall’atleta costituisce una proposta;
        la sessione è confermata solo con l’accettazione del Coach. Se il Coach
        non risponde entro {REQUEST_RESPONSE_WINDOW_HOURS} ore, o se nel
        frattempo l’orario richiesto è trascorso, la richiesta decade
        automaticamente e nessuna delle due parti è vincolata.
      </p>
      <p>
        Un Coach può inoltre proporre direttamente un appuntamento a un atleta
        con cui ha già lavorato: in tal caso la sessione nasce già confermata, e
        l’atleta resta libero di annullarla se l’orario non gli è congeniale.
        Entrambe le parti possono annullare una sessione fino al suo
        svolgimento.
      </p>

      <h2>6. Accesso al servizio e corrispettivi</h2>
      <p>
        Alla data di ultimo aggiornamento di questi termini, l’accesso alle
        sessioni avviene attraverso accordi stipulati con società sportive,
        club e organizzazioni, e{' '}
        <strong>
          la piattaforma non gestisce pagamenti diretti da parte degli utenti
        </strong>
        : non sono richiesti dati di pagamento né sono previsti addebiti
        all’atleta o alla famiglia. Qualora venissero introdotte funzioni di
        pagamento in piattaforma, queste condizioni saranno aggiornate e la
        modifica comunicata prima dell’attivazione.
      </p>

      <h2>7. Videochiamate e messaggi</h2>
      <p>
        La sessione si svolge in videochiamata all’interno della piattaforma. La
        stanza virtuale si apre pochi minuti prima dell’orario concordato e
        resta accessibile per una finestra ragionevole successiva, così da
        assorbire piccoli ritardi. Le videochiamate{' '}
        <strong>non vengono registrate</strong>.
      </p>
      <p>
        La chat collegata alla sessione è riservata ai due partecipanti. È
        vietato registrare, riprendere o diffondere il contenuto di una sessione
        o di una conversazione senza il consenso esplicito dell’altra parte.
      </p>

      <h2>8. Natura del servizio</h2>
      <p>
        Il coaching mentale sportivo non costituisce prestazione sanitaria né
        sostituisce percorsi clinici, psicoterapeutici o medici. In caso di
        emergenza o di difficoltà psicologica grave, contatta i servizi
        sanitari competenti o il numero di emergenza 112.
      </p>

      <h2>9. Recensioni</h2>
      <p>
        Solo l’atleta che ha effettivamente svolto una sessione può recensirla, e
        può farlo una sola volta per sessione: ogni recensione pubblicata
        corrisponde quindi a un incontro realmente avvenuto. Il Coach può
        replicare pubblicamente. KaiPai può rimuovere le recensioni che violano
        i presenti termini, ma non le modifica e non le rimuove su semplice
        richiesta del Coach recensito.
      </p>

      <h2>10. Condotta degli utenti</h2>
      <ul>
        <li>È vietato pubblicare contenuti offensivi, falsi o illeciti.</li>
        <li>
          È vietato utilizzare la piattaforma per finalità diverse dal coaching
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
      <p>
        In caso di violazione KaiPai può sospendere o chiudere l’account, e
        rimuovere il profilo pubblico di un Coach.
      </p>

      <h2>11. Contenuti caricati</h2>
      <p>
        I contenuti che carichi — fotografia, video di presentazione, biografia,
        descrizioni dei servizi — restano di tua proprietà. Caricandoli concedi a
        KaiPai una licenza gratuita e non esclusiva, limitata a mostrarli sulla
        piattaforma per la finalità per cui li hai forniti, revocabile
        rimuovendo il contenuto o chiudendo l’account. Garantisci di avere i
        diritti necessari sul materiale che pubblichi, comprese le liberatorie
        delle persone eventualmente ritratte.
      </p>

      <h2>12. Chiusura dell’account</h2>
      <p>
        Puoi chiudere il tuo account in qualsiasi momento dalla sezione
        Sicurezza. La chiusura disattiva immediatamente l’accesso; lo storico
        delle sessioni, i messaggi e le recensioni restano conservati perché
        riguardano anche l’altra parte coinvolta. Per la cancellazione integrale
        dei dati personali si applica quanto previsto dalla{' '}
        <a href="/privacy" className="text-red-600 underline hover:text-red-700">
          Privacy Policy
        </a>
        .
      </p>

      <h2>13. Limitazione di responsabilità</h2>
      <p>
        KaiPai non garantisce specifici risultati sportivi o personali derivanti
        dalle sessioni. Nei limiti consentiti dalla legge, KaiPai non risponde
        dei contenuti e delle prestazioni professionali erogate dai Coach, né
        delle interruzioni del servizio dovute a cause tecniche non imputabili
        alla piattaforma, compresi i malfunzionamenti della connessione degli
        utenti o dei fornitori terzi.
      </p>

      <h2>14. Modifiche</h2>
      <p>
        KaiPai può aggiornare i presenti termini; le modifiche rilevanti saranno
        comunicate agli utenti registrati. L’uso continuato della piattaforma
        dopo la modifica costituisce accettazione.
      </p>

      <h2>15. Contatti</h2>
      <p>Per qualsiasi domanda sui presenti termini: info@kaipai.com.</p>
    </LegalPage>
  );
}
