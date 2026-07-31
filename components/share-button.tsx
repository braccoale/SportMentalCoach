'use client';

import { useState } from 'react';
import { Check, Loader2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createGuestInviteLink } from '@/components/actions';

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

export function ShareButton({
  bookingId,
  appearance = 'standard',
}: {
  bookingId: number;
  appearance?: 'standard' | 'room';
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inRoom = appearance === 'room';

  async function shareCall() {
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const result = await createGuestInviteLink(bookingId);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const shareData = {
        title: 'Invito alla videochiamata KaiPai',
        text: 'Puoi partecipare come ospite alla videochiamata KaiPai da questo link riservato.',
        url: result.url,
      };
      if (navigator.share) {
        try {
          await navigator.share(shareData);
          setMessage('Invito condiviso.');
        } catch (shareError) {
          if (
            shareError instanceof DOMException &&
            shareError.name === 'AbortError'
          ) {
            return;
          }
          await copyText(result.url);
          setMessage('Link copiato.');
        }
      } else {
        await copyText(result.url);
        setMessage('Link copiato.');
      }
    } catch {
      setError('Non è stato possibile creare il link. Riprova.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={`flex min-w-0 flex-col items-start gap-1 ${
        inRoom ? 'shrink-0' : ''
      }`}
    >
      <Button
        type="button"
        variant="outline"
        onClick={() => void shareCall()}
        disabled={pending}
        className={`rounded-full ${
          inRoom
            ? 'border-white/30 bg-white/10 text-white shadow-none hover:bg-white/20 hover:text-white'
            : ''
        }`}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : message ? (
          <Check className="h-4 w-4 text-green-700" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
        {pending ? 'Creazione link…' : message ?? 'Condividi chiamata'}
      </Button>
      {error && (
        <span
          className={`max-w-64 text-xs font-medium ${
            inRoom ? 'text-red-300' : 'text-red-600'
          }`}
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  );
}
