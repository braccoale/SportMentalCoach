import { ATHLETE_GENDERS, ATHLETE_GENDER_LABEL, type AthleteGender } from '@/lib/core/profiles/gender';

/**
 * «Genere», facoltativo: tre scelte (uomo, donna, preferisco non specificare)
 * che si inviano con il modulo come il campo `gender`. Serve a scegliere
 * l'immagine in alto nella dashboard dell'atleta e a nient'altro, e il testo
 * lo dice: chi sa a cosa serve un dato lo dà più volentieri.
 *
 * Senza stato: radio nativi, quindi funziona uguale dentro un modulo di
 * registrazione con campi controllati e dentro una pagina del profilo.
 */
export function GenderField({
  defaultValue = null,
  id = 'gender',
  className = '',
}: {
  defaultValue?: AthleteGender | null;
  id?: string;
  className?: string;
}) {
  return (
    <fieldset className={className}>
      <legend className="text-sm font-medium text-gray-700">
        Genere <span className="font-normal text-gray-500">(facoltativo)</span>
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {ATHLETE_GENDERS.map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 rounded-full border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-800 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50 has-[:checked]:text-emerald-800"
          >
            <input
              type="radio"
              id={value === ATHLETE_GENDERS[0] ? id : undefined}
              name="gender"
              value={value}
              defaultChecked={defaultValue === value}
              className="h-4 w-4 accent-emerald-600"
            />
            {ATHLETE_GENDER_LABEL[value]}
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-gray-500">
        Lo usiamo solo per scegliere l’immagine della tua dashboard.
      </p>
    </fieldset>
  );
}
