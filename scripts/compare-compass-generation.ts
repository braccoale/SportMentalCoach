/**
 * Genera il riepilogo di una seduta già approvata con una ricetta diversa e ne
 * stampa le misure, per confrontare qualità, tempo e costo prima di cambiare
 * sforzo di ragionamento o modello in produzione.
 *
 *   npm run ai-notes:compare-compass -- --session=122 --effort=medium
 *   npm run ai-notes:compare-compass -- --session=122 --effort=low --model=<nome>
 *   npm run ai-notes:compare-compass -- --session=122 --effort=high --keep=<file.json>
 *
 * SOLA LETTURA. Il database si legge, non si scrive: nessun report salvato,
 * nessun evento di audit, nessuna notifica, nessuna mail. Le tre scritture del
 * negozio dei riepiloghi sono sostituite qui sotto, e il report esistente non
 * viene nemmeno caricato, così la generazione parte sempre da zero invece di
 * rispondere «già allineata».
 *
 * Costa una chiamata vera al modello per ogni esecuzione.
 *
 * Quello che stampa sono solo numeri. Il documento completo si salva solo con
 * `--keep=<file>`: contiene il testo di una seduta vera, quindi va tenuto fuori
 * dal repository e cancellato appena letto.
 *
 * Lo sforzo di ragionamento il provider lo legge una volta sola al caricamento
 * del modulo: per confrontare più sforzi servono più esecuzioni, una per
 * sforzo, non un ciclo dentro lo stesso processo.
 *
 * `ENV_FILE` indica il file delle variabili (default `.env.local`): serve
 * quando lo script gira da una cartella di lavoro diversa da quella del progetto.
 */
import dotenv from 'dotenv';
import { writeFileSync } from 'node:fs';

dotenv.config({ path: process.env.ENV_FILE ?? '.env.local', override: true });
dotenv.config();

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

const sessionId = Number(argument('session'));
const effort = argument('effort') ?? 'low';
const model = argument('model');
const keepPath = argument('keep');

if (!Number.isInteger(sessionId) || sessionId < 1) {
  throw new Error('Serve --session=<id numerico della seduta>.');
}
if (!['minimal', 'low', 'medium', 'high'].includes(effort)) {
  throw new Error('--effort deve essere minimal, low, medium o high.');
}

// Impostati prima di importare il provider: lo sforzo viene letto una volta.
process.env.AI_NOTES_COMPASS_REASONING_EFFORT = effort;
if (model) process.env.AI_NOTES_COMPASS_MODEL = model;
process.env.AI_NOTES_COMPASS_TIMEOUT_MS ??= '240000';

type Usage = { tokenIngresso: number; tokenUscita: number; troncato: string | null };

/**
 * Il provider scrive già i token consumati nel log della pipeline. Si leggono
 * da lì, invece di duplicare la chiamata o toccare il provider.
 */
function captureUsage(): { read: () => Usage; stop: () => void } {
  const original = console.log;
  const usage: Usage = { tokenIngresso: 0, tokenUscita: 0, troncato: null };
  console.log = (...args: unknown[]) => {
    try {
      const line = JSON.parse(String(args[0])) as {
        phase?: string;
        counts?: Record<string, number>;
        detail?: Record<string, unknown>;
      };
      if (line.phase === 'report_generation') {
        usage.tokenIngresso = line.counts?.tokenIngresso ?? 0;
        usage.tokenUscita = line.counts?.tokenUscita ?? 0;
        usage.troncato = (line.detail?.troncato as string | null) ?? null;
      }
    } catch {
      original(...args);
    }
  };
  return { read: () => usage, stop: () => (console.log = original) };
}

async function main() {
  const [
    { sessionCompassDependencies },
    { ensureSessionCompassDraft },
    { SESSION_COMPASS_REPORT_KIND },
    { compassMetrics },
  ] = await Promise.all([
    import('@/lib/core/ai-session-notes/session-compass-runtime'),
    import('@/lib/core/ai-session-notes/session-compass'),
    import('@/lib/core/ai-session-notes/session-compass-contract'),
    import('@/lib/core/ai-session-notes/compass-comparison'),
  ]);
  type Store = ReturnType<typeof sessionCompassDependencies>['store'];
  type Stored = Awaited<ReturnType<Store['insertReport']>>;
  type Document = NonNullable<Stored['generatedReport']>;

  const dependencies = sessionCompassDependencies();
  const real = dependencies.store;

  const session = await real.loadSession(sessionId);
  if (!session) throw new Error(`La seduta ${sessionId} non esiste.`);

  let captured: Document | null = null;
  const stored = (input: {
    sessionId: number;
    sourceFingerprint: string;
    promptVersion: string;
    generatedReport: Document | null;
  }): Stored => {
    captured = input.generatedReport;
    return {
      id: -1,
      sessionId: input.sessionId,
      reportKind: SESSION_COMPASS_REPORT_KIND,
      reportVersion: 1,
      status: 'ready_for_review',
      sourceFingerprint: input.sourceFingerprint,
      promptVersion: input.promptVersion,
      generatedReport: input.generatedReport,
      coachEditedReport: null,
      coachNote: null,
      approvedBy: null,
      approvedAt: null,
      sharedAt: null,
      errorCode: null,
      updatedDate: new Date(),
    };
  };

  // Letture vere, scritture finte.
  dependencies.store = {
    loadSession: (id) => real.loadSession(id),
    loadTimeline: (id) => real.loadTimeline(id),
    loadPreviousApprovedReports: (params) => real.loadPreviousApprovedReports(params),
    loadLatestReport: async () => null,
    insertReport: async (input) => stored(input),
    updateReport: async (input) =>
      stored({
        sessionId: sessionId,
        sourceFingerprint: input.sourceFingerprint ?? '',
        promptVersion: input.promptVersion ?? '',
        generatedReport: input.generatedReport ?? null,
      }),
    recordAudit: async () => undefined,
  };
  dependencies.markSessionApproved = undefined;
  dependencies.notifyReportReady = undefined;

  const usage = captureUsage();
  const started = Date.now();
  let failure: string | null = null;
  try {
    await ensureSessionCompassDraft(
      { sessionId, actorUserId: session.coachUserId },
      dependencies
    );
  } catch (error) {
    failure = (error as { code?: string }).code ?? 'ERRORE';
  } finally {
    usage.stop();
  }
  const seconds = Math.round((Date.now() - started) / 100) / 10;

  const document = captured as Document | null;
  const result = {
    sessione: sessionId,
    sforzo: effort,
    modello: document?.generation.model ?? model ?? '(da AI_NOTES_COMPASS_MODEL)',
    secondi: seconds,
    esito: failure ?? 'ok',
    token: usage.read(),
    misure: document ? compassMetrics(document) : null,
  };
  console.log(JSON.stringify(result, null, 2));

  if (keepPath && document) {
    writeFileSync(keepPath, JSON.stringify({ ...result, documento: document }, null, 2));
    console.log(`Documento completo salvato in ${keepPath}: contiene testo di una seduta vera.`);
  }
  process.exit(failure ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
