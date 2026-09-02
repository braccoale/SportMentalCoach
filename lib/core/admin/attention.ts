/**
 * Che cosa richiede un intervento, adesso.
 *
 * È il pannello che giustifica l'esistenza di una console amministrativa: i
 * numeri della panoramica dicono com'è andata, questo dice **che cosa fare**.
 * La differenza non è di tono — un cruscotto che mostra dodici KPI e nessuna
 * azione lascia a chi guarda il lavoro di dedurre il problema, ed è
 * esattamente il lavoro che nessuno fa alle otto di sera.
 *
 * Tre regole, tutte imparate a spese di qualcun altro:
 *
 * 1. **Una voce a zero non compare.** Un elenco di dieci righe di cui otto
 *    dicono «nessuno» insegna a non leggerlo.
 * 2. **Ogni voce porta a una vista già filtrata.** «3 trascrizioni fallite»
 *    senza il collegamento a quali tre è un'ansia, non un'informazione.
 * 3. **La gravità è del tipo di problema, non del numero.** Un minore senza
 *    autorizzazione è critico anche se è uno solo; venti mail in coda non lo
 *    sono nemmeno se sono venti.
 *
 * Modulo puro: si prova con conteggi finti e senza database.
 */

export type AttentionSeverity = 'critico' | 'attenzione' | 'informativo';

export type AttentionItem = {
  key: string;
  severity: AttentionSeverity;
  count: number;
  title: string;
  /** Perché è un problema e cosa succede se resta lì. */
  detail: string;
  /** Una vista già filtrata sul problema, mai un elenco generico. */
  href: string;
  /** L'etichetta del collegamento: un verbo, non «dettagli». */
  actionLabel: string;
};

/**
 * I conteggi da cui nasce l'elenco.
 *
 * Ogni campo è `number | null`: `null` significa «non misurabile qui», ed è
 * diverso da zero. Una misura che non esiste non deve diventare una
 * rassicurazione.
 */
export type AttentionInput = {
  /** Profili coach inviati e mai revisionati. */
  coachDaApprovare: number;
  /** Sedute finite in `transcription_failed` nel periodo. */
  trascrizioniFallite: number;
  /** Sedute finite in `report_failed` nel periodo: recuperabili. */
  reportFalliti: number;
  /** Job pronti che nessuno ha mai preso in carico: il worker non gira. */
  jobMaiPresi: number;
  /** Da quanti minuti aspetta il più vecchio, quando ce n'è uno. */
  attesaMassimaMinuti: number | null;
  /** Sedute ferme in `processing` oltre la scadenza. */
  sessioniFerme: number;
  /** Registrazioni audio fallite nel periodo: la seduta non ha più materiale. */
  registrazioniFallite: number;
  /** Minori con prenotazioni attive e nessuna autorizzazione confermata. */
  minoriSenzaAutorizzazione: number | null;
  /** Email transazionali fallite nel periodo. */
  emailFallite: number;
  /**
   * Costo stimato oltre la soglia configurata. `null` quando non esiste
   * nessuna soglia: senza soglia non c'è sforamento, solo una spesa.
   */
  costoOltreSoglia: { stimato: number; soglia: number } | null;
};

const SEVERITY_ORDER: Record<AttentionSeverity, number> = {
  critico: 0,
  attenzione: 1,
  informativo: 2,
};

export function buildAttentionItems(
  input: AttentionInput
): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (input.minoriSenzaAutorizzazione && input.minoriSenzaAutorizzazione > 0) {
    items.push({
      key: 'minori-senza-autorizzazione',
      severity: 'critico',
      count: input.minoriSenzaAutorizzazione,
      title:
        input.minoriSenzaAutorizzazione === 1
          ? 'Un minore con prenotazioni e nessuna autorizzazione confermata'
          : `${input.minoriSenzaAutorizzazione} minori con prenotazioni e nessuna autorizzazione confermata`,
      detail:
        'Finché il tutore non conferma, la seduta non ha una base valida. Non è un difetto dell’interfaccia: è una persona minorenne in agenda senza consenso.',
      href: '/dashboard/admin/utenti?filtro=minori-senza-autorizzazione',
      actionLabel: 'Apri gli atleti coinvolti',
    });
  }

  if (input.jobMaiPresi > 0) {
    items.push({
      key: 'worker-fermo',
      severity: 'critico',
      count: input.jobMaiPresi,
      title:
        input.jobMaiPresi === 1
          ? 'Un lavoro in coda che nessuno ha preso in carico'
          : `${input.jobMaiPresi} lavori in coda che nessuno ha preso in carico`,
      detail:
        input.attesaMassimaMinuti === null
          ? 'Zero tentativi non è lentezza: è il worker che non sta girando.'
          : `Il più vecchio aspetta da ${input.attesaMassimaMinuti} minuti con zero tentativi: non è lentezza, è il worker che non sta girando.`,
      href: '/dashboard/admin/ai?stato=in_coda',
      actionLabel: 'Apri la coda',
    });
  }

  if (input.sessioniFerme > 0) {
    items.push({
      key: 'sessioni-ferme',
      severity: 'critico',
      count: input.sessioniFerme,
      title:
        input.sessioniFerme === 1
          ? 'Una seduta ferma in elaborazione oltre la scadenza'
          : `${input.sessioniFerme} sedute ferme in elaborazione oltre la scadenza`,
      detail:
        'Il coach vede una rotellina che gira e non ha modo di sapere che c’è un problema.',
      href: '/dashboard/admin/ai?stato=bloccato',
      actionLabel: 'Apri le sedute bloccate',
    });
  }

  if (input.reportFalliti > 0) {
    items.push({
      key: 'report-falliti',
      severity: 'attenzione',
      count: input.reportFalliti,
      title:
        input.reportFalliti === 1
          ? 'Un riepilogo non generato'
          : `${input.reportFalliti} riepiloghi non generati`,
      detail:
        'La trascrizione di solito è ancora in tabella: sono le uniche sedute che si possono riprendere.',
      href: '/dashboard/admin/ai?stato=report_fallito',
      actionLabel: 'Apri e riprendi',
    });
  }

  if (input.trascrizioniFallite > 0) {
    items.push({
      key: 'trascrizioni-fallite',
      severity: 'attenzione',
      count: input.trascrizioniFallite,
      title:
        input.trascrizioniFallite === 1
          ? 'Una trascrizione fallita'
          : `${input.trascrizioniFallite} trascrizioni fallite`,
      detail:
        'Qui il materiale manca: non si riaprono, ma vale la pena leggere perché sono fallite.',
      href: '/dashboard/admin/ai?stato=trascrizione_fallita',
      actionLabel: 'Apri le sedute',
    });
  }

  if (input.registrazioniFallite > 0) {
    items.push({
      key: 'registrazioni-fallite',
      severity: 'attenzione',
      count: input.registrazioniFallite,
      title:
        input.registrazioniFallite === 1
          ? 'Una registrazione audio persa'
          : `${input.registrazioniFallite} registrazioni audio perse`,
      detail:
        'Senza audio non c’è trascrizione. Il messaggio del fornitore è nel dettaglio della seduta.',
      href: '/dashboard/admin/ai?errore=registrazione',
      actionLabel: 'Apri le sedute',
    });
  }

  if (input.coachDaApprovare > 0) {
    items.push({
      key: 'coach-da-approvare',
      severity: 'attenzione',
      count: input.coachDaApprovare,
      title:
        input.coachDaApprovare === 1
          ? 'Un profilo coach in attesa di revisione'
          : `${input.coachDaApprovare} profili coach in attesa di revisione`,
      detail:
        'Finché non sono approvati non compaiono in vetrina e non possono ricevere richieste.',
      href: '/dashboard/admin/coach?stato=pending',
      actionLabel: 'Apri la coda di revisione',
    });
  }

  if (input.emailFallite > 0) {
    items.push({
      key: 'email-fallite',
      severity: 'attenzione',
      count: input.emailFallite,
      title:
        input.emailFallite === 1
          ? 'Una email non consegnata'
          : `${input.emailFallite} email non consegnate`,
      detail:
        'Una mail che non arriva non lascia traccia nella schermata che l’ha richiesta: si vede solo da qui.',
      href: '/dashboard/admin/audit?vista=email',
      actionLabel: 'Apri le consegne',
    });
  }

  if (input.costoOltreSoglia) {
    items.push({
      key: 'costo-oltre-soglia',
      severity: 'informativo',
      count: 1,
      title: 'Spesa AI stimata oltre la soglia configurata',
      detail: `Stima del periodo: ${input.costoOltreSoglia.stimato.toFixed(2)} € contro una soglia di ${input.costoOltreSoglia.soglia.toFixed(2)} €. È una stima, non una fattura.`,
      href: '/dashboard/admin/ai',
      actionLabel: 'Apri i consumi',
    });
  }

  return items.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return bySeverity !== 0 ? bySeverity : b.count - a.count;
  });
}
