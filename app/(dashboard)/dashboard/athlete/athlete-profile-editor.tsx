'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionForm } from '@/components/action-form';
import type { AthleteProfileFields } from '@/lib/core/profiles';
import { normalizeSportKey } from '@/lib/core/profiles/sport-key';
import { AGE_OF_MAJORITY, ageFromBirthDate } from '@/lib/core/guardians/age';
import { sports } from '@/lib/verticals/sport-mental-coach/taxonomies';
import { updateAthleteProfileAction } from './actions';

const LEVELS = [
  'Principiante',
  'Intermedio',
  'Avanzato',
  'Agonista',
  'Professionista',
];

/** Display only: the gate itself is recomputed server-side on every check. */
function ageFrom(birthDate: string | null): number | null {
  const a = ageFromBirthDate(birthDate);
  return a != null && a >= 0 && a < 120 ? a : null;
}

/** Editor for the athlete's profile (personal + sport fields). */
export function AthleteProfileEditor({ profile }: { profile: AthleteProfileFields }) {
  const age = ageFrom(profile.birthDate);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profilo sportivo</CardTitle>
      </CardHeader>
      <CardContent>
        <ActionForm action={updateAthleteProfileAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="category">Sport / disciplina</Label>
            {/* Una scelta e non un testo libero. Il campo diceva
                «Es. Tennis, Calcio, Atletica…», cioè invitava a scrivere
                l'etichetta — ma questa colonna è una chiave di tassonomia, la
                stessa che la procedura guidata scrive e che l'icona dello
                sport legge. Chi seguiva il suggerimento si ritrovava una
                medaglia al posto del pallone. Il «Livello» qui sotto era già
                una scelta: questo campo era l'unico rimasto aperto. */}
            <select
              id="category"
              name="category"
              defaultValue={normalizeSportKey(profile.category) ?? ''}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Seleziona…</option>
              {sports.map((sport) => (
                <option key={sport.key} value={sport.key}>
                  {sport.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="level">Livello</Label>
            <select
              id="level"
              name="level"
              defaultValue={profile.level ?? ''}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
            >
              <option value="">Non specificato</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="city">Città</Label>
              <Input
                id="city"
                name="city"
                defaultValue={profile.city ?? ''}
                maxLength={120}
                placeholder="Es. Milano"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="birthDate">
                Data di nascita
                {age !== null && (
                  <span className="ml-1 font-normal text-gray-400">
                    ({age} anni)
                  </span>
                )}
              </Label>
              <Input
                id="birthDate"
                name="birthDate"
                type="date"
                defaultValue={profile.birthDate ?? ''}
                max={today}
              />
              {age !== null && age < AGE_OF_MAJORITY && (
                <p className="text-xs text-gray-500">
                  Da questa data dipende l’autorizzazione del tuo genitore o
                  tutore: se è sbagliata e ti fa risultare minorenne, scrivi
                  all’assistenza invece di correggerla qui.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goals">Obiettivi</Label>
            <textarea
              id="goals"
              name="goals"
              defaultValue={profile.goals ?? ''}
              rows={4}
              maxLength={2000}
              placeholder="Su cosa vuoi lavorare con il tuo mental coach?"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs"
            />
          </div>

          <Button type="submit">Salva profilo sportivo</Button>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
