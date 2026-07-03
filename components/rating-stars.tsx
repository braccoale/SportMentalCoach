import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Read-only star rating (rounds to the nearest whole star for display). */
export function RatingStars({
  value,
  size = 'md',
  className,
}: {
  value: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const rounded = Math.round(value);
  const px = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      aria-label={`${value} su 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            px,
            i <= rounded ? 'fill-red-500 text-red-500' : 'text-gray-300'
          )}
        />
      ))}
    </span>
  );
}
