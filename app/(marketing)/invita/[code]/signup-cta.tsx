'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { track } from '@/lib/core/analytics';

/**
 * Primary CTA on the public invite page. A client wrapper only so we can emit
 * `invite_signup_clicked`; it still points at the existing signup route with
 * the referral code carried as a query param.
 */
export function SignupCta({ href }: { href: string }) {
  return (
    <Link
      href={href}
      onClick={() => track('invite_signup_clicked')}
      className="kp-cta group inline-flex items-center gap-2 rounded-full px-8 py-4 font-semibold text-white"
    >
      Registrati gratuitamente
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </Link>
  );
}
