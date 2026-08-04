'use client';

import {
  type FormEvent,
  useId,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  BriefcaseBusiness,
  Clock3,
  Euro,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/action-form';
import type { Service } from '@/lib/db/schema';
import {
  createServiceAction,
  deleteServiceAction,
  updateServiceAction,
} from './service-actions';
import { DEFAULT_SERVICE_DURATION_MIN } from '@/lib/core/services/validation';

const fieldCls =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:border-green-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600/20';

function eurosFromCents(cents: number | null): string {
  return cents == null ? '' : String(cents / 100);
}

function formatPrice(cents: number | null): string {
  if (cents == null) return 'Prezzo non definito';
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

export function ServicesEditor({ services }: { services: Service[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [title, setTitle] = useState('');
  const [durationMin, setDurationMin] = useState(
    String(DEFAULT_SERVICE_DURATION_MIN)
  );
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  function openAddDialog() {
    setEditingService(null);
    setTitle('');
    setDurationMin(String(DEFAULT_SERVICE_DURATION_MIN));
    setPrice('');
    setDescription('');
    setModalError(null);
    setPageMessage(null);
    setPageError(null);
    dialogRef.current?.showModal();
  }

  function openEditDialog(service: Service) {
    setEditingService(service);
    setTitle(service.title ?? '');
    setDurationMin(
      String(service.durationMin ?? DEFAULT_SERVICE_DURATION_MIN)
    );
    setPrice(eurosFromCents(service.price));
    setDescription(service.description ?? '');
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

  async function submitService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setModalError(null);
    setPageError(null);

    const formData = new FormData(event.currentTarget);
    if (editingService) {
      formData.set('serviceId', String(editingService.id));
    }

    try {
      const result = editingService
        ? await updateServiceAction({}, formData)
        : await createServiceAction({}, formData);
      if (result.error) {
        setModalError(result.error);
        return;
      }

      dialogRef.current?.close();
      setPageMessage(
        editingService ? 'Servizio aggiornato.' : 'Servizio aggiunto.'
      );
      router.refresh();
    } catch {
      setModalError('Non è stato possibile salvare il servizio. Riprova.');
    } finally {
      setSaving(false);
    }
  }

  async function removeService(service: Service) {
    setDeletingId(service.id);
    setPageMessage(null);
    setPageError(null);
    const formData = new FormData();
    formData.set('serviceId', String(service.id));

    try {
      const result = await deleteServiceAction({}, formData);
      if (result.error) {
        setPageError(result.error);
        return;
      }
      setPageMessage('Servizio eliminato.');
      router.refresh();
    } catch {
      setPageError('Non è stato possibile eliminare il servizio. Riprova.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Servizi</h2>
          <p className="mt-1 text-sm text-gray-500">
            Aggiungi o modifica un servizio: ogni conferma viene salvata subito.
          </p>
        </div>
        <Button
          type="button"
          onClick={openAddDialog}
          disabled={saving || deletingId !== null}
          className="rounded-full"
          aria-haspopup="dialog"
        >
          <Plus className="h-4 w-4" />
          Aggiungi servizio
        </Button>
      </div>

      {services.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
          <BriefcaseBusiness className="mx-auto h-6 w-6 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">
            Nessun servizio configurato.
          </p>
          <Button
            type="button"
            onClick={openAddDialog}
            className="mt-3 rounded-full"
          >
            <Plus className="h-4 w-4" />
            Aggiungi il primo servizio
          </Button>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {services.map((service, index) => (
            <li
              key={service.id}
              className="flex min-h-40 flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-gray-950">
                    {service.title ?? 'Servizio senza titolo'}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-gray-700">
                      <Clock3 className="h-3.5 w-3.5 text-green-700" />
                      {service.durationMin ?? DEFAULT_SERVICE_DURATION_MIN} min
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-gray-700">
                      <Euro className="h-3.5 w-3.5 text-green-700" />
                      {formatPrice(service.price)}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => openEditDialog(service)}
                    disabled={saving || deletingId !== null}
                    className="text-green-700 hover:border-green-300 hover:bg-green-50 hover:text-green-800"
                    aria-label={`Modifica servizio ${index + 1}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setServiceToDelete(service)}
                    disabled={saving || deletingId !== null}
                    className="text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                    aria-label={`Elimina servizio ${index + 1}`}
                  >
                    {deletingId === service.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-gray-600">
                {service.description || 'Nessuna descrizione.'}
              </p>
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
        <form onSubmit={submitService}>
          <header className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h3 id={titleId} className="text-lg font-semibold text-gray-950">
                {editingService ? 'Modifica servizio' : 'Aggiungi servizio'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Inserisci i dati del servizio. Titolo e durata sono obbligatori.
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
                htmlFor={`${titleId}-service-title`}
                className="text-sm font-medium text-gray-700"
              >
                Titolo <span className="text-red-600">*</span>
              </label>
              <input
                id={`${titleId}-service-title`}
                name="title"
                required
                autoFocus
                maxLength={160}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={saving}
                placeholder="Es. Sessione individuale"
                className={`${fieldCls} mt-1`}
              />
            </div>

            <div>
              <label
                htmlFor={`${titleId}-duration`}
                className="text-sm font-medium text-gray-700"
              >
                Durata in minuti <span className="text-red-600">*</span>
              </label>
              <input
                id={`${titleId}-duration`}
                name="durationMin"
                type="number"
                required
                min={1}
                max={1440}
                step={1}
                value={durationMin}
                onChange={(event) => setDurationMin(event.target.value)}
                disabled={saving}
                className={`${fieldCls} mt-1`}
              />
            </div>
            <div>
              <label
                htmlFor={`${titleId}-price`}
                className="text-sm font-medium text-gray-700"
              >
                Prezzo in euro
              </label>
              <input
                id={`${titleId}-price`}
                name="price"
                type="number"
                min={0}
                max={1000000}
                step="0.01"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                disabled={saving}
                placeholder="Es. 60"
                className={`${fieldCls} mt-1`}
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor={`${titleId}-description`}
                className="text-sm font-medium text-gray-700"
              >
                Descrizione
              </label>
              <textarea
                id={`${titleId}-description`}
                name="description"
                rows={4}
                maxLength={4000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={saving}
                placeholder="Descrivi brevemente obiettivi e contenuti del servizio"
                className={`${fieldCls} mt-1 resize-y`}
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
        open={serviceToDelete !== null}
        title="Eliminare il servizio?"
        message={`Il servizio “${serviceToDelete?.title ?? 'Senza titolo'}” verrà eliminato definitivamente.`}
        actionLabel="Elimina servizio"
        onCancel={() => setServiceToDelete(null)}
        onConfirm={() => {
          if (!serviceToDelete) return;
          const service = serviceToDelete;
          setServiceToDelete(null);
          void removeService(service);
        }}
      />
    </section>
  );
}
