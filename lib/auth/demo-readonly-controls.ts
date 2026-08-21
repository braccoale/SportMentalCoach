const WRITE_LABEL =
  /\b(modifica|salva|aggiungi|crea|nuov[oa]|annulla|cancella|elimina|rimuovi|accetta|rifiuta|valida|rigenera|invia|rispondi|reagisci|inserisci|segna|attiva|disattiva|carica|registra|avvia|termina|riprendi|prenota|sposta|conferma|aggiorna|pubblica|imposta)\b/i;

const VIDEO_ACTION = /\b(apri videochiamata|rientra nella call|entra nella call)\b/i;

export function looksLikeDemoWriteLabel(label: string): boolean {
  const normalized = label.replace(/\s+/g, ' ').trim();
  return WRITE_LABEL.test(normalized) || VIDEO_ACTION.test(normalized);
}
