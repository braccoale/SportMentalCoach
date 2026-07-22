import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/core/auth';
import {
  COACH_AGREEMENT,
  vexatiousSections,
} from '@/lib/core/legal/coach-agreement';
import { hasAcceptedCoachAgreement } from '@/lib/core/legal/acceptance';
import { AgreementForm } from './agreement-form';

export default async function CoachAgreementOnboardingPage() {
  const user = await requireRole('coach');

  // Già firmato: non lo si fa firmare di nuovo per errore di navigazione.
  if (await hasAcceptedCoachAgreement(user.id)) {
    redirect('/dashboard/coach');
  }

  const hasFullName = !!(user.name?.trim() && user.lastName?.trim());

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900">
        Contratto di Adesione Coach
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        Versione {COACH_AGREEMENT.version} — in vigore dal{' '}
        {COACH_AGREEMENT.effectiveDate}. Per pubblicare il profilo e accettare
        prenotazioni serve la tua firma.
      </p>

      <div className="mt-8">
        <AgreementForm
          vexatiousTitles={vexatiousSections().map((s) => s.title)}
          needsName={!hasFullName}
        >
          {COACH_AGREEMENT.sections.map((section) => (
            <section key={section.id}>
              <h2>{section.title}</h2>
              {section.body.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </section>
          ))}
        </AgreementForm>
      </div>
    </main>
  );
}
