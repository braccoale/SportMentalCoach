/**
 * Dashboard shell. The old template sidebar (role links / Dashboard /
 * Attività / Sicurezza) was removed: navigation lives in each area's tabs
 * (coach and athlete), while account settings live in the global user menu.
 * Content runs full width.
 */
export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto min-h-[calc(100dvh-68px)] w-full max-w-7xl">
      <main className="p-0 lg:p-4">{children}</main>
    </div>
  );
}
