import { LegalPage } from '../legal-layout';
import {
  LEGAL_LAST_UPDATED,
  LEGAL_CONTACT_EMAIL,
} from '@/lib/core/legal/processors';

export const metadata = { title: 'Cookie Policy — KaiPai' };

export default function CookiePage() {
  return (
    <LegalPage title="Cookie Policy" updated={LEGAL_LAST_UPDATED}>
      <h2>1. Cosa sono i cookie</h2>
      <p>
        I cookie sono piccoli file di testo che un sito salva nel browser per
        ricordare informazioni fra una pagina e l’altra. KaiPai utilizza cookie
        tecnici indispensabili e, solo dopo il tuo consenso, cookie analytics.
      </p>

      <h2>2. Cookie utilizzati</h2>
      <ul>
        <li>
          <strong>Cookie di sessione e autenticazione</strong> (impostati da
          Supabase Auth): mantengono l’accesso al tuo account fra una pagina e
          l’altra e permettono di rinnovare la sessione senza chiederti la
          password a ogni passaggio. Durata: la sessione di lavoro, con rinnovo
          automatico finché resti attivo.
        </li>
        <li>
          <strong>kp_analytics_consent</strong> (KaiPai): ricorda se hai
          accettato o rifiutato Google Analytics, evitando di ripresentare il
          banner a ogni visita. È un cookie tecnico e dura 6 mesi.
        </li>
        <li>
          <strong>kp_locale</strong> (KaiPai): ricorda la lingua
          dell’interfaccia scelta nelle impostazioni. Contiene esclusivamente
          il codice della lingua, è un cookie funzionale e dura 12 mesi.
        </li>
        <li>
          <strong>_ga</strong> e <strong>_ga_773FBGVP7J</strong> (Google
          Analytics): distinguono in modo pseudonimo un browser e mantengono lo
          stato della sessione per produrre statistiche aggregate. Vengono
          creati soltanto se accetti e scadono dopo 6 mesi senza rinnovo a ogni
          visita.
        </li>
      </ul>

      <h2>3. Altre tecnologie di memorizzazione</h2>
      <p>
        Oltre ai cookie, la piattaforma può salvare alcune informazioni nella
        memoria locale del browser. Non sono cookie in senso tecnico, ma le
        dichiariamo per trasparenza.
      </p>
      <ul>
        <li>
          <strong>Service worker</strong>: un piccolo programma registrato dal
          browser che serve unicamente a mostrare le notifiche push quando
          arrivano. Non conserva copie delle pagine, non abilita l’uso offline e
          non raccoglie dati di navigazione. Viene registrato solo se attivi le
          notifiche.
        </li>
        <li>
          <strong>Iscrizione alle notifiche push</strong>: se le attivi, il
          browser genera un identificativo del dispositivo che conserviamo per
          poterti recapitare gli avvisi. Si rimuove disattivando le notifiche.
        </li>
      </ul>

      <h2>4. Google Analytics e cookie di terze parti</h2>
      <p>
        KaiPai utilizza Google Analytics 4 (misurazione{' '}
        <strong>G-773FBGVP7J</strong>) per capire, in forma aggregata, quali
        pagine vengono visitate e come viene usato il servizio. Il tag Google
        non viene caricato e nessun dato viene inviato a Google finché non premi
        «Accetta analytics».
      </p>
      <p>
        Le funzioni pubblicitarie, Google Signals e la personalizzazione degli
        annunci sono disattivate. Non inviamo a Google nome, email o
        identificativi dell’account. Puoi continuare senza analytics usando il
        pulsante di rifiuto o la X del banner, senza perdere alcuna funzione.
      </p>

      <h2>5. Video di presentazione dei coach</h2>
      <p>
        Alcuni coach pubblicano un video di presentazione ospitato su YouTube o
        Vimeo. Un video incorporato normalmente contatta quei servizi non appena
        apri la pagina, consegnando loro il tuo indirizzo IP e permettendo di
        installare cookie <em>prima</em> che tu abbia scelto alcunché.
      </p>
      <p>
        Per evitarlo <strong>non carichiamo il video automaticamente</strong>:
        al suo posto vedi un’anteprima disegnata da noi, e nessuna richiesta
        parte finché non premi «Guarda la presentazione». Solo da quel momento
        YouTube o Vimeo ricevono i tuoi dati e possono impostare cookie propri,
        soggetti alle loro informative. Se non premi, non li contatti mai — ed è
        la ragione per cui questa pagina può ancora dire, con verità, che non ci
        sono ulteriori cookie di terze parti attivati dalla tua azione sul
        video, indipendenti dalla scelta relativa a Google Analytics.
      </p>
      <p>
        Per lo stesso motivo i caratteri tipografici del sito sono ospitati sui
        nostri server e non richiamati da servizi esterni.
      </p>

      <h2>6. Gestione dei cookie</h2>
      <p>
        Puoi cambiare in qualsiasi momento la scelta analytics dal collegamento{' '}
        <strong>«Preferenze cookie»</strong> presente nel footer di ogni pagina.
        Se revochi il consenso, KaiPai disattiva Analytics e cancella dal
        browser i cookie <strong>_ga</strong> e{' '}
        <strong>_ga_773FBGVP7J</strong>. Puoi inoltre cancellare o bloccare i
        cookie dalle impostazioni del tuo browser.
        Tieni presente che, senza i cookie tecnici di autenticazione, l’accesso
        all’area personale non può funzionare: resteresti scollegato a ogni
        cambio di pagina. Le notifiche push si disattivano invece dall’apposito
        pulsante nella sezione notifiche, oppure dalle impostazioni del sito nel
        browser.
      </p>

      <h2>7. Contatti</h2>
      <p>
        Per qualsiasi domanda su questa policy: {LEGAL_CONTACT_EMAIL}. Vedi anche la{' '}
        <a href="/privacy" className="text-red-600 underline hover:text-red-700">
          Privacy Policy
        </a>{' '}
        per il quadro completo dei trattamenti.
      </p>
    </LegalPage>
  );
}
