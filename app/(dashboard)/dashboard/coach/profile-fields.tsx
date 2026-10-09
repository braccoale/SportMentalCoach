'use client';

import { GenderField } from '@/components/gender-field';
import { yearsSince } from '@/lib/core/format';
import type { AthleteGender } from '@/lib/core/profiles/gender';

/**
 * I campi del profilo del coach, divisi nelle sezioni della pagina ma tutti
 * dello stesso modulo: ognuno porta `form="profile-form"`, quindi un solo
 * salvataggio li raccoglie anche se stanno in schede diverse e accanto ad altri
 * moduli (foto, account, video), dentro i quali non si può annidare un modulo.
 * I nomi dei campi sono gli stessi di sempre: `updateProfileAction` non cambia.
 */
export const PROFILE_FORM_ID = 'profile-form';

type Option = { key: string; label: string };

/**
 * Il titolo di un campo. Se la voce corrispondente della completezza non è a
 * posto diventa arancione e lo dice a parole («da completare»): il colore da
 * solo non basterebbe a chi non lo distingue.
 */
export function fieldLabelCls(attention: boolean): string {
  return attention ? 'text-sm font-semibold text-orange-600' : 'text-sm font-medium text-gray-700';
}

function ToComplete({ show }: { show: boolean }) {
  return show ? <span className="ml-2 text-xs font-medium text-orange-600">· da completare</span> : null;
}

const inputCls = 'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm';
const chipCls =
  'flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1 text-sm has-[:checked]:border-green-500 has-[:checked]:bg-green-50 has-[:checked]:text-green-700';

export function PresentationFields({
  headline,
  description,
  attention,
}: {
  headline: string | null;
  description: string | null;
  attention: Set<string>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        <label htmlFor="headline" className={fieldLabelCls(attention.has('headline'))}>
          Frase di presentazione
          <ToComplete show={attention.has('headline')} />
        </label>
        <input
          id="headline"
          name="headline"
          form={PROFILE_FORM_ID}
          defaultValue={headline ?? ''}
          maxLength={160}
          className={inputCls}
          placeholder="Una frase che descrive il tuo approccio"
        />
        <p className="mt-1 text-xs text-gray-400">Compare sotto il tuo nome nell’elenco dei coach.</p>
      </div>
      <div className="flex flex-col">
        <label htmlFor="description" className={fieldLabelCls(attention.has('bio'))}>
          Descrizione
          <ToComplete show={attention.has('bio')} />
        </label>
        <textarea
          id="description"
          name="description"
          form={PROFILE_FORM_ID}
          defaultValue={description ?? ''}
          rows={5}
          maxLength={4000}
          className={inputCls}
          placeholder="Racconta la tua esperienza e il tuo metodo…"
        />
      </div>
    </div>
  );
}

function ChipGroup({
  id,
  legend,
  name,
  options,
  selected,
  attention,
}: {
  id: string;
  legend: string;
  name: string;
  options: Option[];
  selected: string[];
  attention: boolean;
}) {
  return (
    <fieldset id={id}>
      <legend className={fieldLabelCls(attention)}>
        {legend}
        <ToComplete show={attention} />
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.key} className={chipCls}>
            <input
              type="checkbox"
              name={name}
              form={PROFILE_FORM_ID}
              value={o.key}
              defaultChecked={selected.includes(o.key)}
              className="accent-green-600"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SkillsFields({
  categories,
  specialties,
  athleteLevels,
  languages,
  certifications,
  coachSince,
  sportOptions,
  specialtyOptions,
  levelOptions,
  attention,
}: {
  categories: string[];
  specialties: string[];
  athleteLevels: string[];
  languages: string[];
  certifications: string[];
  coachSince: string | null;
  sportOptions: Option[];
  specialtyOptions: Option[];
  levelOptions: Option[];
  attention: Set<string>;
}) {
  const experienceYears = coachSince ? yearsSince(coachSince) : null;
  return (
    <div className="flex flex-col gap-5">
      {/* Prima ciò per cui gli atleti filtrano l'elenco. */}
      <ChipGroup id="campo-sport" legend="Sport" name="categories" options={sportOptions} selected={categories} attention={attention.has('sports')} />
      <ChipGroup
        id="campo-specializzazioni"
        legend="Specializzazioni"
        name="specialties"
        options={specialtyOptions}
        selected={specialties}
        attention={attention.has('specialties')}
      />
      {levelOptions.length > 0 && (
        <ChipGroup
          id="campo-livelli"
          legend="Lavora con (livelli)"
          name="athleteLevels"
          options={levelOptions}
          selected={athleteLevels}
          attention={attention.has('levels')}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col">
          <label htmlFor="languages" className={fieldLabelCls(attention.has('languages'))}>
            Lingue
            <ToComplete show={attention.has('languages')} />
          </label>
          <input
            id="languages"
            name="languages"
            form={PROFILE_FORM_ID}
            defaultValue={languages.join(', ')}
            className={inputCls}
            placeholder="Italiano, Inglese"
          />
          <p className="mt-1 text-xs text-gray-400">Separa le lingue con una virgola.</p>
        </div>
        <div className="flex flex-col">
          <label htmlFor="coachSince" className={fieldLabelCls(attention.has('experience'))}>
            Coach dal
            <ToComplete show={attention.has('experience')} />
          </label>
          <input
            id="coachSince"
            name="coachSince"
            form={PROFILE_FORM_ID}
            type="date"
            defaultValue={coachSince ?? ''}
            max={new Date().toISOString().slice(0, 10)}
            className={inputCls}
          />
          <p className="mt-1 text-xs text-gray-400">
            {experienceYears != null
              ? `Esperienza calcolata: ${experienceYears} ${experienceYears === 1 ? 'anno' : 'anni'}.`
              : 'Gli anni di esperienza vengono calcolati automaticamente.'}
          </p>
        </div>
      </div>

      <div className="flex flex-col">
        <label htmlFor="certifications" className={fieldLabelCls(attention.has('certifications'))}>
          Titoli e certificazioni
          <ToComplete show={attention.has('certifications')} />
        </label>
        <textarea
          id="certifications"
          name="certifications"
          form={PROFILE_FORM_ID}
          defaultValue={certifications.join('\n')}
          rows={3}
          className={inputCls}
          placeholder={'Albo Psicologi\nMental Coach certificato'}
        />
        <p className="mt-1 text-xs text-gray-400">Una per riga. Scrivi solo ciò che puoi dimostrare.</p>
      </div>
    </div>
  );
}

/** Il genere facoltativo: è un dato personale, sta nella sezione Account, ma si salva con il profilo. */
export function AccountProfileFields({ gender }: { gender: AthleteGender | null }) {
  return <GenderField defaultValue={gender} form={PROFILE_FORM_ID} />;
}
