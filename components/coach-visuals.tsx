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
      {src ? (
        <AvatarImage
          src={src}
          alt={name ?? 'Coach'}
          className="object-cover"
        />
      ) : null}
      <AvatarFallback className="bg-red-100 font-semibold text-red-700">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * KaiPai Academy certification mark. Coloured when certified, greyed out
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
        className={cn('h-5 w-5 shrink-0', certified ? 'text-red-600' : 'text-gray-300')}
      />
      {withLabel && (
        <span
          className={cn(
            'text-xs font-medium',
            certified ? 'text-red-600' : 'text-gray-400'
          )}
        >
          {title}
        </span>
      )}
    </span>
  );
}
