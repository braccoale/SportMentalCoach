import 'server-only';
import { asc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { features, packageFeatures, type FeatureType } from '@/lib/db/schema';
import { assertAdmin } from './index';
import { listPackages, type PackageSummary } from './packages';

// `code` è `string`, non il `FeatureCode` di policy.ts: stessa scelta di
// `FeatureMatrixEntry` più sotto, per la stessa ragione — il vincolo di
// riferimento a database (Task 1) è la garanzia reale, non il tipo. Un
// `as FeatureCode` qui prenderebbe in prestito l'autorità del tipo
// diramato senza la sua garanzia: una feature aggiunta da migrazione ma
// non ancora presente in `FEATURE_CODES` sarebbe comunque tipizzata come
// "nota".
export type FeatureRow = {
  code: string;
  label: string;
  description: string | null;
  type: FeatureType;
};

/** Il catalogo delle feature che il codice controlla davvero, in ordine di visualizzazione. */
export async function listFeatures(actorUserId: number): Promise<FeatureRow[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      code: features.code,
      label: features.label,
      description: features.description,
      type: features.type,
    })
    .from(features)
    .orderBy(asc(features.sortOrder), asc(features.id));
  return rows.map((row) => ({
    ...row,
    type: row.type as FeatureType,
  }));
}

export type FeatureMatrixPackage = PackageSummary & {
  /** Chiave: codice feature. Assente = non inclusa. `null` = illimitata (solo numeriche). */
  cells: Record<string, number | null>;
};

export type FeatureMatrix = {
  features: FeatureRow[];
  packages: FeatureMatrixPackage[];
};

/**
 * Tutto quello che serve a disegnare la matrice: righe, colonne, celle.
 * I pacchetti vengono da `listPackages` (stessa lettura del selettore di
 * assegnazione, non una query duplicata).
 */
export async function getFeatureMatrix(actorUserId: number): Promise<FeatureMatrix> {
  await assertAdmin(actorUserId);

  const [featureRows, packageRows, cellRows] = await Promise.all([
    listFeatures(actorUserId),
    listPackages(actorUserId),
    db
      .select({
        packageId: packageFeatures.packageId,
        featureCode: packageFeatures.featureCode,
        value: packageFeatures.value,
      })
      .from(packageFeatures),
  ]);

  const cellsByPackage = new Map<number, Record<string, number | null>>();
  for (const cell of cellRows) {
    const entry = cellsByPackage.get(cell.packageId) ?? {};
    entry[cell.featureCode] = cell.value;
    cellsByPackage.set(cell.packageId, entry);
  }

  return {
    features: featureRows,
    packages: packageRows.map((pkg) => ({
      ...pkg,
      cells: cellsByPackage.get(pkg.id) ?? {},
    })),
  };
}

// `featureCode` è `string`, non `FeatureCode`: arriva da
// `parseFeatureMatrixSubmission` (lib/core/features/matrix-form.ts), un
// modulo puro deliberatamente scollegato dai tipi di `policy.ts`. È il
// vincolo di riferimento aggiunto in Task 1 — non questo tipo — a garantire
// che una riga non possa mai puntare a una feature inesistente.
export type FeatureMatrixEntry = {
  packageId: number;
  featureCode: string;
  value: number | null;
};

/**
 * Sostituisce l'intera matrice pacchetto×feature in una transazione sola:
 * una cella assente da `entries` non è inclusa in quel pacchetto. Un solo
 * pulsante "Salva" per l'intera griglia si traduce in una sola chiamata
 * qui, mai una per pacchetto.
 */
export async function setFeatureMatrix(params: {
  actorUserId: number;
  entries: FeatureMatrixEntry[];
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await db.transaction(async (tx) => {
    await tx.delete(packageFeatures);
    if (params.entries.length > 0) {
      await tx.insert(packageFeatures).values(
        params.entries.map((entry) => ({
          packageId: entry.packageId,
          featureCode: entry.featureCode,
          value: entry.value,
          createdBy: params.actorUserId,
        }))
      );
    }
  });
}
