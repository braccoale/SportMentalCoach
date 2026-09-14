'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openCoachChat } from '@/app/(marketplace)/coaches/[slug]/actions';

export function CoachChatButton({ slug, loggedIn, isAthlete }: { slug: string; loggedIn: boolean; isAthlete: boolean }) {
  const [state, action, pending] = useActionState(openCoachChat, {});
  if (!loggedIn) return <Button asChild variant="outline" size="icon" className="rounded-full"><Link href={`/sign-in?redirect=${encodeURIComponent(`/coaches/${slug}`)}`} aria-label="Chat" title="Accedi per aprire la chat"><MessageCircle /></Link></Button>;
  return <form action={action} className="relative">
    <input type="hidden" name="slug" value={slug} />
    <Button type="submit" variant="outline" size="icon" className="rounded-full" disabled={pending || !isAthlete} aria-label="Chat" title={isAthlete ? 'Chat' : 'La chat con il coach è riservata agli atleti'}>{pending ? <Loader2 className="animate-spin" /> : <MessageCircle />}</Button>
    {state.error && <p role="alert" className="absolute right-11 top-0 z-20 w-56 rounded-xl border border-red-100 bg-white p-3 text-sm text-red-600 shadow-lg">{state.error}</p>}
  </form>;
}
