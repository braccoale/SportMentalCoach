/**
 * Il modello commerciale di KaiPai, in un posto solo.
 *
 * Viveva dentro la landing, come array inline nel JSX della sezione
 * «Pacchetti». Adesso serve a due lettori diversi — quella sezione e
 * `/pricing.md`, il file che gli agenti AI leggono quando confrontano
 * piattaforme di coaching mentale — e due copie dello stesso listino sono la
 * forma più silenziosa di prezzo sbagliato: si aggiorna la pagina, il file
 * resta indietro, e un modello risponde con la cifra dell'anno scorso.
 *
 * L'ordine dell'array è l'ordine in cui i pacchetti vanno mostrati.
 */
export type CoachingPackage = {
  /** Chiave stabile: la landing la usa per scegliere l'icona. */
  key: 'starter' | 'academy' | 'elite';
  name: string;
  /** In centesimi, come ovunque nel prodotto (vedi `formatPrice`). */
  priceCents: number;
  period: 'month' | 'year';
  /** A chi si rivolge il pacchetto. */
  target: string;
  description: string;
  features: string[];
  /** Il pacchetto messo in evidenza come «Più scelto». */
  highlighted: boolean;
};

export const COACHING_PACKAGES: CoachingPackage[] = [
  {
    key: 'starter',
    name: 'Starter & Crisis Prevention',
    priceCents: 150_000,
    period: 'month',
    target: 'Club Serie B, Serie C o realtà locali e dilettantistiche',
    description:
      "L'ingresso strutturato al mental coaching: basi solide e prevenzione, per iniziare nel modo giusto.",
    features: ['20 sessioni individuali / mese', '1 workshop introduttivo'],
    highlighted: false,
  },
  {
    key: 'academy',
    name: 'Triangolo Formativo & Youth Academy',
    priceCents: 350_000,
    period: 'month',
    target: 'Club con settori giovanili Under 15 – Under 19',
    description:
      'Il percorso completo che fa crescere insieme atleti, staff e famiglie del vivaio.',
    features: ['Presenza settimanale fissa', 'Workshop per staff e genitori'],
    highlighted: true,
  },
  {
    key: 'elite',
    name: 'Performance Lab & Elite System',
    priceCents: 7_500_000,
    period: 'year',
    target: "Club Serie A o Academy d'élite",
    description:
      "Il sistema d'élite: mental performance integrata al più alto livello competitivo.",
    features: ['Presenza full-time o team dedicato'],
    highlighted: false,
  },
];

const PERIOD_LABEL: Record<CoachingPackage['period'], string> = {
  month: '/ mese',
  year: '/ anno',
};

/**
 * Il separatore delle migliaia, scritto a mano invece che chiesto a `Intl`.
 *
 * Non è pignoleria: la suite su GitHub Actions ha reso «1500 €» dove in
 * locale usciva «1.500 €». `Intl.NumberFormat` dipende dai dati ICU compilati
 * dentro il runtime, e un runtime con ICU ridotta non conosce il formato
 * italiano — quindi la cifra sarebbe cambiata a seconda di dove gira la
 * build, senza che nessun errore lo segnalasse.
 *
 * Sul prezzo che finisce sulla landing e dentro `/pricing.md` non è
 * accettabile: un listino pubblico deve leggersi identico ovunque. Il resto
 * del prodotto continua a usare `formatPrice`, dove la cifra è un dato di
 * interfaccia e non un'affermazione commerciale.
 */
function formatEuroAmount(cents: number): string {
  const euros = Math.trunc(cents / 100);
  const decimals = cents % 100;
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const value =
    decimals === 0
      ? grouped
      : `${grouped},${String(decimals).padStart(2, '0')}`;
  // Spazio normale, non unificatore: e' il carattere che la landing aveva
  // nelle sue stringhe fisse, e questo listino non deve cambiare come si
  // legge la cifra, solo da dove viene.
  return `${value} €`;
}

/** Importo e periodo separati, perché la landing li rende in due `span`. */
export function formatPackagePrice(pkg: CoachingPackage): {
  amount: string;
  period: string;
} {
  return {
    amount: formatEuroAmount(pkg.priceCents),
    period: PERIOD_LABEL[pkg.period],
  };
}
