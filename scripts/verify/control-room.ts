/**
 * Verifica di sola lettura della Control Room contro il database reale.
 *
 * Nessuna scrittura, nessuna migrazione, nessuna azione: solo le letture che
 * la console esegue, per sapere se compilano e che cosa rispondono.
 *
 * Esiste perché due difetti di questo lavoro non erano visibili né dal
 * typecheck né dai test:
 *
 * - un `Date` passato a `db.execute` con `sql` grezzo non è serializzabile da
 *   postgres.js senza un cast dichiarato, e solleva alla prima esecuzione;
 * - sedici letture in parallelo hanno piantato il pooler in modalità
 *   transazione, con ogni singola query sotto i 50 ms.
 *
 * «Il codice sembra giusto» qui è già stato sbagliato due volte in un
 * pomeriggio.
 *
 *   node --conditions=react-server --import tsx scripts/verify/control-room.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
dotenv.config();

import { adminPeriodRange } from '@/lib/core/admin/period';
import { parseAiConsoleFilters } from '@/lib/core/admin/ai-console-policy';

async function main() {
  const { db } = await import('@/lib/db/drizzle');
  const { sql } = await import('drizzle-orm');
  const { getAdminOverview } = await import('@/lib/core/admin/overview');
  const {
    getAiConsolePage,
    getAiConsoleKpis,
    getAiConsoleCoaches,
    getAiConsoleErrorCodes,
    getAiSessionDetail,
  } = await import('@/lib/core/admin/ai-console');
  const { getAthletesNeedingGuardian } = await import('@/lib/core/admin/guardians');
  const { getAdminAuditEvents } = await import('@/lib/core/admin/audit-log');

  const period = adminPeriodRange('30g');
  console.log('PERIODO', period.from.toISOString(), '→', period.to.toISOString());

  const overview = await getAdminOverview(period);
  console.log('KPI', overview.kpis.map((k) => `${k.label}=${k.value}`).join(' · '));
  for (const servizio of overview.services) {
    console.log(`SERVIZIO ${servizio.label}: ${servizio.status} — ${servizio.message}`);
    for (const causa of servizio.causes) {
      console.log(`    ${causa.count} ${servizio.unit} · ${causa.code} (${causa.label})`);
    }
    if (servizio.action) console.log(`    → ${servizio.action}`);
  }
  console.log('ATTENZIONE', overview.attention.map((a) => a.key).join(', ') || '(nessuna)');
  console.log('IMBUTO', overview.funnel.map((f) => `${f.label}=${f.value}`).join(' · '));
  console.log('SERIE', overview.seriesGranularity, overview.sessionsSeries.length, 'punti:', JSON.stringify(overview.sessionsSeries.slice(-4)));
  console.log('AGENDA oggi=' + overview.upcoming.oggi, 'domani=' + overview.upcoming.domani,
    'sette giorni=' + overview.upcoming.totale,
    JSON.stringify(overview.upcoming.days.map((d) => `${d.day}:${d.totale}`)));
  console.log('ESITI', JSON.stringify(overview.outcomes));
  console.log('COACH ATTIVI', JSON.stringify(overview.coachActivity));

  /*
   * La stessa panoramica a dodici mesi: e' la vista che risponde a «quante ad
   * agosto, quante a settembre», e va provata perche' cambia la SQL — il
   * raggruppamento passa da giorno a mese.
   */
  const anno = adminPeriodRange('12m');
  const annuale = await getAdminOverview(anno);
  console.log(
    'DODICI MESI', anno.from.toISOString().slice(0, 10), '→', anno.granularity,
    JSON.stringify(
      annuale.sessionsSeries.map((b) => `${b.bucket}: ${b.completate} fatte, ${b.annullate} annullate`)
    )
  );

  const kpis = await getAiConsoleKpis(period);
  console.log('PIPELINE KPI', JSON.stringify({ ...kpis, cost: kpis.cost.totalEur }));

  const page = await getAiConsolePage(parseAiConsoleFilters({}), period);
  console.log('CONSOLE', page.total, 'righe totali; prima pagina:', page.rows.length);
  for (const row of page.rows.slice(0, 5)) {
    console.log(
      '  #' + row.sessionId,
      row.classification.state,
      row.classification.phase,
      row.errorCode ?? '-',
      `audio=${row.audioSeconds}s`,
      `segm=${row.transcriptSegments}`
    );
  }

  for (const stato of ['bloccato', 'fallito', 'in_coda', 'in_corso', 'completato'] as const) {
    const filtered = await getAiConsolePage(parseAiConsoleFilters({ stato }), period);
    console.log(`  filtro stato=${stato}: ${filtered.total}`);
  }
  for (const fase of ['riepilogo', 'trascrizione', 'nessun_lavoro', 'chiusa'] as const) {
    const filtered = await getAiConsolePage(parseAiConsoleFilters({ fase }), period);
    console.log(`  filtro fase=${fase}: ${filtered.total}`);
  }

  console.log('COACH FILTRO', (await getAiConsoleCoaches(period)).length);
  console.log('ERRORI', JSON.stringify(await getAiConsoleErrorCodes(period)));
  console.log('MINORI SENZA TUTORE', (await getAthletesNeedingGuardian()).length);

  if (page.rows[0]) {
    const detail = await getAiSessionDetail(page.rows[0].sessionId);
    console.log(
      'DETTAGLIO',
      detail?.row.sessionId,
      'job=' + detail?.jobs.length,
      'reg=' + detail?.recordings.length,
      'audit=' + detail?.audit.length,
      'retry=' + JSON.stringify(detail?.retry)
    );
  }

  const failed = (await db.execute(sql`
    select id from session_ai_notes
    where status in ('report_failed', 'transcription_failed')
    order by id desc limit 5
  `)) as unknown as { id: number }[];
  for (const row of failed) {
    const detail = await getAiSessionDetail(Number(row.id));
    console.log(
      `RIPRESA #${row.id} ${detail?.row.status} segm=${detail?.row.transcriptSegments} ` +
        `consentita=${detail?.retry.allowed} :: ${detail?.retry.reason}`
    );
  }

  try {
    const audit = await getAdminAuditEvents({});
    console.log('AUDIT AMMINISTRATIVO', audit.total, 'voci');
  } catch (error) {
    console.log(
      'AUDIT AMMINISTRATIVO: tabella assente (migrazione 0060 non applicata) —',
      error instanceof Error ? error.message.split('\n')[0] : error
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('FALLITO:', error);
    process.exit(1);
  });
