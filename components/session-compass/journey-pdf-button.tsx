'use client';

import Image from 'next/image';
import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';

type DownloadState = 'idle' | 'loading' | 'done' | 'popup-blocked' | 'error';

export function JourneyPdfButton({ href }: { href: string }) {
  return <PdfDownloadButton href={href} />;
}

export function PdfDownloadButton({
  href,
  text = null,
  fallbackFileName = 'documento-kaipai.pdf',
  accessibleLabel,
}: {
  href: string;
  text?: string | null;
  fallbackFileName?: string;
  accessibleLabel?: string;
}) {
  const [state, setState] = useState<DownloadState>('idle');
  const isLoading = state === 'loading';
  const label = downloadLabel(state, accessibleLabel ?? null);

  async function downloadAndOpen() {
    if (isLoading) return;
    setState('loading');

    // La scheda va aperta durante il gesto dell'utente: dopo l'attesa della
    // generazione PDF i browser la tratterebbero come un popup e la
    // bloccherebbero. Non riceve riferimenti alla pagina che l'ha aperta.
    const preview = window.open('about:blank', '_blank');
    if (preview) {
      preview.opener = null;
      preview.document.documentElement.lang = 'it';
      preview.document.title = 'Preparazione PDF — KaiPai';
      preview.document.body.textContent = 'Preparazione del PDF in corso…';
    }

    try {
      const response = await fetch(href, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`PDF_EXPORT_${response.status}`);

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const fileName = pdfFileNameFromDisposition(
        response.headers.get('content-disposition'),
        fallbackFileName
      );

      const download = document.createElement('a');
      download.href = objectUrl;
      download.download = fileName;
      download.style.display = 'none';
      document.body.appendChild(download);
      download.click();
      download.remove();

      if (preview && !preview.closed) {
        preview.location.replace(objectUrl);
        setState('done');
      } else {
        // Il download è comunque riuscito: rendiamo esplicito che solo
        // l'apertura è stata bloccata dalle preferenze del browser.
        setState('popup-blocked');
      }

      // Il visualizzatore ha tempo di acquisire il blob; la revoca evita che
      // download ripetuti tengano memoria occupata per tutta la sessione.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60_000);
    } catch {
      if (preview && !preview.closed) preview.close();
      setState('error');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={downloadAndOpen}
        disabled={isLoading}
        title={label}
        aria-label={label}
        className={`inline-flex items-center justify-center bg-white/75 text-gray-900 shadow-sm ring-1 ring-gray-200/80 backdrop-blur-md transition hover:scale-[1.02] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-wait disabled:opacity-70 ${
          text
            ? 'h-11 gap-2 rounded-lg px-3 text-sm font-semibold'
            : 'size-12 rounded-full'
        }`}
      >
        {isLoading ? (
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <Image
            src="/icons/pdf-download.png"
            alt=""
            width={40}
            height={40}
            className={`${text ? 'size-8' : 'size-10'} object-contain`}
            aria-hidden="true"
          />
        )}
        {text ? <span>{text}</span> : null}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'idle' ? '' : label}
      </span>
    </>
  );
}

export function pdfFileNameFromDisposition(
  header: string | null,
  fallback = 'percorso-mentale.pdf'
): string {
  if (!header) return fallback;

  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // Continua con il filename tradizionale.
    }
  }

  return header.match(/filename="([^"]+)"/i)?.[1] ?? fallback;
}

function downloadLabel(state: DownloadState, idleLabel: string | null): string {
  switch (state) {
    case 'loading':
      return 'Preparazione del PDF in corso';
    case 'done':
      return 'PDF scaricato e aperto in una nuova scheda';
    case 'popup-blocked':
      return 'PDF scaricato. Consenti i popup per aprirlo automaticamente';
    case 'error':
      return 'Download non riuscito. Riprova';
    default:
      return idleLabel ?? 'Scarica e apri il percorso in PDF';
  }
}
