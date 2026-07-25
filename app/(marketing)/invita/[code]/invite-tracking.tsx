'use client';

import { useEffect } from 'react';
import { track } from '@/lib/core/analytics';

/**
 * Client-only side effects for the public invite page:
 *  - persist the referral code in a cookie so it survives the whole signup
 *    flow (query param is primary, this is the safety net);
 *  - emit `invite_page_viewed`;
 *  - bump the open counter once per browser (deduped via localStorage), so a
 *    refresh doesn't inflate it.
 * Renders nothing.
 */
export function InviteTracking({ code }: { code: string }) {
  useEffect(() => {
    // 30-day, lax cookie — a referral code is not sensitive.
    document.cookie = `kp_ref=${encodeURIComponent(code)}; path=/; max-age=${
      60 * 60 * 24 * 30
    }; SameSite=Lax`;

    track('invite_page_viewed');

    try {
      const key = `kp_open_${code}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, '1');
        void fetch('/api/invite/open', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code }),
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // localStorage blocked (private mode) — skip dedupe, not worth failing.
    }
  }, [code]);

  return null;
}
