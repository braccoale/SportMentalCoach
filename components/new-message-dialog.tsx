'use client';

import { useActionState } from 'react';
import { Loader2, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoachAvatar } from '@/components/coach-visuals';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { openCoachChat } from '@/app/(marketplace)/coaches/[slug]/actions';

export type MessageableCoach = {
  slug: string;
  name: string;
  avatarUrl: string | null;
};

/**
 * «Nuovo messaggio»: l'atleta sceglie uno dei coach con cui ha già a che fare
 * e si apre la chat diretta, con la stessa azione dell'icona sulla scheda del
 * coach (`openCoachChat`): apre quella esistente o ne crea una, e porta lì.
 * Il coach si manda come `slug`; il resto lo ricava il server.
 */
export function NewMessageDialog({ coaches }: { coaches: MessageableCoach[] }) {
  const [state, action, pending] = useActionState(openCoachChat, {});

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" className="gap-2 rounded-full">
          <MessageSquarePlus className="h-4 w-4" aria-hidden />
          Nuovo messaggio
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-3xl p-6">
        <DialogTitle className="text-xl">Nuovo messaggio</DialogTitle>
        <DialogDescription>
          Scegli il coach a cui vuoi scrivere.
        </DialogDescription>

        {coaches.length === 0 ? (
          <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
            Non hai ancora coach con cui scrivere. Quando prenoti una seduta o
            salvi un coach tra i preferiti, lo trovi qui. Puoi anche scrivere
            dall&apos;icona del fumetto sulla scheda di un coach.
          </p>
        ) : (
          <form action={action} className="mt-4">
            <ul className="flex max-h-[60dvh] flex-col gap-1 overflow-y-auto">
              {coaches.map((coach) => (
                <li key={coach.slug}>
                  <button
                    type="submit"
                    name="slug"
                    value={coach.slug}
                    disabled={pending}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-60"
                  >
                    <CoachAvatar
                      name={coach.name}
                      src={coach.avatarUrl}
                      className="size-10 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-gray-900">
                      {coach.name}
                    </span>
                    {pending && (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-hidden />
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <div role="status" aria-live="polite">
              {state.error && (
                <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
                  {state.error}
                </p>
              )}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
