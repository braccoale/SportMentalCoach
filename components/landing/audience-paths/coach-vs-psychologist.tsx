/**
 * «Mental coach o psicologo dello sport?» — la domanda che quasi ogni atleta e
 * ogni genitore si fa prima di iniziare, e una delle più cercate sul tema.
 *
 * Il testo dice quello che KaiPai è e non è: coaching non clinico. Il limite è
 * lo stesso delle FAQ («non è una terapia») e non va spostato qui senza
 * spostarlo anche là.
 */
const COLUMNS = [
  {
    t: 'Il mental coach',
    points: [
      'Allena abilità mentali legate alla prestazione: concentrazione, gestione della pressione, motivazione, routine.',
      'Lavora con chi sta bene e vuole rendere meglio, in gara e in allenamento.',
      'Si concentra sul presente e sugli obiettivi sportivi.',
    ],
  },
  {
    t: 'Lo psicologo dello sport',
    points: [
      'È uno psicologo iscritto all’Albo, con una formazione specifica in ambito sportivo.',
      'Può valutare e, se è anche psicoterapeuta, curare disagi e disturbi.',
      'È la figura giusta quando la difficoltà va oltre il campo.',
    ],
  },
];

export function CoachVsPsychologist() {
  return (
    <section className="border-t border-kp-line py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <p className="kp-eyebrow text-kp-red">Prima di iniziare</p>
        <h2 className="kp-display mt-4 max-w-3xl text-[clamp(1.75rem,4vw,3rem)] text-kp-hi">
          Mental coach o psicologo dello sport?
        </h2>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kp-mid">
          Sono due figure diverse, e spesso complementari. Su KaiPai lavorano
          mental coach sportivi: il loro è un percorso di allenamento mentale,
          non una terapia.
        </p>
        <div className="mt-12 grid gap-px overflow-hidden rounded-3xl bg-kp-line md:grid-cols-2">
          {COLUMNS.map((c) => (
            <div key={c.t} className="bg-kp-ink p-8">
              <h3 className="font-display text-xl font-semibold text-kp-hi">{c.t}</h3>
              <ul className="mt-5 space-y-3">
                {c.points.map((point) => (
                  <li key={point} className="flex gap-3 leading-relaxed text-kp-mid">
                    <span className="mt-2.5 h-1 w-3 shrink-0 bg-kp-red" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-kp-mid">
          Se durante il percorso emerge un bisogno di natura clinica — ansia che
          pesa anche fuori dal campo, umore, alimentazione — il coach lo dice
          chiaramente e indirizza verso un professionista sanitario.
        </p>
      </div>
    </section>
  );
}
