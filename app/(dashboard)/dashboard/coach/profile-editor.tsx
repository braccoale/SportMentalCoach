'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateProfileAction } from './profile-actions';
import { yearsSince } from '@/lib/core/format';
import type { ActionState } from '@/lib/auth/middleware';

type Option = { key: string; label: string };

export function ProfileEditor({
  headline,
  description,
  categories,
  specialties,
  sportOptions,
  specialtyOptions,
  coachSince,
  languages,
  certifications,
  athleteLevels,
  levelOptions,
}: {
  headline: string | null;
  description: string | null;
  categories: string[];
  specialties: string[];
  sportOptions: Option[];
  specialtyOptions: Option[];
  coachSince: string | null;
  languages: string[];
  certifications: string[];
  athleteLevels: string[];
  levelOptions: Option[];
}) {
  const experienceYears = coachSince ? yearsSince(coachSince) : null;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateProfileAction,
    { error: '' }
  );

  return (
    <form
      action={formAction}
      className="rounded-lg border border-gray-200 p-4"
    >
      <h2 className="text-lg font-medium text-gray-900">Profilo coach</h2>

      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col">
          <label htmlFor="headline" className="text-sm font-medium text-gray-700">
            Titolo / headline
          </label>
          <input
            id="headline"
            name="headline"
            defaultValue={headline ?? ''}
            maxLength={160}
            className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            placeholder="Una frase che descrive il tuo approccio"
          />
        </div>

        <div className="flex flex-col">
          <label htmlFor="description" className="text-sm font-medium text-gray-700">
            Bio / descrizione
          </label>
          <textarea
            id="description"
            name="description"
            defaultValue={description ?? ''}
            rows={4}
            maxLength={4000}
            className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            placeholder="Racconta la tua esperienza e il tuo metodo…"
          />
        </div>

        <div className="flex flex-col sm:max-w-xs">
          <label
            htmlFor="coachSince"
            className="text-sm font-medium text-gray-700"
          >
            Coach dal
          </label>
          <input
            id="coachSince"
            name="coachSince"
            type="date"
            defaultValue={coachSince ?? ''}
            max={new Date().toISOString().slice(0, 10)}
            className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">
            {experienceYears != null
              ? `Esperienza calcolata: ${experienceYears} ${
                  experienceYears === 1 ? 'anno' : 'anni'
                }.`
              : 'Gli anni di esperienza vengono calcolati automaticamente.'}
          </p>
        </div>

        <div className="flex flex-col">
          <label htmlFor="languages" className="text-sm font-medium text-gray-700">
            Lingue
          </label>
          <input
            id="languages"
            name="languages"
            defaultValue={languages.join(', ')}
            className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            placeholder="Italiano, Inglese"
          />
          <p className="mt-1 text-xs text-gray-400">Separa le lingue con una virgola.</p>
        </div>

        <div className="flex flex-col">
          <label
            htmlFor="certifications"
            className="text-sm font-medium text-gray-700"
          >
            Certificazioni
          </label>
          <textarea
            id="certifications"
            name="certifications"
            defaultValue={certifications.join('\n')}
            rows={3}
            className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            placeholder={'Albo Psicologi\nMental Coach certificato'}
          />
          <p className="mt-1 text-xs text-gray-400">Una certificazione per riga.</p>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-gray-700">Sport</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {sportOptions.map((o) => (
              <label
                key={o.key}
                className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1 text-sm has-[:checked]:border-red-500 has-[:checked]:bg-red-50 has-[:checked]:text-red-700"
              >
                <input
                  type="checkbox"
                  name="categories"
                  value={o.key}
                  defaultChecked={categories.includes(o.key)}
                  className="accent-red-600"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-gray-700">
            Specializzazioni
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {specialtyOptions.map((o) => (
              <label
                key={o.key}
                className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1 text-sm has-[:checked]:border-red-500 has-[:checked]:bg-red-50 has-[:checked]:text-red-700"
              >
                <input
                  type="checkbox"
                  name="specialties"
                  value={o.key}
                  defaultChecked={specialties.includes(o.key)}
                  className="accent-red-600"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>

        {levelOptions.length > 0 && (
          <fieldset>
            <legend className="text-sm font-medium text-gray-700">
              Lavora con (livelli)
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {levelOptions.map((o) => (
                <label
                  key={o.key}
                  className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1 text-sm has-[:checked]:border-red-500 has-[:checked]:bg-red-50 has-[:checked]:text-red-700"
                >
                  <input
                    type="checkbox"
                    name="athleteLevels"
                    value={o.key}
                    defaultChecked={athleteLevels.includes(o.key)}
                    className="accent-red-600"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
        {state?.success && (
          <p className="text-sm text-green-600">{state.success}</p>
        )}

        <div>
          <Button type="submit" disabled={pending} className="rounded-md">
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Salva profilo'
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
