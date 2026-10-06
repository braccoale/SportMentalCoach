/**
 * Il calendario con le spunte della scheda abbonamento. Decorativo: nascosto
 * agli screen reader e alle schermate strette, dove la scheda deve restare
 * leggibile e non perdere spazio.
 */
export function SubscriptionIllustration({ className }: { className?: string }) {
  const days = Array.from({ length: 12 }, (_, index) => index);
  const checked = new Set([2, 4]);

  return (
    <svg
      aria-hidden
      viewBox="0 0 220 200"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Scintille attorno al calendario */}
      <g stroke="#34d399" strokeWidth="5" strokeLinecap="round">
        <path d="M18 70 L34 78" />
        <path d="M30 130 L44 124" opacity="0.7" />
        <path d="M196 34 L190 48" opacity="0.8" />
        <path d="M168 24 L176 36" />
        <path d="M204 76 L190 76" opacity="0.7" />
        <path d="M44 168 L52 180" opacity="0.9" />
      </g>

      <g transform="rotate(-7 110 100)">
        {/* Ombra */}
        <rect x="46" y="44" width="136" height="128" rx="18" fill="#10b981" opacity="0.15" />
        {/* Corpo */}
        <rect x="40" y="36" width="136" height="128" rx="18" fill="#ffffff" stroke="#e5e7eb" />
        {/* Testata verde */}
        <path d="M40 54 a18 18 0 0 1 18 -18 h100 a18 18 0 0 1 18 18 v14 H40 Z" fill="#16a34a" />
        {/* Anelli */}
        <rect x="68" y="26" width="9" height="22" rx="4.5" fill="#ffffff" stroke="#d1d5db" />
        <rect x="139" y="26" width="9" height="22" rx="4.5" fill="#ffffff" stroke="#d1d5db" />

        {/* Giorni */}
        {days.map((index) => {
          const column = index % 4;
          const row = Math.floor(index / 4);
          const x = 54 + column * 31;
          const y = 82 + row * 27;
          const isChecked = checked.has(index);
          return (
            <g key={index}>
              <rect
                x={x}
                y={y}
                width="24"
                height="21"
                rx="6"
                fill={isChecked ? '#16a34a' : '#eef2f7'}
              />
              {isChecked && (
                <path
                  d={`M${x + 6} ${y + 11} l4.5 4.5 l8 -9`}
                  stroke="#ffffff"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
