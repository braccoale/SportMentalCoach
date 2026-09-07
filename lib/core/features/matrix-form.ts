export type MatrixFeatureType = 'boolean' | 'numeric';

export type MatrixFeatureInput = {
  code: string;
  label: string;
  type: MatrixFeatureType;
};

export type MatrixPackageInput = {
  id: number;
  name: string;
};

export type FeatureMatrixEntryInput = {
  packageId: number;
  featureCode: string;
  value: number | null;
};

/**
 * Il nome del campo del form per una cella. Condiviso fra chi disegna la
 * matrice e chi la legge al salvataggio, così non può disallinearsi.
 */
export function matrixCellFieldName(packageId: number, featureCode: string): string {
  return `cell_${packageId}_${featureCode}`;
}

/**
 * Legge una sottomissione della matrice, una cella alla volta.
 *
 * Sì/no: la casella spuntata diventa una riga (`value: null`); non
 * spuntata, nessuna riga — stessa semantica di sempre per
 * `package_features`. Numerica: vuoto vuol dire illimitato (`value:
 * null`, non l'assenza della funzionalità — una feature numerica non si
 * esclude da questa matrice, si lascia senza limite); un numero intero
 * non negativo diventa il limite; qualunque altra cosa è un errore che
 * nomina la feature e il pacchetto, non il campo tecnico.
 */
export function parseFeatureMatrixSubmission(params: {
  packages: readonly MatrixPackageInput[];
  features: readonly MatrixFeatureInput[];
  getField: (fieldName: string) => string | null;
}): { entries: FeatureMatrixEntryInput[] } | { error: string } {
  const entries: FeatureMatrixEntryInput[] = [];

  for (const pkg of params.packages) {
    for (const feature of params.features) {
      const raw = params.getField(matrixCellFieldName(pkg.id, feature.code));

      if (feature.type === 'boolean') {
        if (raw === 'on') {
          entries.push({ packageId: pkg.id, featureCode: feature.code, value: null });
        }
        continue;
      }

      const trimmed = (raw ?? '').trim();
      if (trimmed === '') {
        entries.push({ packageId: pkg.id, featureCode: feature.code, value: null });
        continue;
      }

      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return { error: `Valore non valido per ${feature.label} — ${pkg.name}.` };
      }
      entries.push({ packageId: pkg.id, featureCode: feature.code, value: parsed });
    }
  }

  return { entries };
}
