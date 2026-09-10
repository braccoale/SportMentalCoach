/**
 * Le tre coordinate che l'app deve conoscere per esistere.
 *
 * Non ci sono segreti qui: la chiave anonima di Supabase è pubblica per
 * costruzione (le regole stanno sul database), e l'indirizzo dell'API è
 * l'indirizzo del sito. Tutto ciò che è segreto resta sul server, che è il
 * motivo per cui l'app non parla mai direttamente con LiveKit senza passare
 * da noi per farsi dare un token.
 *
 * ## L'ambiente di test
 *
 * `EXPO_PUBLIC_ENV=test` è un secondo modo di avviare l'app, pensato per un
 * collaudo con un backend isolato — non per lo sviluppo quotidiano, che resta
 * `.env.development.local` con la produzione o il computer dello sviluppatore.
 *
 * **Nella modalità di test non c'è ripiego silenzioso sulla produzione.** Se
 * qualcuno dimentica di passare `EXPO_PUBLIC_API_BASE_URL`, o lo lascia
 * uguale a quello di produzione, l'app non parte: lo dice a schermo intero,
 * invece di aprirsi tranquilla e parlare con dati veri senza che nessuno se ne
 * accorga. È il comportamento opposto di quello ordinario, dove l'assenza
 * della variabile fa cadere *di proposito* sulla produzione — qui cadere sulla
 * produzione è esattamente l'unico esito da impedire.
 */
const PRODUCTION_API_BASE_URL = 'https://www.kaipaicoaching.com';

export const ENV: 'production' | 'test' =
  process.env.EXPO_PUBLIC_ENV === 'test' ? 'test' : 'production';

export const IS_TEST_ENV = ENV === 'test';

/**
 * Lanciata da `App.tsx` prima che qualunque schermata provi a fare una
 * richiesta. Un errore qui, a schermo intero, costa meno di un test che
 * sembra passato perché in realtà ha parlato con la produzione.
 */
export class TestEnvironmentMisconfigured extends Error {}

function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!IS_TEST_ENV) return configured ?? PRODUCTION_API_BASE_URL;

  if (!configured) {
    throw new TestEnvironmentMisconfigured(
      'EXPO_PUBLIC_ENV=test ma manca EXPO_PUBLIC_API_BASE_URL: nessun ripiego sulla produzione in modalità di test.'
    );
  }
  if (configured === PRODUCTION_API_BASE_URL) {
    throw new TestEnvironmentMisconfigured(
      'EXPO_PUBLIC_ENV=test ma EXPO_PUBLIC_API_BASE_URL punta alla produzione: correggilo, non è un caso ammesso.'
    );
  }
  return configured;
}

export const API_BASE_URL = resolveApiBaseUrl();

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Nella modalità di test, la chiave anonima di produzione è un errore quanto
 * l'indirizzo dell'API: autenticarsi con Supabase Auth di produzione mentre
 * si crede di parlare con un backend isolato è il modo peggiore di scoprire
 * la differenza.
 */
const PRODUCTION_SUPABASE_URL_FRAGMENT = 'supabase.co';

export function assertConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new TestEnvironmentMisconfigured(
      'Mancano EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY: copiale in mobile/.env da .env.local del progetto web.'
    );
  }
  if (IS_TEST_ENV && SUPABASE_URL.includes(PRODUCTION_SUPABASE_URL_FRAGMENT)) {
    throw new TestEnvironmentMisconfigured(
      'EXPO_PUBLIC_ENV=test ma EXPO_PUBLIC_SUPABASE_URL è un progetto Supabase gestito (*.supabase.co): in test serve l’indirizzo di Supabase locale (127.0.0.1).'
    );
  }
}
