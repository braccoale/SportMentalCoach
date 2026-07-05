import type { CSSProperties, ReactNode } from 'react';
import { ImageIcon, type LucideIcon } from 'lucide-react';

type ImageSlotProps = {
  /** When present, the real image is shown (CSS background — a missing file
   *  degrades to the placeholder instead of a broken <img>). */
  src?: string;
  /** Background position for the image, e.g. "center top". */
  position?: string;
  /** Placeholder content when there's no src. */
  monogram?: string;
  icon?: LucideIcon;
  label?: string;
  /** 'none' hides the placeholder graphic (e.g. hero, where a glow stands in). */
  placeholder?: 'auto' | 'none';
  /** Extra classes on the image layer itself (e.g. `kp-kenburns`). */
  imageClassName?: string;
  className?: string;
  style?: CSSProperties;
  /** Overlay content rendered above the image (scrims, glows, widgets). */
  children?: ReactNode;
};

/**
 * Reusable media slot. Renders a production-quality dark placeholder until a
 * real asset is dropped at `src` — never a stock image, never a broken frame.
 * Swap to `next/image` per-slot once real assets land (this keeps missing
 * files graceful during design).
 */
export function ImageSlot({
  src,
  position = 'center',
  monogram,
  icon: Icon = ImageIcon,
  label,
  placeholder = 'auto',
  imageClassName = '',
  className = '',
  style,
  children,
}: ImageSlotProps) {
  // Only supply `relative` when the caller hasn't set its own positioning
  // (e.g. the hero passes `absolute inset-0`); otherwise the two position
  // utilities collide and the slot collapses to zero height.
  const hasPosition = /(?:^|\s)(absolute|fixed|sticky|relative)(?:\s|$)/.test(
    className,
  );
  return (
    <div
      className={`${hasPosition ? '' : 'relative'} overflow-hidden bg-gradient-to-br from-kp-surface to-kp-ink ${className}`}
      style={style}
    >
      {src ? (
        <div
          className={`absolute inset-0 bg-cover ${imageClassName}`}
          style={{ backgroundImage: `url('${src}')`, backgroundPosition: position }}
          role="img"
          aria-label={label}
        />
      ) : placeholder === 'auto' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-kp-low">
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                'radial-gradient(circle at 30% 22%, rgba(225,29,42,0.28), transparent 55%)',
            }}
          />
          {monogram ? (
            <span className="font-display text-4xl font-bold text-kp-hi/80">
              {monogram}
            </span>
          ) : (
            <Icon className="h-7 w-7" strokeWidth={1.5} />
          )}
          {label && (
            <span className="kp-eyebrow text-[0.65rem] text-kp-low">{label}</span>
          )}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Circular avatar slot (testimonials, coach cards). */
export function AvatarSlot({
  src,
  monogram,
  size = 'h-11 w-11',
  className = '',
}: {
  src?: string;
  monogram?: string;
  size?: string;
  className?: string;
}) {
  return (
    <ImageSlot
      src={src}
      monogram={monogram}
      className={`${size} shrink-0 rounded-full border border-kp-line ${className}`}
    />
  );
}
