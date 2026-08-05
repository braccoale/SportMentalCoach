import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/core/format';

/**
 * Generic user avatar: shows the uploaded image when present, otherwise the
 * user's uppercase initials (first + last, e.g. "John Smith" → "JS") on the
 * KaiPai brand-red disc.
 */
export function UserAvatar({
  name,
  src,
  className,
}: {
  name?: string | null;
  src?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn('size-9', className)}>
      {src ? (
        <AvatarImage className="object-cover" src={src} alt={name ?? 'Utente'} />
      ) : null}
      <AvatarFallback className="bg-red-600 font-semibold uppercase text-white">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
