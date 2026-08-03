import Link from 'next/link';
import { Footer } from '@/components/footer';
import { MarketplaceAuthNav } from '@/components/marketplace-auth-nav';
import { getVerticalConfig, t } from '@/lib/core/config';

export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = getVerticalConfig();

  return (
    <section className="flex min-h-screen flex-col bg-gray-200 text-gray-700">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.jpg" alt="KaiPai" width={127} height={141} className="h-12 w-auto rounded-lg" />
            <span className="text-2xl font-bold tracking-tight text-gray-900">
              {t('brand.name', config)}
            </span>
          </Link>
          <nav className="flex items-center space-x-4">
            <MarketplaceAuthNav />
          </nav>
        </div>
      </header>
      {children}
      <Footer />
    </section>
  );
}
