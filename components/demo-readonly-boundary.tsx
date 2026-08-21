'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { LockKeyhole, X } from 'lucide-react';
import { DEMO_READONLY_MESSAGE } from '@/lib/auth/demo-readonly';
import { looksLikeDemoWriteLabel } from '@/lib/auth/demo-readonly-controls';

const CONTROL_SELECTOR = 'button, [role="button"], input[type="submit"]';

function labelOf(element: HTMLElement): string {
  return [
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.textContent,
  ]
    .filter(Boolean)
    .join(' ');
}

function isAllowed(element: HTMLElement): boolean {
  return Boolean(element.closest('[data-demo-readonly-allow]'));
}

function isWriteControl(element: HTMLElement): boolean {
  if (isAllowed(element)) return false;
  if (element.closest('[data-demo-write]')) return true;
  if (
    (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) &&
    element.type === 'submit'
  ) {
    return true;
  }
  return looksLikeDemoWriteLabel(labelOf(element));
}

export function DemoReadonlyBoundary({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [blocked, setBlocked] = useState(false);

  const showBlocked = useCallback(() => {
    setBlocked(true);
    window.setTimeout(() => setBlocked(false), 4500);
  }, []);

  useEffect(() => {
    if (!enabled || !rootRef.current) return;
    const root = rootRef.current;
    const markControls = () => {
      for (const candidate of root.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)) {
        if (isWriteControl(candidate)) {
          candidate.dataset.demoReadonlyBlocked = 'true';
          candidate.setAttribute('aria-disabled', 'true');
          candidate.setAttribute('title', DEMO_READONLY_MESSAGE);
        }
      }
    };
    markControls();
    const observer = new MutationObserver(markControls);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [enabled, children]);

  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!enabled) return;
    const target = event.target as HTMLElement;
    const control = target.closest<HTMLElement>(CONTROL_SELECTOR);
    if (!control || !isWriteControl(control)) return;
    event.preventDefault();
    event.stopPropagation();
    showBlocked();
  }

  function onSubmitCapture(event: FormEvent<HTMLDivElement>) {
    if (!enabled) return;
    const form = event.target as HTMLFormElement;
    if (isAllowed(form)) return;
    event.preventDefault();
    event.stopPropagation();
    showBlocked();
  }

  return (
    <div
      ref={rootRef}
      data-demo-readonly={enabled ? 'true' : undefined}
      onClickCapture={onClickCapture}
      onSubmitCapture={onSubmitCapture}
    >
      {children}
      {enabled && blocked && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-[120] flex w-[min(92vw,36rem)] -translate-x-1/2 items-start gap-3 rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm text-violet-950 shadow-2xl"
        >
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
          <span className="flex-1">{DEMO_READONLY_MESSAGE}</span>
          <button
            type="button"
            data-demo-readonly-allow
            onClick={() => setBlocked(false)}
            aria-label="Chiudi"
            className="text-violet-700 hover:text-violet-950"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
