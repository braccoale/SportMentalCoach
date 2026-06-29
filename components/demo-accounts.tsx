const ACCOUNTS = [
  { role: 'Admin', email: 'admin@kaipai.com', password: 'admin1234' },
  {
    role: 'Coach (approvato)',
    email: 'marco.rossi@demo.smc',
    password: 'demo1234',
  },
  {
    role: 'Coach (in revisione)',
    email: 'sara.neri@demo.smc',
    password: 'demo1234',
  },
];

/**
 * Demo credentials box — rendered only outside production so it never ships to
 * real users. Athlete / coach / club accounts can also be created from /sign-up.
 */
export function DemoAccounts() {
  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-5">
      <p className="text-sm font-semibold text-amber-900">
        Account demo (solo sviluppo)
      </p>
      <p className="mt-1 text-xs text-amber-700">
        Disponibili dopo <code>pnpm db:seed</code>. Registra atleti/coach/club da{' '}
        <a href="/sign-up" className="underline">
          /sign-up
        </a>
        .
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {ACCOUNTS.map((a) => (
          <li
            key={a.email}
            className="rounded-lg border border-amber-200 bg-white p-3 text-xs"
          >
            <p className="font-medium text-gray-900">{a.role}</p>
            <p className="mt-1 text-gray-600">{a.email}</p>
            <p className="text-gray-500">password: {a.password}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
