# Landing v2 — «Una sessione, dal prima al dopo»

Data: 2026-08-18
Rotta: `/v2` (noindex, non promossa in produzione)
Pubblico: il **mental coach**

## Perché

La home attuale racconta il metodo all'atleta. Questa versione racconta al coach
il percorso di una sua sessione, dal momento in cui finisce a quello in cui
ricomincia la settimana dopo. È una pagina sperimentale: vive accanto alla home,
non al posto suo, finché non c'è una decisione.

## Il telaio

Una sola sessione seguita nel tempo. Il fondo passa dal buio alla luce
**ancorato al progresso del percorso**, non allo scroll assoluto: tornando
indietro, torna buio. Il buio è il prima (gli appunti da scrivere), la luce è il
dopo (il percorso che si è scritto da solo).

## Le scene

1. **Hero — «21:40. La sessione è finita venti minuti fa.»** (ink `#050507`)
   Foto full-bleed, coach in penombra. Titolo per parole con mask al load.
   Pin + scrub: la foto scala 1.12→1 e si desatura, il titolo esce, entra il
   primo biglietto in vetro (`FROM: appunti da scrivere` → `TO: un percorso che
   si scrive da solo`).

2. **La convergenza** (ink)
   Otto strumenti sparsi (calendario, Meet, WhatsApp, note, ChatGPT, email,
   fogli, promemoria) su orbite lente. Scorrendo collassano lungo tracciati SVG
   disegnati in scrub dentro il monogramma KaiPai, che si accende in rosso.

3. **Il percorso — sei tappe, binario orizzontale pinnato** (ink → `#e8e6e1`)
   Lo scroll verticale muove orizzontalmente sei biglietti in vetro, con la
   fotografia dietro in parallasse più lenta. Il fondo interpola lungo
   l'avanzamento del binario: la luce arriva mentre il percorso avanza.

   1. Prepari la seduta — calendario e disponibilità tue, prenotazione diretta
   2. Entri in sessione — videochiamata integrata, un link solo
   3. Segni i momenti — bookmark e nota vocale a caldo, dentro la call
   4. KaiPai ascolta — con il consenso di entrambi: trascrizione, poi il report
   5. Leggi il compass — temi, momenti chiave, metriche, impegni concordati
   6. La prossima riparte da qui — preparazione della seduta e percorso mentale

4. **Il Session Compass** (crema `#f6f5f2`)
   Pin + scrub: il report si costruisce pezzo per pezzo. Sintesi, poi le sei
   metriche 1–5 con i colori veri di `METRIC_META`, poi il trend emotivo che si
   disegna, poi gli impegni che si spuntano.

5. **La continuità** (crema)
   Il percorso mentale su quattro sedute. Va dopo il compass perché ha senso
   solo dopo averlo visto.

6. **CTA finale** (crema + lama di rosso)
   Un ultimo biglietto: «Il tuo prossimo lunedì sera». CTA verso `/sign-up`.

## File

```
app/(marketing)/v2/page.tsx
app/(marketing)/v2/layout.tsx          (font + noscript fallback)
components/landing/v2/
  smooth-scroll.tsx   Lenis agganciato a ScrollTrigger.update
  nav.tsx             logo + CTA, colore invertito in luce
  glass-ticket.tsx    il biglietto in vetro, riusato ovunque
  scene-hero.tsx  scene-converge.tsx  scene-journey.tsx
  scene-compass.tsx  scene-continuity.tsx  scene-cta.tsx
  demo-compass.ts     dati demo + demo-compass.test.ts
```

Cartella isolata: nessun componente della home in produzione viene modificato.

## Vincoli

- **Dati demo validati.** I dati del compass sulla landing passano per
  `validateSessionCompassReport`: un test lo verifica, così la pagina non può
  mostrare un report che il prodotto non produrrebbe.
- **Nessuna statistica inventata.** O numeri veri da `getLandingStats()`, o
  frasi qualitative.
- **Reduced motion e no-JS.** Fallback CSS completo: tutto il contenuto
  leggibile e statico, il binario diventa una lista verticale.
- **Mobile.** `gsap.matchMedia()`: corse più corte, il binario orizzontale
  diventa uno stack verticale animato.
- **Un solo ScrollTrigger con scrub per scena.** Quattro pin su una pagina si
  pagano in scorrevolezza.
- **Nessun tocco al database, a Stripe, alla produzione.**

## Verifica

- `npx tsc --noEmit` e `npm test` (con il nuovo `demo-compass.test.ts`).
- Pagina aperta in locale e guardata: desktop, mobile, reduced-motion, no-JS.
- Il livello raggiunto va dichiarato: nessuna affermazione su comportamenti non
  osservati.
