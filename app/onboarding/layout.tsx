import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUser } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

/**
 * Onboarding lives outside `/dashboard` on purpose: the middleware gate sends
 * not-yet-onboarded users here, so putting it under `/dashboard` would loop.
 * Auth is still required — an anonymous visitor is sent to sign in.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-4 py-4">
          <Link href="/" className="flex items-center gap-2.5" aria-label="KaiPai">
            <img src="/logo.jpg" alt="KaiPai" className="h-8 w-8 rounded-lg" />
            <span className="font-semibold text-gray-900">KaiPai</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}
