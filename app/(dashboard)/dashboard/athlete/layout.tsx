import { AthleteNav } from './athlete-nav';

export default function AthleteAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <AthleteNav />
      {children}
    </div>
  );
}
