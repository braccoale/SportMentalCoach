import { BadgeCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/core/format';

export function CoachAvatar({
  name,
  src,
  className,
}: {
  name: string | null;
  src: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn('size-16', className)}>
      {src ? <AvatarImage src={src} alt={name ?? 'Coach'} /> : null}
      <AvatarFallback className="bg-orange-100 font-semibold text-orange-700">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Kai Pai Academy certification mark. Coloured when certified, greyed out
 * otherwise. Pass `withLabel` to also render the textual label.
 */
export function CertifiedBadge({
  certified,
  title,
  withLabel = false,
  className,
}: {
  certified: boolean;
  title: string;
  withLabel?: boolean;
  className?: string;
}) {
  return (
    <span
      title={title}
      aria-label={title}
      className={cn('inline-flex items-center gap-1', className)}
    >
      <BadgeCheck
        className={cn('h-5 w-5 shrink-0', certified ? 'text-orange-500' : 'text-gray-300')}
      />
      {withLabel && (
        <span
          className={cn(
            'text-xs font-medium',
            certified ? 'text-orange-600' : 'text-gray-400'
          )}
        >
          {title}
        </span>
      )}
    </span>
  );
}
