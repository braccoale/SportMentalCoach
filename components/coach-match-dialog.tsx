'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CoachMatchWizard } from '@/components/coach-match-wizard';

type Props = React.ComponentProps<typeof CoachMatchWizard>;

/**
 * «Aiutami a scegliere» in una finestra sopra l'elenco dei coach: l'atleta non
 * cambia pagina e, chiudendo, ritrova i filtri dov'erano. Su telefono la
 * finestra occupa tutto lo schermo. Chiusa la finestra il wizard riparte da
 * capo: le risposte non si conservano.
 */
export function CoachMatchDialog(props: Omit<Props, 'embedded' | 'onClose'>) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="lg"
          className="h-12 shrink-0 rounded-full px-8 text-base max-sm:w-full [&_svg]:size-5"
        >
          <Sparkles />
          Aiutami a scegliere
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl p-5 max-sm:left-0 max-sm:top-0 max-sm:h-full max-sm:max-h-none max-sm:w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:p-6">
        <DialogTitle className="sr-only">Aiutami a scegliere il coach</DialogTitle>
        <CoachMatchWizard {...props} embedded onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
