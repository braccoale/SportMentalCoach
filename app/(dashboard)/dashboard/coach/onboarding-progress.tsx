import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CoachOnboarding } from '@/lib/core/onboarding';
import { submitForReviewAction } from './profile-actions';

export function OnboardingProgress({
  onboarding,
}: {
  onboarding: CoachOnboarding;
}) {
  const { steps, completedCount, totalSteps, nextStep, canSubmit } = onboarding;
  const pct = Math.round((completedCount / totalSteps) * 100);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">
          Completa il tuo profilo
        </h2>
        <span className="text-sm font-medium text-gray-500">
          {completedCount}/{totalSteps}
        </span>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-orange-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {nextStep && (
        <p className="mt-3 text-sm text-gray-600">
          <span className="font-medium text-gray-900">Prossimo passo:</span>{' '}
          {nextStep.label} — {nextStep.description}
          {nextStep.anchor && (
            <a
              href={`#${nextStep.anchor}`}
              className="ml-1 font-medium text-orange-600 hover:text-orange-700"
            >
              Vai →
            </a>
          )}
        </p>
      )}

      <ol className="mt-4 flex flex-col gap-2">
        {steps.map((step, i) => (
          <li key={step.key} className="flex items-start gap-2">
            {step.done ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            ) : (
              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-gray-300" />
            )}
            <div>
              <p
                className={
                  step.done
                    ? 'text-sm font-medium text-gray-900'
                    : 'text-sm font-medium text-gray-700'
                }
              >
                {i + 1}. {step.label}
              </p>
              <p className="text-xs text-gray-500">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>

      {(canSubmit || !onboarding.isSubmitted) && (
        <div className="mt-4">
          <form action={submitForReviewAction}>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="rounded-full"
            >
              Invia per la revisione
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
          {!canSubmit && (
            <p className="mt-2 text-xs text-gray-400">
              Completa i passi 1–3 per poter inviare il profilo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
