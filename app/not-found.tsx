import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function NotFound() {
  const t = useTranslations('NotFound');

  return (
    <div className="flex items-center justify-center min-h-[100dvh]">
      <div className="max-w-md space-y-8 p-4 text-center">
        <div className="flex justify-center">
          <img
            src="/logo.jpg"
            alt="KaiPai"
            width={127}
            height={141}
            className="h-14 w-auto rounded-xl"
          />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
          {t('title')}
        </h1>
        <p className="text-base text-gray-500">
          {t('description')}
        </p>
        <Link
          href="/"
          className="max-w-48 mx-auto flex justify-center py-2 px-4 border border-gray-300 rounded-full shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          {t('backHome')}
        </Link>
      </div>
    </div>
  );
}
