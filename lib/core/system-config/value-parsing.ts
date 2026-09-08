import type { SystemConfigValueType } from '@/lib/db/schema';

export type ParsedSystemConfigValue =
  | { ok: true; value: number | string | boolean }
  | { ok: false; error: string };

export function parseSystemConfigValue(
  valueType: SystemConfigValueType,
  rawValue: string
): ParsedSystemConfigValue {
  if (valueType === 'number') {
    const trimmed = rawValue.trim();
    const parsed = Number(trimmed);
    // `Number('')` è 0, non NaN: senza il controllo esplicito su stringa
    // vuota, un campo lasciato in bianco verrebbe salvato come zero invece
    // di essere respinto.
    if (trimmed === '' || !Number.isFinite(parsed)) {
      return { ok: false, error: 'Il valore deve essere un numero.' };
    }
    return { ok: true, value: parsed };
  }

  if (valueType === 'boolean') {
    // Una checkbox non spuntata non compare affatto nel form: il chiamante
    // passa '' in quel caso, che deve leggersi come false, non come errore.
    return { ok: true, value: rawValue === 'true' || rawValue === 'on' };
  }

  return { ok: true, value: rawValue };
}
