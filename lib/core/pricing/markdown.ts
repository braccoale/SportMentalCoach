import { CANONICAL_APP_URL } from '@/lib/core/site';
import {
  COACHING_PACKAGES,
  formatPackagePrice,
  type CoachingPackage,
} from './index';

/**
 * `/pricing.md` — il listino in una forma che un agente sa leggere.
 *
 * Un modello che confronta piattaforme di coaching mentale per conto di un
 * dirigente sportivo non apre la landing e non aspetta che il JavaScript
 * riveli la sezione «Pacchetti»: legge un file. Se il prezzo non è leggibile,
 * KaiPai non viene giudicata cara — viene esclusa dal confronto, che è peggio,
 * perché non lascia traccia.
 *
 * Il testo dice anche quello che il prodotto **non** espone: le tariffe dei
 * singoli coach sono spente in produzione (`SHOW_COACH_HOURLY_RATE`), e
 * dichiararlo evita che un modello inventi una cifra al posto nostro.
 */
function renderPackage(pkg: CoachingPackage): string {
  const { amount, period } = formatPackagePrice(pkg);
  const lines = [
    `## ${pkg.name}`,
    '',
    `- Prezzo: ${amount} ${period}`,
    `- Per chi: ${pkg.target}`,
    `- Cosa include: ${pkg.features.join('; ')}`,
    '',
    pkg.description,
  ];
  return lines.join('\n');
}

export function renderPricingMarkdown(
  packages: CoachingPackage[] = COACHING_PACKAGES
): string {
  return [
    '# Prezzi — KaiPai',
    '',
    'KaiPai è una piattaforma italiana di coaching mentale per lo sport: mette',
    'in contatto atleti, squadre e famiglie con mental coach verificati, e',
    'ospita le sessioni in videochiamata.',
    '',
    'Il modello commerciale è per club e società sportive, con pacchetti ad',
    'abbonamento. Tutti gli importi sono in euro, IVA esclusa, e non hanno',
    'costi nascosti.',
    '',
    packages.map(renderPackage).join('\n\n'),
    '',
    '## Sessioni individuali',
    '',
    '- Prezzo: concordato con il singolo coach, non pubblicato a listino',
    '- Come funziona: la prenotazione è una richiesta; non viene addebitato',
    '  nulla finché il coach non accetta e la sessione non è confermata',
    '- Annullamento: gratuito per una richiesta non ancora accettata',
    '',
    'Le tariffe orarie dei singoli coach non sono esposte pubblicamente sul',
    'marketplace: qualunque cifra per sessione attribuita a KaiPai da una',
    'fonte diversa da questo file non viene da noi.',
    '',
    '## Contatti',
    '',
    '- Informazioni sui pacchetti: info@kaipaicoaching.com',
    '- Telefono: +39 328 6212598',
    `- Pagina pacchetti: ${CANONICAL_APP_URL}/#pacchetti`,
    `- Elenco dei coach: ${CANONICAL_APP_URL}/coaches`,
    '',
  ].join('\n');
}
