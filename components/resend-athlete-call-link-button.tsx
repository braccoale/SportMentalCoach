'use client';

import { useCallback, useState } from 'react';
import { Check, Copy, Loader2, MessageCircle, Send, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createAthleteCallLink } from '@/components/actions';

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function invitationText(athleteName: string, url: string): string {
  return `Ciao ${athleteName}, se la connessione si è interrotta puoi rientrare nella videochiamata KaiPai da qui: ${url}`;
}

function getNativeShare(): ((data: ShareData) => Promise<void>) | null {
  if (typeof navigator === 'undefined') return null;
  const share = (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share;
  return typeof share === 'function' ? share.bind(navigator) : null;
}

/**
 * Lets only the coach resend the authenticated athlete room URL. The URL is
 * intentionally not a LiveKit token nor a guest invitation: opening it still
 * requires the athlete's own KaiPai account and all normal server checks.
 */
export function ResendAthleteCallLinkButton({
  bookingId,
  athleteName,
  appearance = 'standard',
}: {
  bookingId: number;
  athleteName: string;
  appearance?: 'standard' | 'room';
}) {
  const [pending, setPending] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const inRoom = appearance === 'room';

  const prepareLink = useCallback(async () => {
    if (url || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await createAthleteCallLink(bookingId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUrl(result.url);
    } catch {
      setError('Non è stato possibile preparare il link. Riprova.');
    } finally {
      setPending(false);
    }
  }, [bookingId, pending, url]);

  const copyLink = useCallback(async () => {
    if (!url) return;
    try {
      await copyText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError('Copia non riuscita. Riprova.');
    }
  }, [url]);

  const nativeShare = useCallback(async () => {
    const share = getNativeShare();
    if (!url || !share) return;
    try {
      await share({
        title: 'Rientra nella videochiamata KaiPai',
        text: invitationText(athleteName, url),
        url,
      });
    } catch (shareError) {
      // An aborted native share sheet is a normal user choice, not an error.
      if (!(shareError instanceof DOMException && shareError.name === 'AbortError')) {
        setError('Condivisione non riuscita. Puoi copiare il link.');
      }
    }
  }, [athleteName, url]);

  const message = url ? invitationText(athleteName, url) : null;
  const canNativeShare = Boolean(getNativeShare());
  const whatsAppUrl = message
    ? `https://wa.me/?text=${encodeURIComponent(message)}`
    : '#';

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          onClick={() => void prepareLink()}
          disabled={pending}
          aria-label={`Invia a ${athleteName} il link per rientrare nella videochiamata`}
          className={`rounded-full ${
            inRoom
              ? 'border-white/30 bg-white/10 text-white shadow-none hover:bg-white/20 hover:text-white'
              : ''
          }`}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {pending ? 'Preparo il link…' : 'Invia link atleta'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Link di rientro per {athleteName}</DropdownMenuLabel>
        <p className="px-2 pb-2 text-xs leading-5 text-muted-foreground">
          Il link richiede l’accesso dell’atleta e non contiene credenziali video.
        </p>
        <DropdownMenuSeparator />
        {pending ? (
          <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparo un link sicuro…
          </div>
        ) : url ? (
          <>
            <DropdownMenuItem asChild className="cursor-pointer">
              <a href={whatsAppUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4 text-green-600" /> Invia su WhatsApp
              </a>
            </DropdownMenuItem>
            {canNativeShare && (
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={(event) => {
                  event.preventDefault();
                  void nativeShare();
                }}
              >
                <Share2 className="h-4 w-4" /> Altre app
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={(event) => {
                event.preventDefault();
                void copyLink();
              }}
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Link copiato' : 'Copia link'}
            </DropdownMenuItem>
          </>
        ) : (
          <p className="px-2 py-2 text-sm text-red-600" role="alert">
            {error ?? 'Link non disponibile.'}
          </p>
        )}
        {error && url && (
          <p className="px-2 pt-2 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
