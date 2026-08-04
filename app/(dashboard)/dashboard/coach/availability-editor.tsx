'use client';

import {
  type FormEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarPlus,
  Clock3,
  Loader2,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/action-form';
import { WEEKDAY_LABELS, formatMinutesOfDay } from '@/lib/core/format';
import type { AvailabilitySlot } from '@/lib/core/availability';
import {
  addAvailabilityAction,
  deleteAvailabilityAction,
  updateAvailabilityAction,
} from './availability-actions';

const fieldCls =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:border-green-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600/20';
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

function sortSlots(slots: AvailabilitySlot[]) {
  return [...slots].sort(
    (a, b) =>
      WEEKDAY_ORDER.indexOf(a.weekday as (typeof WEEKDAY_ORDER)[number]) -
        WEEKDAY_ORDER.indexOf(b.weekday as (typeof WEEKDAY_ORDER)[number]) ||
      a.startMinute - b.startMinute
  );
}

export function AvailabilityEditor({ slots }: { slots: AvailabilitySlot[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [editingSlot, setEditingSlot] = useState<AvailabilitySlot | null>(null);
  const [weekday, setWeekday] = useState('');
  const [start, setStart] = useState('00:00');
  const [end, setEnd] = useState('00:00');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [slotToDelete, setSlotToDelete] = useState<AvailabilitySlot | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const orderedSlots = useMemo(() => sortSlots(slots), [slots]);

  function openAddDialog() {
    setEditingSlot(null);
    setWeekday('');
    setStart('00:00');
    setEnd('00:00');
    setModalError(null);
    setPageMessage(null);
    setPageError(null);
    dialogRef.current?.showModal();
  }

  function openEditDialog(slot: AvailabilitySlot) {
    setEditingSlot(slot);
    setWeekday(String(slot.weekday));
    setStart(formatMinutesOfDay(slot.startMinute));
    setEnd(formatMinutesOfDay(slot.endMinute));
    setModalError(null);
    setPageMessage(null);
    setPageError(null);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    if (saving) return;
    dialogRef.current?.close();
    setModalError(null);
  }

  async function submitSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setModalError(null);
    setPageError(null);

    const formData = new FormData(event.currentTarget);
    if (editingSlot) formData.set('slotId', String(editingSlot.id));

    try {
      const result = editingSlot
        ? await updateAvailabilityAction({}, formData)
        : await addAvailabilityAction({}, formData);
      if (result.error) {
        setModalError(result.error);
        return;
      }

      dialogRef.current?.close();
      setPageMessage(
        editingSlot ? 'Fascia aggiornata.' : 'Fascia aggiunta.'
      );
      router.refresh();
    } catch {
      setModalError('Non è stato possibile salvare la fascia. Riprova.');
    } finally {
      setSaving(false);
    }
  }

  async function removeSlot(slot: AvailabilitySlot) {
    setDeletingId(slot.id);
    setPageError(null);
    setPageMessage(null);
    const formData = new FormData();
    formData.set('slotId', String(slot.id));
    try {
      const result = await deleteAvailabilityAction({}, formData);
      if (result.error) {
        setPageError(result.error);
        return;
      }
      setPageMessage('Fascia rimossa.');
      router.refresh();
    } catch {
      setPageError('Non è stato possibile eliminare la fascia. Riprova.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900">
            Disponibilità settimanale
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Aggiungi o modifica una fascia: ogni conferma viene salvata subito.
          </p>
        </div>
        <Button
          type="button"
          onClick={openAddDialog}
          disabled={saving || deletingId !== null}
          className="rounded-full"
          aria-haspopup="dialog"
        >
          <CalendarPlus className="h-4 w-4" />
          Aggiungi giorno o fascia
        </Button>
      </div>

      {orderedSlots.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
          <p className="text-sm text-gray-600">
            Nessuna disponibilità configurata.
          </p>
          <Button
            type="button"
            onClick={openAddDialog}
            className="mt-3 rounded-full"
          >
            <CalendarPlus className="h-4 w-4" />
            Aggiungi il primo giorno
          </Button>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {orderedSlots.map((slot, index) => (
            <li
              key={slot.id}
              className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-end"
            >
              <div>
                <p className="text-xs font-medium text-gray-600">Giorno</p>
                <p className="mt-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
                  {WEEKDAY_LABELS[slot.weekday]}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600">Inizio</p>
                <p className="mt-1 flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
                  {formatMinutesOfDay(slot.startMinute)}
                  <Clock3 className="h-4 w-4 text-gray-400" />
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600">Fine</p>
                <p className="mt-1 flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
                  {formatMinutesOfDay(slot.endMinute)}
                  <Clock3 className="h-4 w-4 text-gray-400" />
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => openEditDialog(slot)}
                  disabled={saving || deletingId !== null}
                  className="text-green-700 hover:border-green-300 hover:bg-green-50 hover:text-green-800"
                  aria-label={`Modifica fascia ${index + 1}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setSlotToDelete(slot)}
                  disabled={saving || deletingId !== null}
                  className="text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                  aria-label={`Elimina fascia ${index + 1}`}
                >
                  {deletingId === slot.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div aria-live="polite">
        {pageMessage && (
          <p className="mt-3 text-sm font-medium text-green-700">
            {pageMessage}
          </p>
        )}
        {pageError && (
          <p className="mt-3 text-sm font-medium text-red-600" role="alert">
            {pageError}
          </p>
        )}
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-black/45"
      >
        <form onSubmit={submitSlot}>
          <header className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h3 id={titleId} className="text-lg font-semibold text-gray-950">
                {editingSlot
                  ? 'Modifica giorno o fascia'
                  : 'Aggiungi giorno o fascia'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Giorno e orari sono obbligatori. Le sovrapposizioni non sono
                consentite.
              </p>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              disabled={saving}
              className="ml-3 rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              aria-label="Chiudi"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label
                htmlFor={`${titleId}-weekday`}
                className="text-sm font-medium text-gray-700"
              >
                Giorno <span className="text-red-600">*</span>
              </label>
              <select
                id={`${titleId}-weekday`}
                name="weekday"
                required
                autoFocus
                value={weekday}
                onChange={(event) => setWeekday(event.target.value)}
                disabled={saving}
                className={`${fieldCls} mt-1`}
              >
                <option value="" disabled>
                  Seleziona giorno
                </option>
                {WEEKDAY_ORDER.map((day) => (
                  <option key={day} value={day}>
                    {WEEKDAY_LABELS[day]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor={`${titleId}-start`}
                className="text-sm font-medium text-gray-700"
              >
                Inizio <span className="text-red-600">*</span>
              </label>
              <input
                id={`${titleId}-start`}
                name="start"
                type="time"
                required
                value={start}
                onChange={(event) => setStart(event.target.value)}
                disabled={saving}
                className={`${fieldCls} mt-1`}
              />
            </div>
            <div>
              <label
                htmlFor={`${titleId}-end`}
                className="text-sm font-medium text-gray-700"
              >
                Fine <span className="text-red-600">*</span>
              </label>
              <input
                id={`${titleId}-end`}
                name="end"
                type="time"
                required
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                disabled={saving}
                className={`${fieldCls} mt-1`}
              />
            </div>

            {modalError && (
              <p
                className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2"
                role="alert"
              >
                {modalError}
              </p>
            )}
          </div>

          <footer className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={closeDialog}
              disabled={saving}
              className="rounded-full"
            >
              Annulla
            </Button>
            <Button type="submit" disabled={saving} className="rounded-full">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvataggio…
                </>
              ) : (
                'OK'
              )}
            </Button>
          </footer>
        </form>
      </dialog>

      <ConfirmationDialog
        open={slotToDelete !== null}
        title="Eliminare la fascia oraria?"
        message={
          slotToDelete
            ? `La disponibilità di ${WEEKDAY_LABELS[slotToDelete.weekday]} dalle ${formatMinutesOfDay(slotToDelete.startMinute)} alle ${formatMinutesOfDay(slotToDelete.endMinute)} verrà eliminata.`
            : ''
        }
        actionLabel="Elimina fascia"
        onCancel={() => setSlotToDelete(null)}
        onConfirm={() => {
          if (!slotToDelete) return;
          const slot = slotToDelete;
          setSlotToDelete(null);
          void removeSlot(slot);
        }}
      />
    </section>
  );
}
