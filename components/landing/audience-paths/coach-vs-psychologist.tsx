import type { ReactNode } from 'react';
import Image from 'next/image';
import { Brain, Check, CircleAlert } from 'lucide-react';

/**
 * «Mental coach o psicologo dello sport?» — la domanda che quasi ogni atleta e
 * ogni genitore si fa prima di iniziare, e una delle più cercate sul tema.
 *
 * Il testo dice quello che KaiPai è e non è: coaching non clinico. Il limite è
 * lo stesso delle FAQ («non è una terapia») e non va spostato qui senza
 * spostarlo anche là.
 *
 * Usa i token `kp-*`, quindi segue l'alternanza chiaro/scuro di `.kp-alt`: la
 * foto e i bagliori compaiono solo quando la sezione cade su fondo scuro (su
 * /famiglie cade su fondo chiaro, e lì la foto scura sarebbe una macchia).
 */
const COLUMNS: { t: string; icon: ReactNode; points: ReactNode[] }[] = [
  {
    t: 'Il mental coach',
    icon: <Brain className="h-7 w-7" aria-hidden />,
    points: [
      <>
        <strong>Allena abilità mentali legate alla prestazione</strong>:
        concentrazione, gestione della pressione, motivazione, routine.
      </>,
      <>
        <strong>Lavora con chi sta bene</strong> e <strong>vuole rendere meglio</strong>,
        in gara e in allenamento.
      </>,
      <>
        <strong>Si concentra sul presente e sugli obiettivi sportivi.</strong>
      </>,
    ],
  },
  {
    t: 'Lo psicologo dello sport',
    icon: (
      <span className="font-display text-3xl leading-none" aria-hidden>
        Ψ
      </span>
    ),
    points: [
      <>
        È uno <strong>psicologo iscritto all’Albo</strong>, con una formazione
        specifica in ambito sportivo.
      </>,
      <>
        <strong>Può valutare</strong> e, se è anche psicoterapeuta, curare
        disagi e disturbi.
      </>,
      <>
        È la <strong>figura giusta</strong> quando la difficoltà va oltre il campo.
      </>,
    ],
  },
];

const CARD =
  'kp-cvp-card relative rounded-3xl border border-kp-line bg-kp-surface/70 p-6 backdrop-blur-sm sm:p-8';

export function CoachVsPsychologist() {
  return (
    <section className="kp-cvp relative isolate overflow-hidden py-16 sm:py-20">
      <div
        aria-hidden
        className="kp-cvp-photo pointer-events-none absolute right-0 top-0 -z-10 hidden aspect-[712/400] w-[60%] md:block"
      >
        <Image
          src="/landing/audience/coach-vs-psicologo.webp"
          alt=""
          fill
          sizes="60vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-kp-ink via-kp-ink/20 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-kp-ink via-transparent to-transparent" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
        <p className="kp-eyebrow flex items-center gap-3 text-kp-red">
          <span className="h-px w-10 bg-kp-red" aria-hidden />
          Prima di iniziare
        </p>
        <h2 className="kp-display mt-4 max-w-4xl text-[clamp(2rem,4.8vw,4rem)] leading-[1.02] text-kp-hi">
          Mental coach o <br className="hidden md:block" />
          <span className="text-kp-red">psicologo</span> dello sport?
        </h2>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kp-mid">
          Sono due figure diverse, e spesso complementari. Su{' '}
          <span className="text-kp-hi">KaiPai</span> lavorano mental coach
          sportivi: il loro è un percorso di allenamento mentale, non una terapia.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {COLUMNS.map((c) => (
            <div key={c.t} className={CARD}>
              <div className="flex items-center gap-5">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-kp-red/15 text-kp-red ring-1 ring-kp-red/30">
                  {c.icon}
                </span>
                <h3 className="font-display text-2xl font-semibold text-kp-hi sm:text-3xl">
                  {c.t}
                </h3>
              </div>
              <ul className="mt-7 space-y-5">
                {c.points.map((point, i) => (
                  <li
                    key={i}
                    className="flex gap-4 leading-relaxed text-kp-mid [&_strong]:font-semibold [&_strong]:text-kp-hi"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-kp-red text-white">
                      <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className={`${CARD} mt-5 flex items-center gap-6 !py-5`}>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-kp-red/15 text-kp-red ring-1 ring-kp-red/30">
            <CircleAlert className="h-7 w-7" aria-hidden />
          </span>
          <span className="hidden h-12 w-px shrink-0 bg-kp-red/60 sm:block" aria-hidden />
          <p className="text-sm leading-relaxed text-kp-mid sm:text-base [&_strong]:font-semibold [&_strong]:text-kp-hi">
            Se durante il percorso emerge un bisogno di natura clinica — ansia che
            pesa anche fuori dal campo, umore, alimentazione —{' '}
            <strong>il coach lo dice chiaramente</strong> e indirizza verso un
            professionista sanitario.
          </p>
        </div>
      </div>
    </section>
  );
}
