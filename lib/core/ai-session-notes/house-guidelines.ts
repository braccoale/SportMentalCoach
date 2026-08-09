import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import { aiPromptGuidelines } from '@/lib/db/schema';
import { isValidGuidelinesBody } from './house-guidelines-policy';
import { AiNotesDomainError } from './state-machine';

/**
 * Lettura e scrittura delle linee guida KaiPai.
 *
 * Ogni salvataggio crea una versione nuova invece di sovrascrivere: il
 * riepilogo di una seduta è stato scritto con una certa versione del metodo,
 * e fra sei mesi deve restare possibile sapere quale. Senza storico, un
 * report approvato diventa irripetibile — e la rigenerazione, che confronta
 * le versioni, non avrebbe nulla da confrontare.
 */

export type HouseGuidelines = {
  version: number;
  body: string;
  updatedAt: string;
};

export async function loadActiveHouseGuidelines(
  executor: DbOrTx = db
): Promise<HouseGuidelines | null> {
  const [row] = await executor
    .select({
      version: aiPromptGuidelines.version,
      body: aiPromptGuidelines.body,
      createdDate: aiPromptGuidelines.createdDate,
    })
    .from(aiPromptGuidelines)
    .orderBy(desc(aiPromptGuidelines.version))
    .limit(1);
  if (!row) return null;
  return {
    version: row.version,
    body: row.body,
    updatedAt: row.createdDate.toISOString(),
  };
}

/**
 * Salva una versione nuova.
 *
 * Un testo identico al precedente non produce una versione: alzerebbe la
 * versione del prompt e farebbe rigenerare ogni bozza in circolazione per
 * nulla.
 */
export async function saveHouseGuidelines(
  params: { body: string; actorUserId: number },
  executor: DbOrTx = db
): Promise<HouseGuidelines> {
  const body = params.body.trim();
  if (!isValidGuidelinesBody(body)) {
    throw new AiNotesDomainError(
      'INVALID_TRANSITION',
      'Le linee guida non possono essere vuote e devono stare entro quattromila caratteri.'
    );
  }

  const current = await loadActiveHouseGuidelines(executor);
  if (current && current.body.trim() === body) return current;

  const [created] = await executor
    .insert(aiPromptGuidelines)
    .values({
      version: (current?.version ?? 0) + 1,
      body,
      createdBy: params.actorUserId,
    })
    .returning({
      version: aiPromptGuidelines.version,
      body: aiPromptGuidelines.body,
      createdDate: aiPromptGuidelines.createdDate,
    });
  if (!created) {
    throw new AiNotesDomainError(
      'INVALID_TRANSITION',
      'Linee guida non salvate.'
    );
  }
  return {
    version: created.version,
    body: created.body,
    updatedAt: created.createdDate.toISOString(),
  };
}

/** Lo storico, per sapere con quale metodo e' stato scritto un report. */
export async function listHouseGuidelinesVersions(
  limit = 10,
  executor: DbOrTx = db
): Promise<Array<{ version: number; updatedAt: string }>> {
  const rows = await executor
    .select({
      version: aiPromptGuidelines.version,
      createdDate: aiPromptGuidelines.createdDate,
    })
    .from(aiPromptGuidelines)
    .orderBy(desc(aiPromptGuidelines.version))
    .limit(limit);
  return rows.map((row) => ({
    version: row.version,
    updatedAt: row.createdDate.toISOString(),
  }));
}

/** Il testo di una versione precisa: serve a rileggere un report vecchio. */
export async function loadHouseGuidelinesVersion(
  version: number,
  executor: DbOrTx = db
): Promise<HouseGuidelines | null> {
  const [row] = await executor
    .select({
      version: aiPromptGuidelines.version,
      body: aiPromptGuidelines.body,
      createdDate: aiPromptGuidelines.createdDate,
    })
    .from(aiPromptGuidelines)
    .where(eq(aiPromptGuidelines.version, version))
    .limit(1);
  if (!row) return null;
  return {
    version: row.version,
    body: row.body,
    updatedAt: row.createdDate.toISOString(),
  };
}
