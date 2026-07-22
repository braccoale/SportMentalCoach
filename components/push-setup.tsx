'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

type State =
  | 'loading'
  | 'unsupported'
  | 'denied'
  | 'idle' // supported, not yet subscribed
  | 'subscribed';

/** VAPID public key (base64url) → Uint8Array for `applicationServerKey`. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * "Attiva notifiche" control: registers the service worker, subscribes the
 * device to Web Push and stores the subscription server-side. On iOS this only
 * works once the site is installed to the Home Screen (standalone PWA).
 */
export function PushSetup() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const supported =
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window &&
        Boolean(VAPID_PUBLIC_KEY);
      if (!supported) {
        if (active) setState('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        if (active) setState('denied');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const existing = await reg.pushManager.getSubscription();
        if (active) setState(existing ? 'subscribed' : 'idle');
      } catch {
        if (active) setState('unsupported');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'idle');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub),
      });
      setState(res.ok ? 'subscribed' : 'idle');
    } catch (err) {
      console.error('push subscribe failed:', err);
      setState('idle');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('idle');
    } catch (err) {
      console.error('push unsubscribe failed:', err);
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading' || state === 'unsupported') return null;

  const base =
    'flex items-center justify-between gap-3 rounded-xl border p-4';

  if (state === 'denied') {
    return (
      <div className={`${base} border-gray-200 bg-gray-50`}>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <BellOff className="h-5 w-5 shrink-0 text-gray-400" />
          Le notifiche sono bloccate nel browser. Riattivale dalle impostazioni
          del sito per riceverle sul telefono.
        </div>
      </div>
    );
  }

  if (state === 'subscribed') {
    return (
      <div className={`${base} border-emerald-200 bg-emerald-50`}>
        <div className="flex items-center gap-3 text-sm text-emerald-800">
          <BellRing className="h-5 w-5 shrink-0 text-emerald-600" />
          Notifiche push attive su questo dispositivo.
        </div>
        <button
          type="button"
          onClick={disable}
          disabled={busy}
          className="shrink-0 text-sm font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50"
        >
          {busy ? '…' : 'Disattiva'}
        </button>
      </div>
    );
  }

  return (
    <div className={`${base} border-red-200 bg-red-50`}>
      <div className="flex items-center gap-3 text-sm text-gray-700">
        <Bell className="h-5 w-5 shrink-0 text-red-500" />
        Ricevi le notifiche sul telefono anche quando l’app è chiusa.
      </div>
      <button
        type="button"
        onClick={enable}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Attiva notifiche
      </button>
    </div>
  );
}
