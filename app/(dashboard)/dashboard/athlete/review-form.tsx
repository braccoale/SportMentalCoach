'use client';

import { useActionState, useState } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createReviewAction } from './review-actions';
import type { ActionState } from '@/lib/auth/middleware';

export function ReviewForm({
  bookingId,
  coachName,
}: {
  bookingId: number;
  coachName: string;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createReviewAction,
    {}
  );

  if (state?.success) {
    return <p className="text-sm text-green-600">{state.success}</p>;
  }

  const active = hover || rating;

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="rating" value={rating} />

      <div
        className="flex items-center gap-1"
        role="radiogroup"
        aria-label={`Valuta la sessione con ${coachName}`}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setRating(i)}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(0)}
            aria-label={`${i} ${i === 1 ? 'stella' : 'stelle'}`}
            aria-pressed={rating === i}
            className="p-0.5"
          >
            <Star
              className={`h-6 w-6 ${
                active >= i
                  ? 'fill-red-500 text-red-500'
                  : 'text-gray-300'
              }`}
            />
          </button>
        ))}
      </div>

      <textarea
        name="body"
        rows={2}
        maxLength={1000}
        placeholder="Com'è andata la sessione? (opzionale)"
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
      />

      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}

      <div>
        <Button
          type="submit"
          size="sm"
          disabled={pending || rating === 0}
          className="rounded-full"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Invia recensione'
          )}
        </Button>
      </div>
    </form>
  );
}
