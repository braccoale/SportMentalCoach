'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  Send,
  Share2,
  X,
} from 'lucide-react';
import { track } from '@/lib/core/analytics';

/**
 * Share dialog for "Invita un amico". Controlled by the parent (open/onClose)
 * so it can be triggered from the dashboard card and from the profile menu.
 *
 * The personal link is fetched from `/api/invite` the first time the dialog
 * opens and then cached for the component's lifetime — reopening never
 * regenerates a code. Fully keyboard-accessible: focus trap, ESC to close,
 * ARIA dialog semantics, focus restored to the trigger on close.
 */

const SHARE_TITLE = 'KaiPai';

function whatsappText(link: string) {
  return `Ciao! Ho scoperto KaiPai, una piattaforma per trovare il mental coach sportivo più adatto ai propri obiettivi. Penso potrebbe interessarti. Puoi registrarti qui: ${link}`;
}

const EMAIL_SUBJECT = 'Ti consiglio KaiPai';
function emailBody(link: string) {
  return `Ciao!\n\nHo scoperto KaiPai, una piattaforma che aiuta gli sportivi a trovare il mental coach più adatto ai propri obiettivi.\n\nPenso potrebbe interessarti.\n\nPuoi scoprirla e registrarti gratuitamente qui:\n\n${link}`;
}

export function InviteModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const inFlight = useRef(false);

  // Feature-detect Web Share once mounted (avoids SSR/hydration mismatch).
  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && !!navigator.share);
  }, []);

  const loadLink = useCallback(async () => {
    if (url || inFlight.current) return; // never regenerate / double-fetch
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/invite', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (typeof data.url === 'string') setUrl(data.url);
      else throw new Error('bad-response');
    } catch {
      setError('Non è stato possibile generare il link. Riprova.');
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [url]);

  // On open: remember focus, load the link, emit the event.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    track('invite_modal_opened');
    void loadLink();
    // Move focus into the dialog.
    const t = setTimeout(() => panelRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open, loadLink]);

  // Restore focus to the trigger when the dialog closes.
  useEffect(() => {
    if (open) return;
    previouslyFocused.current?.focus?.();
    setCopied(false);
  }, [open]);

  // ESC to close + focus trap on Tab.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const copyLink = useCallback(async () => {
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for browsers without the async Clipboard API.
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      track('invite_link_copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copia non riuscita. Copia il link manualmente.');
    }
  }, [url]);

  const nativeShare = useCallback(async () => {
    if (!url || !navigator.share) return;
    try {
      await navigator.share({ title: SHARE_TITLE, text: whatsappText(url), url });
      track('invite_native_share');
    } catch {
      // User dismissed the share sheet — not an error worth surfacing.
    }
  }, [url]);

  if (!open) return null;

  const disabled = loading || !url;
  const waHref = url
    ? `https://wa.me/?text=${encodeURIComponent(whatsappText(url))}`
    : '#';
  const mailHref = url
    ? `mailto:?subject=${encodeURIComponent(EMAIL_SUBJECT)}&body=${encodeURIComponent(emailBody(url))}`
    : '#';
  const tgHref = url
    ? `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(whatsappText(url))}`
    : '#';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-title"
      aria-describedby="invite-desc"
    >
      <button
        type="button"
        aria-label="Chiudi"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-t-2xl border border-gray-200 bg-white p-6 shadow-2xl outline-none sm:rounded-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="invite-title" className="text-lg font-semibold text-gray-900">
              Invita un amico su KaiPai
            </h2>
            <p id="invite-desc" className="mt-1 text-sm text-gray-500">
              Conosci qualcuno che vuole migliorare concentrazione, motivazione o
              gestione dell&apos;ansia nello sport? Condividi KaiPai con lui.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Link preview */}
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <Link2 className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="min-w-0 flex-1 truncate text-sm text-gray-600">
            {loading ? 'Generazione del link…' : url ?? '—'}
          </span>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {/* Actions */}
        <div className="mt-5 flex flex-col gap-2">
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={disabled}
            onClick={(e) => {
              if (disabled) e.preventDefault();
              else track('invite_shared_whatsapp');
            }}
            className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors ${
              disabled
                ? 'pointer-events-none bg-green-600/50'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            <MessageCircle className="h-4 w-4" /> Condividi su WhatsApp
          </a>

          <a
            href={mailHref}
            aria-disabled={disabled}
            onClick={(e) => {
              if (disabled) e.preventDefault();
              else track('invite_shared_email');
            }}
            className={`inline-flex items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors ${
              disabled
                ? 'pointer-events-none border-gray-200 text-gray-400'
                : 'border-gray-300 text-gray-800 hover:bg-gray-50'
            }`}
          >
            <Mail className="h-4 w-4" /> Invia via email
          </a>

          <button
            type="button"
            onClick={copyLink}
            disabled={disabled}
            className={`inline-flex items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors ${
              disabled
                ? 'border-gray-200 text-gray-400'
                : copied
                  ? 'border-green-300 bg-green-50 text-green-700'
                  : 'border-gray-300 text-gray-800 hover:bg-gray-50'
            }`}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" /> Link copiato
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> Copia link
              </>
            )}
          </button>

          <a
            href={tgHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={disabled}
            onClick={(e) => {
              if (disabled) e.preventDefault();
              else track('invite_shared_telegram');
            }}
            className={`inline-flex items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors ${
              disabled
                ? 'pointer-events-none border-gray-200 text-gray-400'
                : 'border-gray-300 text-gray-800 hover:bg-gray-50'
            }`}
          >
            <Send className="h-4 w-4" /> Condividi su Telegram
          </a>

          {canNativeShare && (
            <button
              type="button"
              onClick={nativeShare}
              disabled={disabled}
              className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
                disabled
                  ? 'text-gray-400'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              Altre opzioni
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
