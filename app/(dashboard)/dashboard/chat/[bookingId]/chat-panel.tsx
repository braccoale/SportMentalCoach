'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ImagePlus, Loader2, Smile, SmilePlus, X } from 'lucide-react';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/core/format';
import {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_IMAGE_MIME_TYPES,
  MESSAGE_REACTION_EMOJIS,
} from '@/lib/core/messages/policy';

export type SerializedMessage = {
  id: number;
  senderId: number;
  senderName: string | null;
  senderEmail: string;
  body: string;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentSize: number | null;
  attachmentUrl: string | null;
  reactions: {
    emoji: string;
    count: number;
    reactedByMe: boolean;
  }[];
  createdAt: string; // ISO
};

type OpenChatImage = {
  url: string;
  name: string;
};

const COMPOSER_EMOJIS = [
  '😀',
  '😂',
  '😊',
  '😍',
  '🥰',
  '😎',
  '🤔',
  '😢',
  '😮',
  '😅',
  '😉',
  '🤗',
  '👍',
  '👏',
  '🙏',
  '💪',
  '❤️',
  '🔥',
  '🎯',
  '🏆',
  '⚽',
  '🏀',
  '🎾',
  '🏃',
] as const;

// Read at build time; empty when Supabase Realtime is not configured.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function ChatPanel({
  bookingId,
  currentUserId,
  initialMessages,
  readOnly,
  demoReadOnly,
}: {
  bookingId: number;
  currentUserId: number;
  initialMessages: SerializedMessage[];
  readOnly: boolean;
  demoReadOnly: boolean;
}) {
  const [messages, setMessages] = useState<SerializedMessage[]>(initialMessages);
  const [body, setBody] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [openImage, setOpenImage] = useState<OpenChatImage | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [reactionPickerFor, setReactionPickerFor] = useState<number | null>(
    null
  );
  const [reactionPending, setReactionPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const closeImageRef = useRef<HTMLButtonElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const realtimeEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  const interactionReadOnly = readOnly || demoReadOnly;

  // Re-fetch through the participant-guarded server endpoint. Realtime never
  // carries message content — it only triggers this authenticated fetch.
  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${bookingId}/messages`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.messages)) setMessages(data.messages);
    } catch {
      // best-effort; the server-rendered list remains valid
    }
  }, [bookingId]);

  // Optional realtime subscription (Supabase Broadcast — a content-free nudge).
  useEffect(() => {
    if (interactionReadOnly) return;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const channel = client.channel(`chat-${bookingId}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on('broadcast', { event: 'new-message' }, () => {
        refetch();
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [bookingId, interactionReadOnly, refetch]);

  useEffect(() => {
    if (!image) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  useEffect(() => {
    if (!openImage) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeImageRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenImage(null);
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [openImage]);

  useEffect(
    () => () => {
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    },
    []
  );

  function selectImage(file: File | undefined) {
    setError(null);
    if (!file) {
      setImage(null);
      return;
    }
    if (
      file.size > CHAT_IMAGE_MAX_BYTES ||
      !(CHAT_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)
    ) {
      setImage(null);
      if (fileRef.current) fileRef.current.value = '';
      setError('Usa un’immagine JPG, PNG o WebP di massimo 4 MB.');
      return;
    }
    setImage(file);
  }

  function insertEmoji(emoji: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? start;
    const nextBody = `${body.slice(0, start)}${emoji}${body.slice(end)}`;
    if (nextBody.length > 4000) return;
    setBody(nextBody);
    requestAnimationFrame(() => {
      textarea?.focus();
      const cursor = start + emoji.length;
      textarea?.setSelectionRange(cursor, cursor);
    });
  }

  function clearLongPress() {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }

  function startLongPress(
    messageId: number,
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    if (
      interactionReadOnly ||
      (event.pointerType === 'mouse' && event.button !== 0)
    ) {
      return;
    }
    clearLongPress();
    longPressStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    longPressTimerRef.current = window.setTimeout(() => {
      setReactionPickerFor(messageId);
      longPressTimerRef.current = null;
      longPressStartRef.current = null;
      navigator.vibrate?.(20);
    }, 500);
  }

  function moveLongPress(event: ReactPointerEvent<HTMLDivElement>) {
    const start = longPressStartRef.current;
    if (
      start &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10
    ) {
      clearLongPress();
    }
  }

  async function reactToMessage(messageId: number, emoji: string) {
    if (interactionReadOnly || reactionPending != null) return;
    setReactionPending(messageId);
    setError(null);
    try {
      const response = await fetch(
        `/api/chat/${bookingId}/messages/${messageId}/reaction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Reazione non aggiornata. Riprova.');
        return;
      }
      setReactionPickerFor(null);
      await refetch();
      channelRef.current?.send({
        type: 'broadcast',
        event: 'new-message',
        payload: {},
      });
    } catch {
      setError('Reazione non aggiornata. Controlla la connessione.');
    } finally {
      setReactionPending(null);
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (interactionReadOnly) return;
    const trimmed = body.trim();
    if (!trimmed && !image) {
      setError('Scrivi un messaggio o aggiungi un’immagine.');
      return;
    }

    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('body', trimmed);
      if (image) form.set('image', image);
      const response = await fetch(`/api/chat/${bookingId}/messages`, {
        method: 'POST',
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Invio non riuscito. Riprova.');
        return;
      }

      setBody('');
      setImage(null);
      if (fileRef.current) fileRef.current.value = '';
      await refetch();
      channelRef.current?.send({
        type: 'broadcast',
        event: 'new-message',
        payload: {},
      });
    } catch {
      setError('Invio non riuscito. Controlla la connessione e riprova.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="mt-6 flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nessun messaggio. Inizia la conversazione.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === currentUserId;
            return (
              <div
                key={m.id}
                onPointerDown={(event) => startLongPress(m.id, event)}
                onPointerUp={clearLongPress}
                onPointerCancel={clearLongPress}
                onPointerLeave={clearLongPress}
                onPointerMove={moveLongPress}
                onContextMenu={(event) => {
                  if (!interactionReadOnly) {
                    event.preventDefault();
                    setReactionPickerFor(m.id);
                  }
                }}
                className={`group relative max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  mine
                    ? 'self-end rounded-br-sm bg-[#dcf8c6] text-gray-900'
                    : 'self-start rounded-bl-sm border border-gray-200 bg-white text-gray-800'
                }`}
              >
                {m.attachmentUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      setOpenImage({
                        url: m.attachmentUrl!,
                        name:
                          m.attachmentName ||
                          'Screenshot condiviso in chat',
                      })
                    }
                    className="mb-2 block overflow-hidden rounded-xl bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                    title="Apri l’immagine"
                    aria-haspopup="dialog"
                  >
                    <img
                      src={m.attachmentUrl}
                      alt={m.attachmentName || 'Screenshot condiviso in chat'}
                      loading="lazy"
                      className="max-h-80 w-full min-w-48 object-contain"
                    />
                  </button>
                )}
                {m.body && <p className="whitespace-pre-line">{m.body}</p>}
                <p
                  className={`mt-1 text-[11px] ${
                    mine ? 'text-green-800/60' : 'text-gray-400'
                  }`}
                >
                  {mine ? 'Tu' : m.senderName ?? m.senderEmail} ·{' '}
                  {formatDateTime(new Date(m.createdAt))}
                </p>

                {m.reactions.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.reactions.map((reaction) => (
                      <button
                        key={reaction.emoji}
                        type="button"
                        onClick={() =>
                          reactToMessage(m.id, reaction.emoji)
                        }
                        disabled={interactionReadOnly || reactionPending != null}
                        className={`inline-flex min-h-7 items-center gap-1 rounded-full border px-2 text-xs transition ${
                          reaction.reactedByMe
                            ? 'border-green-500 bg-green-50 text-green-800'
                            : 'border-gray-200 bg-white/80 text-gray-700'
                        } disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:opacity-70`}
                        aria-label={`${reaction.emoji}, ${reaction.count} reazioni`}
                      >
                        <span aria-hidden>{reaction.emoji}</span>
                        <span>{reaction.count}</span>
                      </button>
                    ))}
                  </div>
                )}

                {!interactionReadOnly && (
                  <button
                    type="button"
                    onClick={() =>
                      setReactionPickerFor((current) =>
                        current === m.id ? null : m.id
                      )
                    }
                    className={`absolute -bottom-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:text-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 ${
                      mine ? '-left-3' : '-right-3'
                    }`}
                    aria-label="Reagisci al messaggio"
                    aria-expanded={reactionPickerFor === m.id}
                  >
                    <SmilePlus className="h-3.5 w-3.5" />
                  </button>
                )}

                {reactionPickerFor === m.id && !interactionReadOnly && (
                  <div
                    role="toolbar"
                    aria-label="Scegli una reazione"
                    className={`absolute -top-12 z-20 flex gap-0.5 rounded-full border border-gray-200 bg-white p-1.5 shadow-xl ${
                      mine ? 'right-0' : 'left-0'
                    }`}
                  >
                    {MESSAGE_REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => reactToMessage(m.id, emoji)}
                        disabled={reactionPending != null}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-lg transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 disabled:opacity-50"
                        aria-label={`Reagisci con ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {readOnly ? (
        <p className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Conversazione archiviata: puoi consultare i messaggi, ma non inviarne
          di nuovi perché l’appuntamento è stato chiuso.
        </p>
      ) : (
        <form
          onSubmit={submitMessage}
          className="mt-4 flex flex-col gap-2"
          aria-disabled={demoReadOnly}
        >
          {demoReadOnly && (
            <p className="rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 text-sm text-gray-600">
              Modalità demo in sola lettura: puoi consultare la conversazione,
              ma non inviare messaggi, allegati o reazioni.
            </p>
          )}

          <fieldset
            disabled={demoReadOnly}
            data-demo-chat-readonly={demoReadOnly ? 'true' : undefined}
            className="contents"
          >
            {previewUrl && image && (
              <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-3">
                <img
                  src={previewUrl}
                  alt="Anteprima dell’immagine da inviare"
                  className="h-20 w-24 rounded-lg bg-white object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {image.name}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {(image.size / (1024 * 1024)).toLocaleString('it-IT', {
                      maximumFractionDigits: 1,
                    })}{' '}
                    MB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setImage(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-white hover:text-red-600"
                  aria-label="Rimuovi immagine"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="relative">
              <textarea
                ref={textareaRef}
                name="body"
                rows={3}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={4000}
                placeholder="Scrivi un messaggio…"
                disabled={demoReadOnly}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-12 text-sm focus-visible:border-green-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600/20 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
              />
              <button
                type="button"
                onClick={() => setEmojiPickerOpen((open) => !open)}
                disabled={demoReadOnly}
                className="absolute bottom-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 disabled:cursor-not-allowed disabled:text-gray-300"
                aria-label="Aggiungi emoji"
                aria-expanded={emojiPickerOpen}
              >
                <Smile className="h-5 w-5" />
              </button>
              {emojiPickerOpen && !demoReadOnly && (
                <div
                  role="toolbar"
                  aria-label="Scegli un’emoji"
                  className="absolute bottom-12 right-2 z-20 grid w-64 grid-cols-8 gap-1 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl"
                >
                  {COMPOSER_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insertEmoji(emoji)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                      aria-label={`Inserisci ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-500" role="alert">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                name="image"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={demoReadOnly}
                onChange={(event) => selectImage(event.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={demoReadOnly || pending}
                className="rounded-full"
              >
                <ImagePlus className="h-4 w-4" />
                Aggiungi immagine
              </Button>
              <Button
                type="submit"
                disabled={demoReadOnly || pending || (!body.trim() && !image)}
                className="rounded-full"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Invio…
                  </>
                ) : (
                  'Invia'
                )}
              </Button>
              <span className="text-xs text-gray-400">
                JPG, PNG o WebP · max 4 MB
                {realtimeEnabled ? ' · tempo reale attivo' : ''}
              </span>
            </div>
          </fieldset>
        </form>
      )}

      {openImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Immagine condivisa in chat"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpenImage(null);
          }}
          className="fixed inset-0 z-[100] flex bg-black/90 p-3 sm:p-6"
        >
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-black shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-white/15 bg-gray-950 px-4 py-3 text-white">
              <p className="min-w-0 truncate text-sm font-medium">
                {openImage.name}
              </p>
              <Button
                ref={closeImageRef}
                type="button"
                variant="outline"
                onClick={() => setOpenImage(null)}
                className="shrink-0 rounded-full border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <X className="h-4 w-4" />
                Chiudi
              </Button>
            </header>
            <div className="flex min-h-0 flex-1 items-center justify-center p-2 sm:p-4">
              <img
                src={openImage.url}
                alt={openImage.name}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
