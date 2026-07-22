import type { Metadata } from 'next';
import { LegalPage } from '../../legal-layout';
import {
  COACH_AGREEMENT,
  vexatiousSections,
} from '@/lib/core/legal/coach-agreement';

export const metadata: Metadata = {
  title: 'Contratto di Adesione Coach',
  description:
    'Il contratto che regola il rapporto tra KaiPai e i coach: commissione, obblighi di servizio, non elusione della piattaforma e atleti minorenni.',
};

export default function CoachAgreementPage() {
  return (
    <LegalPage
      title="Contratto di Adesione Coach"
      updated={`${COACH_AGREEMENT.effectiveDate} — versione ${COACH_AGREEMENT.version}`}
    >
      <p>
        Il presente contratto si applica ai coach che offrono i propri servizi
        sulla piattaforma KaiPai e si aggiunge ai Termini e Condizioni, alla
        Privacy Policy e alla Cookie Policy.
      </p>

      {COACH_AGREEMENT.sections.map((section) => (
        <section key={section.id} id={section.id}>
          <h2>{section.title}</h2>
          {section.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </section>
      ))}

      <h2>Approvazione specifica delle clausole (art. 1341 c.c.)</h2>
      <p>
        Ai sensi e per gli effetti degli articoli 1341 e 1342 del codice civile,
        il Coach approva specificamente le seguenti clausole:
      </p>
      <ul>
        {vexatiousSections().map((section) => (
          <li key={section.id}>{section.title}</li>
        ))}
      </ul>
    </LegalPage>
  );
}
