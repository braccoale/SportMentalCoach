'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/core/format';

type Message = { id: number; senderId: number; body: string; createdAt: string };

export function DirectChatPanel({ conversationId, currentUserId, initialMessages, readOnly }: {
  conversationId: number; currentUserId: number; initialMessages: Message[]; readOnly: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const endpoint = `/api/direct-chat/${conversationId}/messages`;
  const refresh = useCallback(async () => {
    if (inFlight.current || document.hidden) return;
    inFlight.current = true;
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      setMessages(current => [...new Map([...current, ...data.messages].map((m: Message) => [m.id, m])).values()].sort((a, b) => a.id - b.id));
    } finally { inFlight.current = false; }
  }, [endpoint]);
  useEffect(() => {
    const poll = () => { void refresh().catch(() => {}); };
    const timer = window.setInterval(poll, 5000);
    window.addEventListener('focus', poll);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', poll); };
  }, [refresh]);
  const lastId = messages.at(-1)?.id;
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [lastId]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (pending || readOnly || !body.trim()) return;
    setPending(true); setError('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || 'Invio non riuscito. Riprova.'); return; }
      setBody('');
      setMessages(current => [...new Map([...current, ...data.messages].map((m: Message) => [m.id, m])).values()].sort((a, b) => a.id - b.id));
    } catch { setError('Connessione non disponibile. Il messaggio non è stato inviato. Riprova.'); }
    finally { setPending(false); }
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div role="log" aria-label="Messaggi" aria-live="polite" className="flex max-h-[55vh] min-h-64 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 && <p className="my-auto text-center text-sm text-gray-500">Nessun messaggio. Presentati e racconta cosa cerchi nel coaching.</p>}
        {messages.map(message => <div key={message.id} className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.senderId === currentUserId ? 'self-end bg-green-50' : 'self-start bg-gray-100'}`}>
          <p className="whitespace-pre-wrap break-words text-sm text-gray-900">{message.body}</p>
          <time dateTime={message.createdAt} className="mt-1 block text-[11px] text-gray-500">{formatDateTime(new Date(message.createdAt))}</time>
        </div>)}
        <div ref={bottom} />
      </div>
      {readOnly ? <p className="border-t p-4 text-sm text-gray-500">Questa chat è in sola lettura.</p> : <form onSubmit={send} className="border-t border-gray-100 p-4">
        <label htmlFor="direct-message" className="sr-only">Messaggio</label>
        <textarea id="direct-message" value={body} onChange={event => setBody(event.target.value)} disabled={pending} maxLength={4000} rows={3} placeholder="Scrivi un messaggio…" className="w-full resize-y rounded-xl border border-gray-200 p-3 text-sm focus:border-green-500 focus:outline-none" />
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">{body.length}/4000</span>
          <Button type="submit" disabled={pending || !body.trim()} className="rounded-full">{pending ? <Loader2 className="animate-spin" /> : <Send />}{pending ? 'Invio…' : 'Invia'}</Button>
        </div>
      </form>}
    </div>
  );
}
