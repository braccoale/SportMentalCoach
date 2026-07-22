import { LegalPage } from '../legal-layout';
import { LEGAL_LAST_UPDATED } from '@/lib/core/legal/processors';

export const metadata = { title: 'Cookie Policy — KaiPai' };

export default function CookiePage() {
  return (
    <LegalPage title="Cookie Policy" updated={LEGAL_LAST_UPDATED}>
      <h2>1. Cosa sono i cookie</h2>
      <p>
        I cookie sono piccoli file di testo che un sito salva nel browser per
        ricordare informazioni fra una pagina e l’altra. KaiPai utilizza
        esclusivamente cookie tecnici, indispensabili al funzionamento della
        piattaforma.
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

      <h2>4. Cookie di profilazione e di terze parti</h2>
      <p>
        KaiPai <strong>non utilizza</strong> cookie di profilazione, cookie
        pubblicitari, pixel di tracciamento o strumenti di statistica di terze
        parti. Non essendo presenti cookie che richiedono il consenso, non viene
        mostrato alcun banner: i cookie tecnici sono esenti ai sensi dell’art.
        122 del Codice Privacy.
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
        sono cookie di terze parti da consentire.
      </p>
      <p>
        Per lo stesso motivo i caratteri tipografici del sito sono ospitati sui
        nostri server e non richiamati da servizi esterni.
      </p>

      <h2>6. Gestione dei cookie</h2>
      <p>
        Puoi cancellare o bloccare i cookie dalle impostazioni del tuo browser.
        Tieni presente che, senza i cookie tecnici di autenticazione, l’accesso
        all’area personale non può funzionare: resteresti scollegato a ogni
        cambio di pagina. Le notifiche push si disattivano invece dall’apposito
        pulsante nella sezione notifiche, oppure dalle impostazioni del sito nel
        browser.
      </p>

      <h2>7. Contatti</h2>
      <p>
        Per qualsiasi domanda su questa policy: info@kaipai.com. Vedi anche la{' '}
        <a href="/privacy" className="text-red-600 underline hover:text-red-700">
          Privacy Policy
        </a>{' '}
        per il quadro completo dei trattamenti.
      </p>
    </LegalPage>
  );
}
