import Link from 'next/link';
import { CircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/footer';
import { getVerticalConfig, t } from '@/lib/core/config';

export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = getVerticalConfig();

  return (
    <section className="flex flex-col min-h-screen">
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center">
            <CircleIcon className="h-6 w-6 text-orange-500" />
            <span className="ml-2 text-xl font-semibold text-gray-900">
              {t('brand.name', config)}
            </span>
          </Link>
          <nav className="flex items-center space-x-4">
            <Link
              href="/coaches"
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              {t('role.provider.plural', config)}
            </Link>
            <Button asChild className="rounded-full">
              <Link href="/sign-in">Accedi</Link>
            </Button>
          </nav>
        </div>
      </header>
      {children}
      <Footer />
    </section>
  );
}
