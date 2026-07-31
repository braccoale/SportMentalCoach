'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Video, Loader2 } from 'lucide-react';
import { GuestVideoRoom } from './guest-video-room';

function JoinPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!token) {
    return (
      <div className="text-center text-red-500">
        Link d'invito non valido o scaduto.
      </div>
    );
  }

  if (submitted) {
    return <GuestVideoRoom token={token} name={name} />;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim()) {
      setSubmitted(true);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-lg">
      <div className="text-center">
        <Video className="mx-auto h-10 w-10 text-red-500" />
        <h1 className="mt-4 text-2xl font-bold text-gray-900">
          Entra nella videochiamata
        </h1>
        <p className="mt-2 text-gray-600">
          Inserisci il tuo nome per partecipare come ospite.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div>
          <label htmlFor="name" className="sr-only">
            Il tuo nome
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Il tuo nome"
            className="w-full rounded-md border-gray-300 px-4 py-3 text-lg shadow-sm focus:border-red-500 focus:ring-red-500"
          />
        </div>
        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full rounded-full bg-red-600 px-6 py-3 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:bg-gray-400"
        >
          Entra
        </button>
      </form>
    </div>
  );
}

export default function JoinPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin text-red-500" />}>
        <JoinPageContent />
      </Suspense>
    </main>
  );
}