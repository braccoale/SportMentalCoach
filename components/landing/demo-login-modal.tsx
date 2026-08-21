'use client';

import { useEffect, useState } from 'react';
import { Dumbbell, Loader2, ShieldCheck, UserRound, X } from 'lucide-react';
import type { DemoLoginRole } from '@/lib/auth/demo-login';

export function DemoLoginModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [pendingRole, setPendingRole] = useState<DemoLoginRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  async function enter(role: DemoLoginRole) {
    setPendingRole(role);
    setError(null);
    try {
      const response = await fetch('/api/demo/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const payload = (await response.json().catch(() => null)) as {
        destination?: string;
        error?: string;
      } | null;
      if (!response.ok || !payload?.destination) {
        setError(payload?.error ?? 'Accesso demo non riuscito. Riprova.');
        return;
      }
      window.location.assign(payload.destination);
    } catch {
      setError('Accesso demo non riuscito. Controlla la connessione e riprova.');
    } finally {
      setPendingRole(null);
    }
  }

  const pending = pendingRole !== null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-login-title"
    >
      <button
        type="button"
        aria-label="Chiudi"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-lg rounded-2xl border border-kp-line bg-kp-ink2 p-7 shadow-2xl sm:p-9">
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="absolute right-4 top-4 text-kp-mid transition-colors hover:text-kp-hi"
        >
          <X className="h-5 w-5" />
        </button>

        <span className="inline-flex items-center gap-2 rounded-full border border-kp-red/30 bg-kp-red/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-kp-red">
          <ShieldCheck className="h-3.5 w-3.5" />
          Demo in sola lettura
        </span>
        <h2
          id="demo-login-title"
          className="mt-5 font-display text-3xl font-semibold tracking-tight text-kp-hi"
        >
          Da quale prospettiva vuoi entrare?
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-kp-mid">
          Esplora profili, sessioni, chat, obiettivi e Session Compass già
          compilati. I dati sono interamente inventati e non possono essere modificati.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => void enter('coach')}
            className="group rounded-2xl border border-kp-line bg-kp-surface p-5 text-left transition hover:border-kp-red/50 hover:bg-kp-red/5 disabled:cursor-wait disabled:opacity-60"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-kp-red/10 text-kp-red">
              {pendingRole === 'coach' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <UserRound className="h-5 w-5" />
              )}
            </span>
            <span className="mt-4 block font-display text-lg font-semibold text-kp-hi">
              Entra come Coach
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-kp-mid">
              Segui cinque atleti e consulta il loro percorso mentale.
            </span>
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => void enter('athlete')}
            className="group rounded-2xl border border-kp-line bg-kp-surface p-5 text-left transition hover:border-kp-red/50 hover:bg-kp-red/5 disabled:cursor-wait disabled:opacity-60"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-kp-red/10 text-kp-red">
              {pendingRole === 'athlete' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Dumbbell className="h-5 w-5" />
              )}
            </span>
            <span className="mt-4 block font-display text-lg font-semibold text-kp-hi">
              Entra come Atleta
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-kp-mid">
              Consulta sessioni, obiettivi, chat e progressi personali.
            </span>
          </button>
        </div>

        {error && <p className="mt-5 text-sm text-kp-red">{error}</p>}
      </div>
    </div>
  );
}
