'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Mail, MapPin, Phone, X } from 'lucide-react';

const inputCls =
  'w-full rounded-xl border border-kp-line bg-kp-surface px-4 py-2.5 text-sm text-kp-hi placeholder:text-kp-low focus:border-kp-red/50 focus:outline-none';

const labelCls = 'mb-1.5 block text-sm font-medium text-kp-mid';

/**
 * Popup "Contatti" della landing.
 *
 * La spunta privacy non e' decorativa: senza consenso il pulsante resta
 * disabilitato e il server rifiuta comunque la richiesta, e il consenso viene
 * registrato con data e versione dell'informativa (vedi lib/core/contact).
 */
export function ContactModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Riaprire il popup deve dare un foglio bianco, non l'esito di ieri.
  useEffect(() => {
    if (open) {
      setDone(false);
      setError(null);
      setPrivacy(false);
    }
  }, [open]);

  if (!open) return null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          subject: data.get('subject'),
          message: data.get('message'),
          website: data.get('website'),
          privacyAccepted: data.get('privacy') === 'on',
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setError(json?.error ?? 'Invio non riuscito. Riprova tra poco.');
        return;
      }
      form.reset();
      setDone(true);
    } catch {
      setError('Invio non riuscito. Controlla la connessione e riprova.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Contatti"
    >
      <button
        type="button"
        aria-label="Chiudi"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />

      <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-kp-line bg-kp-ink2 p-7 shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="absolute right-4 top-4 text-kp-mid transition-colors hover:text-kp-hi"
        >
          <X className="h-5 w-5" />
        </button>

        {done ? (
          <div className="py-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-kp-red/10 text-kp-red">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <h2 className="mt-5 font-display text-2xl font-semibold text-kp-hi">
              Messaggio inviato
            </h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-kp-mid">
              Grazie: ti rispondiamo all’indirizzo che ci hai lasciato, di
              solito entro un giorno lavorativo.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="kp-cta mt-7 rounded-full px-7 py-3 font-semibold text-white"
            >
              Chiudi
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-display text-2xl font-semibold text-kp-hi">
              Parliamone
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-kp-mid">
              Scrivici: una domanda sul metodo, una collaborazione, una società
              sportiva da coinvolgere. Rispondiamo a tutti.
            </p>

            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-kp-low">
              <a
                href="mailto:info@kaipaicoaching.com"
                className="inline-flex items-center gap-1.5 transition-colors hover:text-kp-mid"
              >
                <Mail className="h-3.5 w-3.5 text-kp-red" />
                info@kaipaicoaching.com
              </a>
              <a
                href="tel:+393286212598"
                className="inline-flex items-center gap-1.5 transition-colors hover:text-kp-mid"
              >
                <Phone className="h-3.5 w-3.5 text-kp-red" />
                +39 328 6212598
              </a>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-kp-red" />
                Genova, Italia
              </span>
            </div>

            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              {/* Campo esca: invisibile a chi usa il sito, irresistibile per i
                  bot che compilano ogni input che trovano. */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
                className="hidden"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="contact-name" className={labelCls}>
                    Nome
                  </label>
                  <input
                    id="contact-name"
                    name="name"
                    type="text"
                    required
                    maxLength={120}
                    autoComplete="name"
                    className={inputCls}
                    placeholder="Mario Rossi"
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className={labelCls}>
                    Email
                  </label>
                  <input
                    id="contact-email"
                    name="email"
                    type="email"
                    required
                    maxLength={255}
                    autoComplete="email"
                    className={inputCls}
                    placeholder="mario@esempio.it"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="contact-subject" className={labelCls}>
                  Oggetto
                </label>
                <input
                  id="contact-subject"
                  name="subject"
                  type="text"
                  required
                  maxLength={160}
                  defaultValue="Richiesta informazioni"
                  className={inputCls}
                />
              </div>

              <div>
                <label htmlFor="contact-message" className={labelCls}>
                  Messaggio
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  required
                  minLength={10}
                  maxLength={4000}
                  rows={5}
                  className={`${inputCls} resize-y`}
                  placeholder="Scrivi qui il tuo messaggio…"
                />
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-kp-line bg-kp-surface/60 p-3.5">
                <input
                  type="checkbox"
                  name="privacy"
                  checked={privacy}
                  onChange={(e) => setPrivacy(e.target.checked)}
                  required
                  className="mt-0.5 h-4 w-4 shrink-0 accent-kp-red"
                />
                <span className="text-xs leading-relaxed text-kp-mid">
                  Ho letto l’
                  <Link
                    href="/privacy"
                    target="_blank"
                    className="text-kp-hi underline transition-colors hover:text-kp-red"
                  >
                    Informativa Privacy
                  </Link>{' '}
                  e acconsento al trattamento dei miei dati per ricevere una
                  risposta a questo messaggio.
                </span>
              </label>

              {error && <p className="text-sm text-kp-red">{error}</p>}

              <button
                type="submit"
                disabled={pending || !privacy}
                className="kp-cta flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Invio…
                  </>
                ) : (
                  'Invia messaggio'
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
