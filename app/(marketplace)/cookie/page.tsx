import { LegalPage } from '../legal-layout';

export const metadata = { title: 'Cookie Policy — Kai Pai' };

export default function CookiePage() {
  return (
    <LegalPage title="Cookie Policy" updated="4 luglio 2026">
      <h2>1. Cosa sono i cookie</h2>
      <p>
        I cookie sono piccoli file di testo salvati dal browser. Kai Pai
        utilizza esclusivamente cookie tecnici, necessari al funzionamento
        della piattaforma.
      </p>

      <h2>2. Cookie utilizzati</h2>
      <ul>
        <li>
          <strong>Cookie di sessione (autenticazione)</strong>: mantengono
          l’accesso al tuo account in modo sicuro. Durata: la sessione di
          lavoro, con rinnovo automatico.
        </li>
      </ul>

      <h2>3. Cookie di profilazione e di terze parti</h2>
      <p>
        Kai Pai non utilizza cookie di profilazione, pubblicitari o di
        tracciamento di terze parti. Per questo motivo non è richiesto un
        banner di consenso.
      </p>

      <h2>4. Gestione dei cookie</h2>
      <p>
        Puoi cancellare o bloccare i cookie dalle impostazioni del tuo
        browser; senza i cookie tecnici, però, l’accesso all’area personale
        non può funzionare.
      </p>

      <h2>5. Contatti</h2>
      <p>Per qualsiasi domanda: info@kaipai.com.</p>
    </LegalPage>
  );
}
