/**
 * Kai Pai coach badge, rebuilt in HTML/CSS from the merch photo (the photo's
 * background could not be keyed out — the card pixels match the backdrop).
 * Dark card, white lettering, personalised with the coach's name.
 */
export function CoachBadge({
  name,
  className = '',
}: {
  /** Coach display name printed on the badge. */
  name?: string | null;
  className?: string;
}) {
  return (
    <div className={className} aria-hidden>
      <div className="flex -rotate-6 flex-col items-center">
        {/* clip + short lanyard */}
        <div className="h-3.5 w-1 rounded-full bg-gray-500" />
        <div className="-mt-0.5 h-2 w-6 rounded-sm bg-gray-600 shadow-sm" />
        {/* card — black like the merch, white lettering */}
        <div className="-mt-0.5 w-[6.5rem] overflow-hidden rounded-lg border border-white/15 bg-gray-950 shadow-xl ring-1 ring-black/30">
          <div className="flex flex-col items-center px-2.5 pb-0 pt-2.5">
            <img
              src="/logo.jpg"
              alt=""
              className="h-8 w-8 rounded-md object-cover"
            />
            <p className="mt-1 text-[0.55rem] font-semibold tracking-[0.2em] text-white">
              KAI PAI
            </p>
            {name && (
              <p className="mt-1 max-w-full truncate text-[0.6rem] font-semibold text-white">
                {name}
              </p>
            )}
          </div>
          <div className="mt-1.5 bg-red-600 py-1 text-center">
            <p className="text-[0.5rem] font-bold uppercase tracking-[0.28em] text-white">
              Coach
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
