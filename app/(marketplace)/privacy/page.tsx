import { LegalPage } from '../legal-layout';
import { SUB_PROCESSORS, LEGAL_LAST_UPDATED } from '@/lib/core/legal/processors';
import { MIN_SIGNUP_AGE } from '@/lib/core/guardians/age';

export const metadata = { title: 'Privacy Policy — KaiPai' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={LEGAL_LAST_UPDATED}>
      <h2>1. Titolare del trattamento</h2>
      <p>
        {/* DA COMPLETARE: ragione sociale, sede legale, P.IVA / C.F. e, se
            nominato, i contatti del Responsabile della protezione dei dati.
            Senza questi elementi l'informativa non è conforme all'art. 13 GDPR. */}
        Il titolare del trattamento dei dati è KaiPai, con sede a Genova
        (contatto: info@kaipai.com). La presente informativa è resa ai sensi
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
          dell’autorizzazione prestata (vedi la sezione 10).
        </li>
        <li>
          <strong>Dati tecnici</strong>: indirizzo IP e informazioni sul
          browser, trattati dall’infrastruttura di hosting per servire le
          pagine e per la sicurezza.
        </li>
      </ul>

      <h2>3. Finalità e base giuridica</h2>
      <p>
        I dati sono trattati per erogare il servizio e permettere l’incontro fra
        atleti e Coach (esecuzione del contratto), per inviare comunicazioni di
        servizio come conferme e promemoria di sessione (esecuzione del
        contratto), per garantire la sicurezza della piattaforma e prevenirne
        gli abusi (legittimo interesse) e per adempiere a obblighi di legge.
      </p>

      <h2>4. Dati pubblici del profilo Coach</h2>
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

      <h2>5. Videochiamate e chat</h2>
      <p>
        Le videochiamate si svolgono attraverso un’infrastruttura specializzata
        e <strong>non vengono registrate</strong>: audio e video transitano per
        il tempo della sessione e non sono conservati. Della sessione restano
        solo l’orario di inizio e di fine. I messaggi di chat sono invece
        conservati, per permettere a entrambi di rileggere gli accordi presi, e
        sono accessibili unicamente ai due partecipanti alla conversazione.
      </p>

      <h2>6. Email e notifiche push</h2>
      <p>
        Le email che inviamo sono esclusivamente di servizio, legate a fatti che
        ti riguardano: una richiesta ricevuta, una sessione confermata o
        annullata, un nuovo messaggio. Non inviamo comunicazioni commerciali.
        Puoi disattivarle per singola tipologia dalle preferenze di notifica del
        tuo account; le notifiche all’interno della piattaforma restano sempre
        attive.
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

      <h2>7. Responsabili del trattamento</h2>
      <p>
        Ci avvaliamo dei seguenti fornitori, che trattano i dati per nostro
        conto e su nostra istruzione, in qualità di responsabili del
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
        trasferimento avviene sulla base delle Clausole Contrattuali Standard
        approvate dalla Commissione Europea.
      </p>

      <h2>8. Conservazione</h2>
      <ul>
        <li>
          <strong>Account e profilo</strong>: finché l’account resta attivo.
        </li>
        <li>
          <strong>Prenotazioni e storico delle sessioni</strong>: per la durata
          del rapporto e successivamente per il tempo necessario a difendere un
          diritto in sede giudiziaria.
        </li>
        <li>
          <strong>Messaggi di chat</strong>: finché resta attivo l’account di
          almeno uno dei due partecipanti.
        </li>
        <li>
          <strong>Iscrizioni alle notifiche push</strong>: fino alla revoca, o
          fino a quando il servizio push segnala il dispositivo come non più
          raggiungibile — nel qual caso l’iscrizione viene rimossa
          automaticamente.
        </li>
        <li>
          <strong>Recensioni</strong>: restano pubblicate anche dopo la
          chiusura dell’account di chi le ha scritte, perché concorrono alla
          reputazione del Coach recensito.
        </li>
      </ul>

      <h2>9. Chiusura dell’account</h2>
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
        sensi dell’art. 17 GDPR, scrivi a info@kaipai.com: vi daremo seguito nei
        limiti degli obblighi di conservazione previsti dalla legge.
      </p>

      <h2>10. Atleti minorenni</h2>
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

      <h2>11. Diritti dell’interessato</h2>
      <p>
        Puoi esercitare in ogni momento i diritti previsti dagli artt. 15–22
        GDPR (accesso, rettifica, cancellazione, limitazione, portabilità e
        opposizione) scrivendo a info@kaipai.com; risponderemo entro un mese
        dalla richiesta. Se ritieni che il trattamento violi il Regolamento,
        hai diritto di proporre reclamo al Garante per la protezione dei dati
        personali.
      </p>
    </LegalPage>
  );
}
