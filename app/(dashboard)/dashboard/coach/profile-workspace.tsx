'use client';

import Link from 'next/link';
import { useActionState, useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CoachProfileCompleteness } from '@/components/coach-profile-completeness';
import type { ProfileCompleteness } from '@/lib/core/coach-profile/completeness';
import {
  PROFILE_SECTIONS,
  sectionsNeedingAttention,
  targetForItem,
  type ProfileSectionId,
} from '@/lib/core/coach-profile/sections';
import type { AthleteGender } from '@/lib/core/profiles/gender';
import type { ActionState } from '@/lib/auth/middleware';
import { updateProfileAction } from './profile-actions';
import { AccountProfileFields, PROFILE_FORM_ID, PresentationFields, SkillsFields } from './profile-fields';

type Option = { key: string; label: string };

/**
 * La pagina del profilo del coach, in tre sezioni: Presentazione (foto, frase,
 * descrizione, video), Competenze (sport, specializzazioni, livelli, lingue,
 * titoli) e Account (dati personali e genere). Su desktop sono schede, su
 * telefono una fisarmonica. Tutte le sezioni restano montate e si nascondono
 * soltanto: cambiando scheda non si perde ciò che si sta scrivendo.
 *
 * Un solo salvataggio per i campi del profilo: i campi sono sparsi fra le
 * sezioni (e accanto ai moduli di foto, account e video) ma portano tutti
 * `form="profile-form"`; una barra in basso compare quando c'è qualcosa di
 * modificato. Foto, dati dell'account e video hanno il loro salvataggio, che
 * cambia un solo dato e lo scrive subito.
 */
export function CoachProfileWorkspace({
  completeness,
  readOnly = false,
  values,
  sportOptions,
  specialtyOptions,
  levelOptions,
  photo,
  video,
  account,
}: {
  completeness: ProfileCompleteness;
  /** Profilo demo: i campi si leggono ma non si modificano; schede e navigazione restano attive. */
  readOnly?: boolean;
  values: {
    headline: string | null;
    description: string | null;
    categories: string[];
    specialties: string[];
    athleteLevels: string[];
    languages: string[];
    certifications: string[];
    coachSince: string | null;
    gender: AthleteGender | null;
  };
  sportOptions: Option[];
  specialtyOptions: Option[];
  levelOptions: Option[];
  photo: ReactNode;
  video: ReactNode;
  account: ReactNode;
}) {
  const [active, setActive] = useState<ProfileSectionId>('presentazione');
  const [mobileOpen, setMobileOpen] = useState<Set<ProfileSectionId>>(new Set(['presentazione']));
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateProfileAction, { error: '' });
  const attention = sectionsNeedingAttention(completeness.items);

  // Salvato: la barra sparisce e un messaggio lo conferma.
  useEffect(() => {
    if (state?.success) {
      toast.success(state.success);
      setDirty(false);
    }
  }, [state]);

  // Non si perde ciò che si è scritto chiudendo la scheda per sbaglio.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const toggleMobile = useCallback((id: ProfileSectionId) => {
    setMobileOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Dal «cosa manca»: apre la sezione giusta e porta al campo. */
  const goTo = useCallback((itemKey: string) => {
    const target = targetForItem(itemKey);
    if (!target || !('section' in target)) return;
    setActive(target.section);
    setMobileOpen((prev) => new Set(prev).add(target.section));
    window.setTimeout(() => {
      const el = document.getElementById(target.anchor);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus?.({ preventScroll: true });
    }, 80);
  }, []);

  function resetChanges() {
    (document.getElementById(PROFILE_FORM_ID) as HTMLFormElement | null)?.reset();
    setDirty(false);
  }

  /**
   * Il pulsante di salvataggio, uguale in ogni scheda: salva tutti i campi del
   * profilo (sono un solo modulo), anche quelli di un'altra scheda. Se c'è
   * qualcosa di modificato lo dice e permette di annullare.
   */
  const saveRow = (label = 'Salva modifiche') => (
    <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
      <Button type="submit" form={PROFILE_FORM_ID} disabled={pending} className="rounded-full">
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Salvo…
          </>
        ) : (
          label
        )}
      </Button>
      {dirty && !pending && (
        <>
          <span className="text-sm text-amber-700">Hai modifiche non salvate.</span>
          <Button type="button" variant="ghost" onClick={resetChanges} className="rounded-full">
            Annulla
          </Button>
        </>
      )}
    </div>
  );

  const panelClass = (id: ProfileSectionId) =>
    `${mobileOpen.has(id) ? 'block' : 'hidden'} ${active === id ? 'lg:block' : 'lg:hidden'}`;

  return (
    <div
      className="flex flex-col gap-4"
      onChange={(e) => {
        // Solo i campi del profilo: foto, account e video hanno un salvataggio loro.
        if ((e.target as HTMLElement).getAttribute?.('form') === PROFILE_FORM_ID) setDirty(true);
      }}
    >
      {/* Il modulo del profilo: vuoto di proposito, i campi lo raggiungono con l'attributo `form`. */}
      <form id={PROFILE_FORM_ID} action={formAction} />

      <CoachProfileCompleteness completeness={completeness} onNavigate={goTo} />

      {/* Schede (desktop) */}
      <div role="tablist" aria-label="Sezioni del profilo" className="hidden gap-1 border-b border-gray-200 lg:flex">
        {PROFILE_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={`tab-${s.id}`}
            aria-selected={active === s.id}
            aria-controls={`pannello-${s.id}`}
            onClick={() => setActive(s.id)}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              active === s.id
                ? 'border-emerald-600 text-gray-950'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {s.label}
            {attention.has(s.id) && (
              <span className="h-2 w-2 rounded-full bg-amber-500" title="C’è ancora qualcosa da completare" />
            )}
          </button>
        ))}
      </div>

      {PROFILE_SECTIONS.map((s) => (
        <div key={s.id} className="flex flex-col">
          {/* Fisarmonica (telefono) */}
          <button
            type="button"
            onClick={() => toggleMobile(s.id)}
            aria-expanded={mobileOpen.has(s.id)}
            aria-controls={`pannello-${s.id}`}
            className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-base font-semibold text-gray-900 lg:hidden"
          >
            <span className="inline-flex items-center gap-2">
              {s.label}
              {attention.has(s.id) && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Da completare" />}
            </span>
            <ChevronDown
              className={`h-5 w-5 text-gray-400 transition-transform ${mobileOpen.has(s.id) ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>

          <div
            id={`pannello-${s.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${s.id}`}
            className={`${panelClass(s.id)} mt-3 lg:mt-0`}
          >
            <fieldset
              disabled={readOnly}
              data-demo-profile-readonly={readOnly ? 'true' : undefined}
              className="contents"
            >
            {s.id === 'presentazione' && (
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <div className="flex flex-col gap-5 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
                  <div id="foto-profilo" tabIndex={-1} className="outline-none">
                    {photo}
                  </div>
                  <PresentationFields headline={values.headline} description={values.description} />
                  {saveRow()}
                </div>
                {video}
              </div>
            )}

            {s.id === 'competenze' && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
                <SkillsFields
                  categories={values.categories}
                  specialties={values.specialties}
                  athleteLevels={values.athleteLevels}
                  languages={values.languages}
                  certifications={values.certifications}
                  coachSince={values.coachSince}
                  sportOptions={sportOptions}
                  specialtyOptions={specialtyOptions}
                  levelOptions={levelOptions}
                />
                <div className="mt-5">{saveRow()}</div>
              </div>
            )}

            {s.id === 'account' && (
              <div className="grid items-start gap-4 lg:grid-cols-2">
                {account}
                <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4">
                  <AccountProfileFields gender={values.gender} />
                  {saveRow('Salva genere')}
                  <p className="text-sm text-gray-600">
                    Per cambiare la password o gestire l’accesso vai in{' '}
                    <Link href="/dashboard/coach/security" className="font-medium text-emerald-700 underline-offset-2 hover:underline">
                      Sicurezza
                    </Link>
                    .
                  </p>
                </div>
              </div>
            )}
            </fieldset>
          </div>
        </div>
      ))}

      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
