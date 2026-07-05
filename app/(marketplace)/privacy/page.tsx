import { LegalPage } from '../legal-layout';

export const metadata = { title: 'Privacy Policy — Kai Pai' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="4 luglio 2026">
      <h2>1. Titolare del trattamento</h2>
      <p>
        Il titolare del trattamento dei dati è Kai Pai (contatto:
        info@kaipai.com). La presente informativa è resa ai sensi del
        Regolamento (UE) 2016/679 («GDPR»).
      </p>

      <h2>2. Dati trattati</h2>
      <ul>
        <li>
          <strong>Dati di account</strong>: nome, cognome, email, password (in
          forma cifrata).
        </li>
        <li>
          <strong>Dati di profilo</strong>: per i Coach, le informazioni
          professionali pubblicate volontariamente (bio, certificazioni, foto,
          video di presentazione).
        </li>
        <li>
          <strong>Dati d’uso</strong>: prenotazioni, messaggi di chat,
          recensioni, notifiche.
        </li>
      </ul>

      <h2>3. Finalità e base giuridica</h2>
      <p>
        I dati sono trattati per erogare il servizio (esecuzione del
        contratto), inviare comunicazioni di servizio (es. conferme di
        sessione), garantire la sicurezza della piattaforma (legittimo
        interesse) e adempiere a obblighi di legge.
      </p>

      <h2>4. Conservazione e sicurezza</h2>
      <p>
        I dati sono conservati su infrastruttura europea (Supabase — AWS,
        regione UE) per il tempo necessario alle finalità indicate. Le
        videochiamate non vengono registrate. I contenuti delle sessioni e
        delle chat sono riservati ai partecipanti.
      </p>

      <h2>5. Comunicazione a terzi</h2>
      <p>
        I dati possono essere trattati da fornitori tecnici che agiscono come
        responsabili del trattamento (hosting, invio email, infrastruttura
        video). Non vendiamo i dati personali a terzi.
      </p>

      <h2>6. Minori</h2>
      <p>
        Il servizio per atleti minori di 18 anni richiede il consenso di un
        genitore o tutore, che rimane referente per il trattamento dei dati
        del minore.
      </p>

      <h2>7. Diritti dell’interessato</h2>
      <p>
        Puoi esercitare in ogni momento i diritti previsti dagli artt. 15–22
        GDPR (accesso, rettifica, cancellazione, portabilità, opposizione)
        scrivendo a info@kaipai.com. Puoi eliminare autonomamente il tuo
        account dalla sezione Sicurezza. Hai inoltre diritto di reclamo al
        Garante per la protezione dei dati personali.
      </p>
    </LegalPage>
  );
}
