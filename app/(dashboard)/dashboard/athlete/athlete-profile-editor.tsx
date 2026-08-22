'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionForm } from '@/components/action-form';
import type { AthleteProfileFields } from '@/lib/core/profiles';
import { normalizeSportKey } from '@/lib/core/profiles/sport-key';
import { sports } from '@/lib/verticals/sport-mental-coach/taxonomies';
import { updateAthleteProfileAction } from './actions';

const LEVELS = [
  'Principiante',
  'Intermedio',
  'Avanzato',
  'Agonista',
  'Professionista',
];

function ageFrom(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
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
