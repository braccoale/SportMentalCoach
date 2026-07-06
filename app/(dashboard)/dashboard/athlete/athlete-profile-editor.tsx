'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionForm } from '@/components/action-form';
import type { AthleteProfileFields } from '@/lib/core/profiles';
import { updateAthleteProfileAction } from './actions';

const LEVELS = [
  'Principiante',
  'Intermedio',
  'Avanzato',
  'Agonista',
  'Professionista',
];

/** Editor for the athlete's sport profile (category / level / goals). */
export function AthleteProfileEditor({ profile }: { profile: AthleteProfileFields }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profilo sportivo</CardTitle>
      </CardHeader>
      <CardContent>
        <ActionForm action={updateAthleteProfileAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="category">Sport / disciplina</Label>
            <Input
              id="category"
              name="category"
              defaultValue={profile.category ?? ''}
              maxLength={60}
              placeholder="Es. Tennis, Calcio, Atletica…"
            />
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
