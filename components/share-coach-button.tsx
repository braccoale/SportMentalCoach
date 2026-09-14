'use client';

import { useState } from 'react';
import { Dialog } from 'radix-ui';
import { Check, Copy, Mail, MessageCircle, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ShareCoachButton({ name, profilePath }: {
  name: string;
  profilePath: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const text = `Scopri il profilo di ${name} su KaiPai`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setError('');
    } catch {
      setError('Non riesco a copiare il link. Selezionalo e copialo dal campo qui sopra.');
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => {
      if (next) {
        setUrl(new URL(profilePath, window.location.origin).href);
        setCopied(false);
        setError('');
      }
      setOpen(next);
    }}>
      <Dialog.Trigger asChild>
        <Button type="button" variant="outline" size="icon" className="rounded-full" aria-label="Condividi" title="Condividi">
          <Share2 />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-6 shadow-xl focus:outline-none">
          <Dialog.Title className="pr-8 text-xl font-semibold text-gray-900">Condividi il profilo</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-gray-600">
            Fai conoscere {name} a chi cerca un mental coach.
          </Dialog.Description>
          <Dialog.Close asChild>
            <Button type="button" variant="ghost" size="icon" className="absolute right-3 top-3 rounded-full" aria-label="Chiudi">
              <X />
            </Button>
          </Dialog.Close>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button asChild variant="outline" className="rounded-full">
              <a href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <a href={`mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${text}\n${url}`)}`}>
                <Mail /> Email
              </a>
            </Button>
          </div>
          <label htmlFor="coach-share-url" className="mt-6 block text-sm font-medium text-gray-700">Link al profilo</label>
          <input id="coach-share-url" readOnly value={url} onFocus={(event) => event.currentTarget.select()} className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700" />
          <Button type="button" onClick={copyLink} className="mt-3 w-full rounded-full">
            {copied ? <Check /> : <Copy />}{copied ? 'Link copiato' : 'Copia link'}
          </Button>
          <p role="status" className="mt-2 text-sm text-gray-600">{error || (copied ? 'Il link è stato copiato negli appunti.' : '')}</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
