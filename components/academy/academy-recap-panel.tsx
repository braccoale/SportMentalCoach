'use client';

import { useState } from 'react';
import { Download, FileText, RefreshCw, Sparkles } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/auth/middleware';
import type { AcademyRecapContent } from '@/lib/core/academy/recap/contract';

export type AcademyRecapPanelData = {
  status: 'generated' | 'edited' | 'failed';
  content: AcademyRecapContent | null;
  errorMessage: string | null;
  editedAt: Date | null;
} | null;

export type AcademyRecordingPanelStatus =
  | 'waiting_for_consent'
  | 'recording'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'consent_rejected'
  | 'cancelled';

type ActionFn = (state: ActionState, formData: FormData) => Promise<ActionState>;

const RECORDING_STATUS_COPY: Partial<Record<AcademyRecordingPanelStatus, string>> = {
  recording: 'Registrazione in corso: il recap verrà generato in automatico da qui a poco dopo la fine della sessione.',
  processing: 'Registrazione conclusa, trascrizione in corso: il recap arriva a breve, senza bisogno di incollare nulla a mano.',
};

/**
 * Il recap di una sessione Academy — usata sia nella pagina della sessione
 * (admin/docente) sia nel corso del partecipante. Chi può generare/correggere
 * arriva già deciso dal chiamante (`canManage`): il componente non rifà i
 * controlli di autorizzazione, si fida di chi gli passa le action.
 */
export function AcademyRecapPanel({
  sessionId,
  courseId,
  recap,
  canManage,
  ownConfidence,
  generateAction,
  editAction,
  confidenceAction,
  recordingStatus,
  retryTranscriptionAction,
}: {
  sessionId: number;
  courseId: number;
  recap: AcademyRecapPanelData;
  /** Vero per docente della sessione o admin — mostra generazione/correzione. */
  canManage: boolean;
  /** Solo per il partecipante: le proprie valutazioni prima/dopo, se già date. */
  ownConfidence?: { before: number | null; after: number | null };
  generateAction?: ActionFn;
  editAction?: ActionFn;
  confidenceAction?: ActionFn;
  /** Stato della pipeline automatica — assente per le sessioni senza registrazione (MVP precedente, o consenso mai chiesto). */
  recordingStatus?: AcademyRecordingPanelStatus | null;
  retryTranscriptionAction?: ActionFn;
}) {
  const [editing, setEditing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  if (!recap || !recap.content) {
    const recordingCopy = recordingStatus ? RECORDING_STATUS_COPY[recordingStatus] : undefined;
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
        <FileText className="mx-auto h-6 w-6 text-gray-300" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium text-gray-900">Nessun recap disponibile</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500">
          {recap?.status === 'failed'
            ? recap.errorMessage ?? 'La generazione precedente non è riuscita.'
            : recordingCopy ?? "Questa sessione non ha ancora una trascrizione da cui generare il recap."}
        </p>
        {canManage && recordingStatus === 'failed' && retryTranscriptionAction && (
          <ActionForm action={retryTranscriptionAction} className="mx-auto mt-3 flex max-w-md justify-center">
            <input type="hidden" name="sessionId" value={sessionId} />
            <input type="hidden" name="courseId" value={courseId} />
            <Button type="submit" variant="outline" size="sm">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Riprova la trascrizione
            </Button>
          </ActionForm>
        )}
        {canManage && generateAction && (
          <ActionForm action={generateAction} className="mx-auto mt-4 flex max-w-md flex-col gap-2 text-left">
            <input type="hidden" name="sessionId" value={sessionId} />
            <input type="hidden" name="courseId" value={courseId} />
            <label className="text-xs font-medium text-gray-500">
              Trascrizione della sessione
              <textarea
                name="transcriptText"
                required
                minLength={20}
                rows={6}
                placeholder="Incolla qui la trascrizione della sessione…"
                className="mt-1 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <Button type="submit" size="sm" className="self-start">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Genera recap
            </Button>
          </ActionForm>
        )}
      </div>
    );
  }

  const content = recap.content;

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
            Recap sessione
          </span>
          {recap.status === 'edited' && (
            <span className="text-[11px] text-gray-400">Corretto manualmente</span>
          )}
        </div>
        <a
          href={`/api/academy/recap/${sessionId}/pdf`}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Scarica PDF
        </a>
      </div>

      <RecapSection title="Concetti chiave" items={content.keyConcepts} />
      <RecapSection title="Strumenti e protocolli citati" items={content.toolsAndProtocols} />
      <RecapSection title="Casi pratici discussi" items={content.practicalCases} />
      <RecapSection title="Domande e dubbi rimasti aperti" items={content.openQuestions} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Prossima azione pratica
        </p>
        <p className="mt-1 text-sm text-gray-800">{content.nextAction}</p>
      </div>
      <RecapSection title="Argomenti e moduli trattati" items={content.topicsCovered} />

      {canManage && (
        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Annulla correzione' : 'Correggi'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setRegenerating((v) => !v)}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Rigenera
          </Button>
        </div>
      )}

      {canManage && editing && editAction && (
        <ActionForm
          action={editAction}
          onSuccess={() => setEditing(false)}
          className="flex flex-col gap-2.5 rounded-xl border border-gray-200 bg-gray-50/60 p-3"
        >
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="courseId" value={courseId} />
          <RecapEditField label="Concetti chiave (uno per riga, max 5)" name="keyConcepts" defaultValue={content.keyConcepts} />
          <RecapEditField label="Strumenti e protocolli (uno per riga)" name="toolsAndProtocols" defaultValue={content.toolsAndProtocols} />
          <RecapEditField label="Casi pratici (uno per riga)" name="practicalCases" defaultValue={content.practicalCases} />
          <RecapEditField label="Domande aperte (una per riga)" name="openQuestions" defaultValue={content.openQuestions} />
          <label className="text-xs font-medium text-gray-500">
            Prossima azione pratica
            <textarea
              name="nextAction"
              required
              defaultValue={content.nextAction}
              rows={2}
              className="mt-1 w-full resize-y rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <RecapEditField label="Argomenti trattati (uno per riga)" name="topicsCovered" defaultValue={content.topicsCovered} />
          <Button type="submit" size="sm" className="self-start">
            Salva correzione
          </Button>
        </ActionForm>
      )}

      {canManage && regenerating && generateAction && (
        <ActionForm
          action={generateAction}
          onSuccess={() => setRegenerating(false)}
          className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50/60 p-3"
        >
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="courseId" value={courseId} />
          <label className="text-xs font-medium text-gray-500">
            Nuova trascrizione (sostituisce quella attuale)
            <textarea
              name="transcriptText"
              required
              minLength={20}
              rows={6}
              className="mt-1 w-full resize-y rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <Button type="submit" size="sm" className="self-start">
            Rigenera recap
          </Button>
        </ActionForm>
      )}

      {!canManage && confidenceAction && (
        <div className="border-t border-gray-100 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            La tua sicurezza su questi contenuti
          </p>
          <div className="flex flex-wrap gap-4">
            <ConfidenceRating
              label="Prima della sessione"
              timing="before"
              value={ownConfidence?.before ?? null}
              sessionId={sessionId}
              courseId={courseId}
              action={confidenceAction}
            />
            <ConfidenceRating
              label="Dopo la sessione"
              timing="after"
              value={ownConfidence?.after ?? null}
              sessionId={sessionId}
              courseId={courseId}
              action={confidenceAction}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RecapSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-gray-400">Nessuno.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2 text-sm text-gray-800">
              <span className="text-gray-300">–</span>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecapEditField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string[];
}) {
  return (
    <label className="text-xs font-medium text-gray-500">
      {label}
      <textarea
        name={name}
        defaultValue={defaultValue.join('\n')}
        rows={3}
        className="mt-1 w-full resize-y rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function ConfidenceRating({
  label,
  timing,
  value,
  sessionId,
  courseId,
  action,
}: {
  label: string;
  timing: 'before' | 'after';
  value: number | null;
  sessionId: number;
  courseId: number;
  action: ActionFn;
}) {
  return (
    <ActionForm action={action} className="flex flex-col gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="timing" value={timing} />
      <span className="text-[11px] text-gray-500">{label}</span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="submit"
            name="rating"
            value={n}
            aria-label={`${n} su 5`}
            className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${
              value === n
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-gray-200 text-gray-500 hover:border-indigo-300'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </ActionForm>
  );
}
