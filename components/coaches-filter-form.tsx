'use client';

import type { ReactNode } from 'react';

/**
 * GET filter form that re-applies as soon as any field changes — no submit
 * button. React's change events bubble up to the form, so a single onChange on
 * the <form> catches every select/checkbox and triggers a native submit
 * (server round-trip that updates the URL query + results).
 */
export function CoachesFilterForm({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      method="get"
      className={className}
      onChange={(e) => e.currentTarget.requestSubmit()}
    >
      {children}
    </form>
  );
}
