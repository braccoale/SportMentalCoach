import Image from 'next/image';
import Link from 'next/link';
import {
  CalendarCheck,
  Download,
  ShieldAlert,
} from 'lucide-react';
import { CoachAvatar } from '@/components/coach-visuals';
import { SportIcon } from '@/components/sport-icon';
import { formatDate, formatDateTime } from '@/lib/core/format';

/**
 * L'intestazione della scheda atleta: chi è questa persona, e da quanto
 * lavorate insieme.
 *
 * La montagna arriva dalla Mental Journey, dove faceva da copertina a una
 * pagina intera. Qui è una fascia, non una copertina: la scheda comincia
 * subito sotto e non deve farsi scorrere via prima di arrivare al percorso.
 * L'immagine resta perché una scheda che parla di un percorso mentale non è un
 * pannello di controllo, e due secondi di respiro in cima lo dicono meglio di
 * qualunque etichetta.
 *
 * L'età, non la data di nascita: è la stessa scelta già presa in
 * `getCoachBookings`, dove il compleanno non esce mai dal database. Al coach
 * serve sapere che ha davanti un minorenne, non quando compie gli anni.
 */

/**
 * I riquadri dei numeri.
 *
 * Traslucidi di proposito, come nella Mental Journey da cui vengono: la
 * montagna passa attraverso invece di fermarsi dietro, e il `backdrop-blur`
 * tiene le cifre leggibili sopra qualunque parte dell'immagine finisca sotto.
 */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[7.5rem] rounded-xl bg-white/65 px-3.5 py-2 shadow-sm ring-1 ring-white/70 backdrop-blur-md">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-600">
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-bold leading-none tracking-tight text-gray-950">
        {value}
      </p>
    </div>
  );
}

export function AthleteHeader({
  name,
  avatarUrl,
  age,
  sportKey,
  sportLabel,
  levelLabel,
  isMinor,
  nextSessionAt,
  completedSessions,
  commitmentsTotal,
  since,
  exportHref = null,
}: {
  name: string;
  avatarUrl: string | null;
  age: number | null;
  /** La chiave dello sport: decide l'icona sul ritratto. */
  sportKey: string | null;
  sportLabel: string | null;
  levelLabel: string | null;
  isMinor: boolean;
  nextSessionAt: Date | null;
  /** Sedute davvero svolte: la misura più onesta di quanto dura il percorso. */
  completedSessions: number;
  /** Impegni concordati nel percorso, in qualunque stato. */
  commitmentsTotal: number;
  /** La prima seduta insieme, quando c'è. */
  since: Date | null;
  /** Scarica il percorso in PDF. Assente se non c'è un percorso. */
  exportHref?: string | null;
  /** Dove porta la voce «Percorso mentale» del menu. */
}) {
  const identity = [
    age !== null ? `${age} ${age === 1 ? 'anno' : 'anni'}` : null,
    sportLabel,
    levelLabel,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <header className="relative isolate overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200/70">
      <div className="absolute inset-0 -z-10">
        <Image
          src="/decor/journey.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 1100px, 100vw"
          // Altezza e inquadratura vanno insieme, e non sono una preferenza.
          // `object-cover` su una fascia larga 1450 e alta 240 mostra circa un
          // quarto dell'altezza dell'immagine: la figura ne occupa quasi meta',
          // quindi sotto i 240px non ci sta intera per nessun valore di
          // `object-position` — o perde la testa o perde i piedi. Provate sei
          // combinazioni: 240px al 55% e' la prima che la tiene tutta con un
          // margine. Chi cambia l'altezza deve rifare la prova.
          className="object-cover object-[62%_55%] contrast-125 saturate-125"
        />
        {/* Il velo copre la colonna sinistra, dove sta il testo, e si dissolve
            prima di metà: la montagna deve vedersi, non fare da texture sotto
            una fascia bianca. A destra non si richiude — i riquadri dei numeri
            hanno già il loro fondo traslucido e non hanno bisogno che l'intera
            immagine si schiarisca per loro. */}
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/70 to-transparent sm:via-white/45" />
      </div>

      <div className="flex min-h-[15rem] flex-wrap items-center gap-x-5 gap-y-4 p-6">
        <div className="relative shrink-0">
          <CoachAvatar
            name={name}
            src={avatarUrl}
            className="size-16 ring-2 ring-white/70"
          />
          {/* Lo sport sul ritratto, non nella riga di testo: in un elenco di
              venti atleti il pallone si riconosce prima della parola. */}
          <span
            className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-white text-gray-800 shadow ring-1 ring-gray-200"
          >
            <SportIcon
              sportKey={sportKey}
              label={sportLabel}
              className="h-4 w-4"
            />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-gray-950">
            {name}
          </h1>
          {identity && (
            <p className="mt-0.5 text-sm text-gray-600">{identity}</p>
          )}

          {since && (
            <p className="mt-1 text-sm text-gray-600">
              <span className="text-gray-400">Insieme dal</span>{' '}
              <span className="font-semibold text-gray-950">
                {formatDate(since)}
              </span>
            </p>
          )}

          {nextSessionAt && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-gray-600">
              <CalendarCheck className="h-4 w-4 text-green-700" aria-hidden="true" />
              <span className="text-gray-400">Prossimo appuntamento</span>{' '}
              <span className="font-semibold text-green-800">
                {formatDateTime(nextSessionAt)}
              </span>
            </p>
          )}

          {/* Su una riga propria: la frase è lunga e, incastrata accanto al
              nome, mandava a capo «19 anni · Calcio» staccando il nome
              dall'età. Non è un'etichetta anagrafica, è un vincolo operativo. */}
          {isMinor && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50/90 px-2.5 py-1 text-xs font-medium text-amber-800 backdrop-blur-sm">
              <ShieldAlert className="h-3.5 w-3.5" />
              Minorenne — autorizzazione del tutore richiesta
            </span>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <Stat label="Sedute svolte" value={completedSessions} />
          <Stat label="Impegni concordati" value={commitmentsTotal} />

          {exportHref && (
            <a
              href={exportHref}
              download
              title="Scarica il percorso in PDF"
              aria-label="Scarica il percorso in PDF"
              className="inline-flex size-10 items-center justify-center rounded-full bg-white/60 text-gray-600 ring-1 ring-white/70 backdrop-blur-md transition hover:bg-white hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </a>
          )}

          {/* Qui c'era un menu con una voce sola, «Percorso mentale completo»,
              che puntava a una pagina ora assorbita in questa. Diventata
              un'ancora, era la terza strada per lo stesso posto — dopo «Vedi
              tutte le sessioni» sotto la striscia e il blocco «Tutte le sedute»
              in fondo. Un menu che si apre per offrire una scorciatoia a
              qualcosa che si vede gia' scorrendo non e' una scorciatoia. */}
        </div>
      </div>
    </header>
  );
}
