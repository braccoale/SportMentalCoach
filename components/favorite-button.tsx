'use client';

import { useState, useTransition } from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toggleFavoriteAction } from '@/app/(marketplace)/coaches/favorite-actions';

export function FavoriteButton({
  providerId,
  initial,
  loggedIn,
}: {
  providerId: number;
  initial: boolean;
  loggedIn: boolean;
}) {
  const [fav, setFav] = useState(initial);
  const [, startTransition] = useTransition();

  const base =
    'flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm ring-1 ring-gray-200 backdrop-blur hover:bg-white';

  if (!loggedIn) {
    return (
      <a href="/sign-in?redirect=/coaches" aria-label="Accedi per salvare" className={base}>
        <Heart className="h-4 w-4 text-gray-400" />
      </a>
    );
  }

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !fav;
    setFav(next); // optimistic
    startTransition(async () => {
      const res = await toggleFavoriteAction(providerId);
      setFav(res.favorited);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={fav}
      aria-label={fav ? 'Rimuovi dai preferiti' : 'Salva tra i preferiti'}
      className={base}
    >
      <Heart
        className={cn(
          'h-4 w-4',
          fav ? 'fill-red-500 text-red-500' : 'text-gray-400'
        )}
      />
    </button>
  );
}
