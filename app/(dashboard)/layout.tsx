import { Footer } from '@/components/footer';
import { IncomingCallListener } from '@/components/incoming-call-listener';
import { DashboardHeader } from '@/components/dashboard-header';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col min-h-screen">
      <DashboardHeader />
      {children}
      <Footer />
      <IncomingCallListener />
    </section>
  );
}
