import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dashboardPathForRoles } from '@/lib/core/auth/role-routes';

/**
 * Le due garanzie della console amministrativa che nessun typecheck coglie.
 *
 * 1. **Ogni pagina e ogni azione controllano il ruolo sul server.** Non è una
 *    verifica pedante: in Next.js un layout **non è un cancello**. Una pagina
 *    figlia può essere richiesta da sola — una navigazione client, un
 *    prefetch — e una server action è un endpoint invocabile da chiunque ne
 *    conosca l'identificativo. Un controllo che vive solo nel layout è un
 *    controllo che si aggira, e questo test lo impedisce per costruzione.
 *
 * 2. **Nessuna lettura amministrativa tocca il contenuto delle sedute.** La
 *    console mostra identificativi, stati, tempi e codici. Le colonne che
 *    contengono la conversazione — il testo dei segmenti, i JSON dei report,
 *    le note del coach — non devono comparire in nessuna query di
 *    `lib/core/admin/`. È il tipo di regola che si rispetta il primo giorno e
 *    si viola il quarto, «solo per capire meglio».
 *
 * Verifica sul sorgente e non sul comportamento: è l'unico modo di provarla
 * senza un database, ed è quello che serve, perché il difetto che previene è
 * una riga aggiunta per distrazione.
 */

const ADMIN_APP_DIR = join(
  process.cwd(),
  'app',
  '(dashboard)',
  'dashboard',
  'admin'
);
const ADMIN_CORE_DIR = join(process.cwd(), 'lib', 'core', 'admin');
const ADMIN_COMPONENTS_DIR = join(process.cwd(), 'components', 'admin');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const GUARD = "requireRole('admin')";
const adminFiles = walk(ADMIN_APP_DIR);

test('ogni pagina dell’amministrazione controlla il ruolo sul server', () => {
  const pages = adminFiles.filter((file) => file.endsWith('page.tsx'));
  assert.ok(pages.length >= 7, `attese almeno 7 pagine, trovate ${pages.length}`);

  for (const page of pages) {
    assert.ok(
      readFileSync(page, 'utf8').includes(GUARD),
      `${page} non chiama requireRole('admin')`
    );
  }
});

test('anche il guscio controlla il ruolo: la navigazione non si mostra a chi non deve vederla', () => {
  const layout = readFileSync(join(ADMIN_APP_DIR, 'layout.tsx'), 'utf8');
  assert.ok(layout.includes(GUARD));
});

test('ogni server action dell’amministrazione controlla il ruolo', () => {
  const actionFiles = adminFiles.filter((file) => file.endsWith('actions.ts'));
  assert.ok(actionFiles.length >= 3, 'attesi almeno tre file di azioni');

  for (const file of actionFiles) {
    const source = readFileSync(file, 'utf8');
    assert.ok(
      source.startsWith("'use server';"),
      `${file} non è dichiarato come server action`
    );

    /*
     * Un'azione può controllare il ruolo direttamente oppure delegare a un
     * aiutante locale che lo fa — `approveProviderAction` chiama `review`,
     * che chiama `requireRole`. Delegare va benissimo; non controllare no.
     * Il test riconosce la delega invece di vietarla: vietarla porterebbe
     * solo a copiare la riga in ogni funzione per far tacere il test.
     */
    const guardedHelpers = source
      .split('async function ')
      .slice(1)
      .filter((chunk) => chunk.includes(GUARD))
      .map((chunk) => chunk.slice(0, chunk.indexOf('(')).trim())
      .filter((name) => /^\w+$/.test(name));

    assert.ok(
      guardedHelpers.length > 0,
      `${file} non contiene nessuna funzione che chiami requireRole('admin')`
    );

    const exported = source.split('export async function ').slice(1);
    assert.ok(exported.length > 0, `${file} non esporta azioni`);

    for (const body of exported) {
      const name = body.slice(0, body.indexOf('(')).trim();
      const guarded =
        body.includes(GUARD) ||
        guardedHelpers.some((helper) => body.includes(`${helper}(`));
      assert.ok(
        guarded,
        `${name} in ${file} non controlla il ruolo, né direttamente né delegando`
      );
    }
  }
});

test('nessun file dell’amministrazione usa la chiave o il ruolo di servizio', () => {
  for (const file of [...adminFiles, ...walk(ADMIN_CORE_DIR)]) {
    if (file.includes('.test.')) continue;
    const source = readFileSync(file, 'utf8');
    assert.ok(
      !source.includes('SUPABASE_SERVICE_ROLE_KEY') &&
        !source.includes('service_role'),
      `${file} nomina il ruolo di servizio: l’amministrazione passa dal database applicativo, mai da una chiave che scavalca le RLS`
    );
  }
});

/** Le colonne che contengono ciò che è stato detto, scritto o riassunto. */
const CONTENT_COLUMNS = [
  'sessionTranscriptSegments.text',
  'generated_report_json',
  'coach_edited_report_json',
  'shared_report_json',
  'private_coach_notes',
  'generatedReportJson',
  'coachEditedReportJson',
  'sharedReportJson',
  'privateCoachNotes',
  'session_coach_voice_notes',
  'sessionCoachVoiceNotes',
];

test('nessuna lettura amministrativa seleziona il contenuto di una seduta', () => {
  const files = [
    ...walk(ADMIN_CORE_DIR),
    ...adminFiles,
    ...walk(ADMIN_COMPONENTS_DIR),
  ];

  for (const file of files) {
    if (file.includes('.test.')) continue;
    const source = readFileSync(file, 'utf8');
    for (const column of CONTENT_COLUMNS) {
      assert.ok(
        !source.includes(column),
        `${file} nomina «${column}»: la console amministrativa non legge contenuti di seduta`
      );
    }
  }
});

test('la tabella della pipeline mostra l’atleta come identificativo, non come persona', () => {
  const table = readFileSync(
    join(ADMIN_COMPONENTS_DIR, 'ai-console-table.tsx'),
    'utf8'
  );
  assert.ok(
    table.includes('athleteUserId'),
    'l’atleta deve comparire come identificativo'
  );
  assert.ok(
    !table.includes('athleteName') && !table.includes('clientEmail'),
    'nome ed email dell’atleta non compaiono nella console della pipeline'
  );
});

test('un utente senza ruolo admin non atterra mai nell’area amministrazione', () => {
  assert.equal(dashboardPathForRoles(['athlete']), '/dashboard/athlete');
  assert.equal(dashboardPathForRoles(['coach']), '/dashboard/coach');
  assert.equal(dashboardPathForRoles(['coach', 'admin']), '/dashboard/coach');
  assert.equal(dashboardPathForRoles([]), '/dashboard');
  // Solo chi non ha nient'altro che admin atterra lì.
  assert.equal(dashboardPathForRoles(['admin']), '/dashboard/admin');
});

test('la navigazione esiste in due forme: schede sul telefono, colonna sul desktop', () => {
  const nav = readFileSync(join(ADMIN_COMPONENTS_DIR, 'admin-nav.tsx'), 'utf8');
  assert.ok(
    nav.includes('lg:hidden') && nav.includes('hidden lg:flex'),
    'la navigazione deve avere una variante per il telefono e una per il desktop'
  );
  assert.ok(
    nav.includes("aria-label=\"Aree dell’amministrazione\""),
    'la navigazione deve essere annunciata a chi usa uno screen reader'
  );
  for (const area of [
    '/dashboard/admin/coach',
    '/dashboard/admin/utenti',
    '/dashboard/admin/sessioni',
    '/dashboard/admin/ai',
    '/dashboard/admin/audit',
    '/dashboard/admin/ai-notes',
  ]) {
    assert.ok(nav.includes(`'${area}'`), `manca l’area ${area}`);
  }
});

test('ogni tabella dell’amministrazione scorre dentro il proprio contenitore', () => {
  const withTables = [...adminFiles, ...walk(ADMIN_COMPONENTS_DIR)].filter(
    (file) => !file.includes('.test.') && readFileSync(file, 'utf8').includes('<table')
  );
  assert.ok(withTables.length >= 4, 'attese almeno quattro tabelle');

  for (const file of withTables) {
    assert.ok(
      readFileSync(file, 'utf8').includes('overflow-x-auto'),
      `${file} ha una tabella che non scorre: su un telefono spinge la pagina fuori schermo`
    );
  }
});

test('le pagine pesanti sono dinamiche: una console amministrativa non si serve dalla cache', () => {
  for (const page of adminFiles.filter((file) => file.endsWith('page.tsx'))) {
    assert.ok(
      readFileSync(page, 'utf8').includes("export const dynamic = 'force-dynamic'"),
      `${page} non dichiara dynamic = 'force-dynamic'`
    );
  }
});

/**
 * I conti demo non entrano nell'amministrazione.
 *
 * Sono account sintetici: contarli significa amministrare un prodotto che non
 * esiste — coach finti in coda di revisione, sedute che nessuno ha tenuto,
 * KPI che dicono nove dove sono cinque. La regola è quella della vista
 * `landing_stats` (migrazione 0055): una prenotazione è demo se lo è **una
 * delle due parti**.
 *
 * Il test guarda il sorgente perché il difetto che previene è una lettura
 * nuova aggiunta fra sei mesi senza il filtro: nessun typecheck la coglie, e
 * il sintomo — un numero leggermente più alto del vero — non somiglia a un
 * difetto.
 */
const DEMO_GUARDS = [
  'is_demo',        // SQL grezzo
  'isDemo',         // query builder di Drizzle
  'realBooking',    // il frammento riusabile della console
  'realSession',
  'NOT_DEMO',       // la costante condivisa di lib/core/admin/index.ts
];

test('ogni lettura dell’amministrazione esclude i conti demo', () => {
  /** I moduli che leggono persone, prenotazioni o sedute. */
  const readers = [
    'index.ts',
    'overview.ts',
    'ai-console.ts',
    'guardians.ts',
    'live-sessions.ts',
    'agenda.ts',
  ];

  for (const name of readers) {
    const source = readFileSync(join(ADMIN_CORE_DIR, name), 'utf8');
    assert.ok(
      DEMO_GUARDS.some((guard) => source.includes(guard)),
      `lib/core/admin/${name} non esclude i conti demo`
    );
  }
});

test('la console della pipeline esclude la demo anche dal conteggio, non solo dalla pagina', () => {
  const source = readFileSync(join(ADMIN_CORE_DIR, 'ai-console.ts'), 'utf8');
  // Il predicato entra nella CTE `scope`, che è la stessa da cui nascono sia
  // le righe sia il totale: filtrare dopo la paginazione darebbe pagine di
  // lunghezza variabile e un totale che non corrisponde.
  const scope = source.slice(
    source.indexOf('function scopeCte'),
    source.indexOf('function stateFilter')
  );
  assert.ok(
    scope.includes('realBooking'),
    'la finestra della console deve escludere la demo prima di contare'
  );
});
