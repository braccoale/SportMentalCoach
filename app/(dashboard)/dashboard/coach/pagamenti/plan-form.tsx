'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionState } from '@/lib/auth/middleware';
import { createSessionPlanAction } from './actions';

type FieldErrors = Partial<
  Record<'name' | 'description' | 'sessionsPerMonth' | 'monthlyPrice', string>
>;

export function PlanForm({
  minSessions,
  maxSessions,
}: {
  minSessions: number;
  maxSessions: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createSessionPlanAction,
    {}
  );
  const fieldErrors = (state.fieldErrors ?? {}) as FieldErrors;

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-3" noValidate>
      <div className="flex flex-col gap-1.5 sm:col-span-3">
        <Label htmlFor="plan-name">Nome del piano</Label>
        <Input
          id="plan-name"
          name="name"
          maxLength={80}
          placeholder="Per esempio: Percorso mensile"
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? 'plan-name-error' : undefined}
        />
        {fieldErrors.name && (
          <p id="plan-name-error" className="text-sm text-red-700">
            {fieldErrors.name}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-3">
        <Label htmlFor="plan-description">
          Frase breve <span className="font-normal text-gray-500">(facoltativa)</span>
        </Label>
        <Input
          id="plan-description"
          name="description"
          maxLength={120}
          placeholder="Per esempio: Ideale per iniziare"
          aria-invalid={fieldErrors.description ? true : undefined}
          aria-describedby={fieldErrors.description ? 'plan-description-error' : undefined}
        />
        {fieldErrors.description && (
          <p id="plan-description-error" className="text-sm text-red-700">
            {fieldErrors.description}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-sessions">Sedute al mese</Label>
        <Input
          id="plan-sessions"
          name="sessionsPerMonth"
          inputMode="numeric"
          placeholder={`${minSessions}–${maxSessions}`}
          aria-invalid={fieldErrors.sessionsPerMonth ? true : undefined}
          aria-describedby={
            fieldErrors.sessionsPerMonth ? 'plan-sessions-error' : undefined
          }
        />
        {fieldErrors.sessionsPerMonth && (
          <p id="plan-sessions-error" className="text-sm text-red-700">
            {fieldErrors.sessionsPerMonth}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-price">Prezzo mensile (€)</Label>
        <Input
          id="plan-price"
          name="monthlyPrice"
          inputMode="decimal"
          placeholder="Per esempio 240 o 239,90"
          aria-invalid={fieldErrors.monthlyPrice ? true : undefined}
          aria-describedby={
            fieldErrors.monthlyPrice ? 'plan-price-error' : undefined
          }
        />
        {fieldErrors.monthlyPrice && (
          <p id="plan-price-error" className="text-sm text-red-700">
            {fieldErrors.monthlyPrice}
          </p>
        )}
      </div>

      <div className="flex items-end gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            name="recommended"
            className="h-4 w-4 rounded border-gray-300"
          />
          Consigliato
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvataggio…' : 'Crea piano'}
        </Button>
      </div>

      <div className="sm:col-span-3" role="status" aria-live="polite">
        {state.error && !state.fieldErrors && (
          <p className="text-sm text-red-700">{state.error}</p>
        )}
        {state.success && (
          <p className="text-sm text-emerald-700">{state.success}</p>
        )}
      </div>
    </form>
  );
}
