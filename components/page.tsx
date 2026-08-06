'use client';

import { useState } from 'react';
import { CalendarClock, ShieldCheck, Video } from 'lucide-react';
import { GuestVideoRoom } from './guest-video-room';
import { formatDateTime } from '@/lib/core/format';

export type GuestJoinResult =
  | {
      ok: true;
      token: string;
      preflightToken: string;
      serverUrl: string;
      coachIdentity: string;
    }
  | {
      ok: false;
      reason:
        | 'invalid'
        | 'closed'
        | 'past'
        | 'not_configured'
        | 'ai_notes_active'
        | 'guardian_required';
    }
  | {
      ok: false;
      reason: 'too_early';
      scheduledFor: string;
    };

const ERROR_COPY = {
  invalid: {
    title: 'Invito non valido',
    body: 'Il link non è valido o è scaduto. Chiedi a uno dei partecipanti di condividerne uno nuovo.',
  },
  closed: {
    title: 'Sessione non disponibile',
    body: 'La sessione è stata annullata o non è più confermata.',
  },
  past: {
    title: 'Sessione terminata',
    body: 'La finestra di accesso a questa videochiamata è terminata.',
  },
  not_configured: {
    title: 'Videochiamata non disponibile',
    body: 'Il servizio video non è configurato. Contatta chi ti ha inviato il link.',
  },
  ai_notes_active: {
    title: 'Accesso ospite non disponibile',
    body: 'In questa sessione sono attivi gli Appunti AI. Per motivi di consenso possono partecipare soltanto coach e atleta autenticati.',
  },
  guardian_required: {
    title: 'Sessione non autorizzata',
    body: 'L’autorizzazione del genitore o tutore dell’atleta minorenne non è attiva. La videochiamata non può proseguire.',
  },
} as const;

export default function GuestJoinPage({ result }: { result: GuestJoinResult }) {
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (result.ok && submitted) {
    return (
      <main className="min-h-screen bg-gray-950 p-3 sm:p-6">
        <div className="mx-auto h-[calc(100vh-1.5rem)] max-w-7xl overflow-hidden rounded-2xl sm:h-[calc(100vh-3rem)]">
          <GuestVideoRoom
            serverUrl={result.serverUrl}
            token={result.token}
            preflightToken={result.preflightToken}
            coachIdentity={result.coachIdentity}
            name={name.trim()}
          />
        </div>
      </main>
    );
  }

  if (!result.ok && result.reason === 'too_early') {
    return (
      <GuestMessage
        icon={<CalendarClock className="h-8 w-8 text-green-700" />}
        title="La chiamata non è ancora aperta"
        body={`Potrai entrare 5 minuti prima dell’appuntamento del ${formatDateTime(
          new Date(result.scheduledFor)
        )}. Conserva questo link e riaprilo poco prima dell’inizio.`}
      />
    );
  }

  if (!result.ok) {
    const copy = ERROR_COPY[result.reason];
    return (
      <GuestMessage
        icon={<Video className="h-8 w-8 text-red-600" />}
        title={copy.title}
        body={copy.body}
      />
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = name.trim();
    if (normalized.length >= 2) {
      setName(normalized);
      setSubmitted(true);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
            <Video className="h-7 w-7 text-green-700" />
          </span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-green-700">
            Invito ospite KaiPai
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-950">
            Entra nella videochiamata
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Inserisci il nome che vedranno gli altri partecipanti.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6">
          <label htmlFor="guest-name" className="text-sm font-medium text-gray-700">
            Il tuo nome <span className="text-red-600">*</span>
          </label>
          <input
            id="guest-name"
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome e cognome"
            className="mt-1 w-full rounded-full border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
          />
          <button
            type="submit"
            disabled={name.trim().length < 2}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Video className="h-4 w-4" />
            Entra come ospite
          </button>
        </form>

        <p className="mt-5 flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-xs leading-5 text-gray-600">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />
          Questo link è riservato alla sessione. Non condividerlo con altre
          persone senza il consenso dei partecipanti.
        </p>
      </div>
    </main>
  );
}

function GuestMessage({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-xl">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-50">
          {icon}
        </span>
        <h1 className="mt-5 text-xl font-bold text-gray-950">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">{body}</p>
      </div>
    </main>
  );
}
