import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[100dvh]">
      <div className="max-w-md space-y-8 p-4 text-center">
        <div className="flex justify-center">
          <img
            src="/logo.jpg"
            alt="Kai Pai"
            width={127}
            height={141}
            className="h-14 w-auto rounded-xl"
          />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
          Pagina non trovata
        </h1>
        <p className="text-base text-gray-500">
          
          La pagina che cerchi non esiste o è stata spostata.
        </p>
        <Link
          href="/"
          className="max-w-48 mx-auto flex justify-center py-2 px-4 border border-gray-300 rounded-full shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          Torna alla home
        </Link>
      </div>
    </div>
  );
}
