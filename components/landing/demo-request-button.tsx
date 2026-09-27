'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ContactModal } from './contact-modal';

/**
 * «Richiedi una demo» per le pagine server: apre il modulo contatti già in uso
 * sulla landing (POST su /api/contact), senza un secondo canale.
 */
export function DemoRequestButton({
  label = 'Richiedi una demo',
  className = '',
}: {
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-green-600 px-6 py-3.5 font-semibold text-white transition-colors hover:bg-green-700 ${className}`}
      >
        {label}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </button>
      <ContactModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
