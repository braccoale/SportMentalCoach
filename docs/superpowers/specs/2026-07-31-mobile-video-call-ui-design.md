# Interfaccia mobile della videochiamata — design

Data: 2026-07-31
Stato: approvato, pronto per il piano di implementazione

## Problema

Il pre-join della videochiamata (`KaiPaiPreJoin`) è pensato per il desktop: una
griglia `lg:grid-cols-[1.35fr_1fr]` che su schermo stretto collassa in una
colonna verticale molto lunga. L'ordine che ne risulta su un telefono è
anteprima camera → sfondi video → prova microfono → toggle e scelta microfono →
toggle e scelta camera → altoparlante e test → diagnostica rete → banner → e
solo in fondo il bottone "Entra nella videochiamata". Sono due o tre schermate
di scorrimento prima di raggiungere l'unica azione che l'utente vuole compiere.

Il problema prosegue dentro la chiamata: la stanza è `h-[70vh]` dentro il
contenitore della dashboard (`max-w-6xl p-6`, più link di ritorno e titolo), per
cui su un telefono il video occupa una frazione dello schermo.

Buona parte dei controlli del pre-join, inoltre, su mobile non ha alcun effetto:
la selezione dell'altoparlante non è supportata dai browser mobili, la scelta
del microfono è ridondante quando ne esiste uno solo, e i background processor
sono l'operazione più costosa in batteria e CPU su un telefono.

## Obiettivo

Su dispositivi compatti, l'utente deve poter entrare in videochiamata senza mai
scorrere, e atterrare in una stanza che occupa tutto lo schermo. L'esperienza
desktop non deve cambiare.

## Decisioni prese

| Domanda | Decisione |
|---|---|
| Comportamento mobile del pre-join | Pre-join compatto in una schermata, avanzate nascoste (non join diretto) |
| Ambito | Pre-join **e** stanza a schermo intero su mobile |
| Definizione di "mobile" | Schermo stretto **oppure** puntatore touch |
| Layout del pre-join | Anteprima a tutto schermo con controlli sovrapposti (linguaggio WhatsApp/FaceTime) |
| Sfondi virtuali su mobile | Disponibili nelle avanzate, con avviso sulla fluidità |
| Inversione fotocamera | Presente nella schermata principale, non nelle avanzate |

## Architettura

### Rilevazione

Due meccanismi distinti, deliberatamente non mescolati.

**`lib/hooks/use-is-compact.ts`** — decide *come disporre*.

```ts
const COMPACT_QUERY = '(max-width: 767px), (pointer: coarse)';
```

Implementato con `useSyncExternalStore` sottoscritto a `matchMedia`, così reagisce
a rotazione e ridimensionamento. Restituisce `boolean | null`, dove `null`
significa "non ancora determinato" (primo render lato server): in quel frame il
pre-join mostra uno scheletro neutro, evitando il salto visivo dal layout
desktop a quello mobile.

Nessuno sniffing dello user-agent per decidere il layout. `matchMedia` è l'unico
meccanismo che sopravvive alla rotazione del dispositivo a metà pre-join e che
non sbaglia su dispositivi non previsti da un elenco di UA.

**`lib/core/video/capabilities.ts`** — decide *cosa esiste*.

Risponde a domande non geometriche: il browser sa selezionare l'uscita audio?
regge i background processor? è iOS Safari? è disponibile il Picture-in-Picture?
Sono proprietà del browser, non dello schermo: un Mac con schermo piccolo regge
i processor, un tablet grande può non reggerli.

La separazione è intenzionale e va mantenuta: quando uscirà un dispositivo che
rompe l'assunzione "schermo piccolo = poche capacità", si aggiusta un file solo.

### Struttura dei file del pre-join

`KaiPaiPreJoin` occupa oggi circa 465 righe (righe 224–690) di un file da 1087.
Aggiungere un secondo layout completo lo renderebbe ingestibile. Si introduce
`components/prejoin/`:

| File | Responsabilità |
|---|---|
| `use-prejoin-state.ts` | Scelte utente, preview tracks, elenco dispositivi, test altoparlante, diagnostica rete. Nessun JSX. |
| `prejoin-compact.tsx` | Layout mobile. |
| `prejoin-desktop.tsx` | Layout attuale, spostato senza modifiche funzionali. |
| `advanced-settings-sheet.tsx` | Pannello avanzate, condiviso fra i due layout. |

`KaiPaiPreJoin` resta esportato da `components/livekit-call-controls.tsx` come
componente sottile che sceglie fra i due layout in base a `useIsCompact()`. I
consumatori — `app/(dashboard)/dashboard/video/[bookingId]/video-room.tsx` e
`components/guest-video-room.tsx` — non cambiano.

Il pre-join è condiviso con il flusso ospite (ingresso da link condiviso), che è
il caso d'uso mobile più probabile: il lavoro lo migliora senza modifiche
aggiuntive.

## Pre-join compatto

Contenitore `fixed inset-0 z-50`, anteprima camera a tutto schermo con
`object-cover` e specchiatura orizzontale. Velo scuro a gradiente solo nella
fascia superiore e inferiore, per la leggibilità del testo.

**In alto:** nome della controparte e pallino di stato della rete (verde /
ambra / rosso), senza etichetta testuale.

**In basso**, nell'ordine di raggiungibilità del pollice:

1. Tre pulsanti rotondi da 56px: microfono, camera, ingranaggio (avanzate).
2. Bottone rosso a piena larghezza "Entra nella videochiamata".

Margine inferiore con `env(safe-area-inset-bottom)` per la home bar iPhone.
Nessun contenuto scorrevole in nessuna condizione.

**Pulsante di inversione fotocamera** nell'angolo dell'anteprima: su mobile il
bisogno reale è passare da frontale a posteriore, non scegliere fra più
dispositivi in un menu.

**Camera spenta:** al posto del nero, le iniziali del partecipante su fondo
scuro, così è chiaro che il dispositivo funziona e la camera è spenta per
scelta.

### Foglio impostazioni avanzate

Sale dal basso; si chiude con swipe verso il basso o tocco esterno. Contiene:

- scelta microfono;
- scelta camera;
- selezione altoparlante — **solo** dove `supportsAudioOutputSelection()` è vero
  (su mobile normalmente assente);
- prova altoparlante — sempre presente;
- sfondi virtuali (Nessuno / Sfoca / KaiPai / Studio) con avviso: *"può ridurre
  la fluidità video sui telefoni"*;
- dettaglio diagnostica rete con azione "Ripeti".

## Stanza a schermo intero su mobile

Su compact il contenitore della stanza diventa `fixed inset-0 z-50 h-dvh
w-screen`, senza bordo né angoli arrotondati: la chiamata esce dal flusso della
dashboard.

Si usa `dvh` e non `vh`: su mobile la barra degli indirizzi si ritrae durante lo
scorrimento e `100vh` porterebbe il fondo del contenitore sotto il bordo dello
schermo, tagliando proprio i controlli della chiamata.

Barra superiore, ridotta in base alle capability e non a giudizio a priori:

| Controllo | Su compact |
|---|---|
| Fullscreen | Rimosso (si è già a schermo intero) |
| Picture-in-Picture | Rimosso dove `document.pictureInPictureEnabled` è falso (iOS Safari) |
| Qualità connessione | Presente, ridotto a pallino colorato |
| Condivisione | Presente |
| Uscita (X) | **Aggiunto** in alto a sinistra: a schermo intero il link "Torna alla dashboard" non è raggiungibile |

Il dialogo di uscita esistente mantiene comportamento identico; su compact i tre
bottoni sono impilati a piena larghezza invece che affiancati.

## Verifica

Il progetto usa `tsx --test` con test di logica pura in `lib/core`. Il design vi
si adatta spingendo le decisioni fuori dai componenti, in funzioni pure:

```ts
// lib/core/video/capabilities.ts — nessun accesso al DOM
export function visibleRoomControls(
  caps: CallCapabilities,
  compact: boolean
): RoomControl[];

export function visibleAdvancedSections(
  caps: CallCapabilities,
  compact: boolean
): AdvancedSection[];
```

Il rilevamento effettivo (`matchMedia`, `document.pictureInPictureEnabled`,
`supportsBackgroundProcessors()`) vive in un lettore sottile a parte, unico pezzo
non coperto da test automatici.

**`lib/core/video/capabilities.test.ts`**, aggiunto allo script `test`, copre:

- su compact il fullscreen non compare mai;
- su iOS Safari il Picture-in-Picture non compare;
- dove l'uscita audio non è selezionabile, la sezione altoparlante sparisce
  dalle avanzate ma la prova altoparlante resta;
- su desktop l'insieme dei controlli è identico a quello attuale (nessuna
  regressione per la maggioranza degli utenti odierni).

**Verifica manuale**, per ciò che nessun test unitario dimostra:

- DevTools in emulazione iPhone SE (il caso peggiore): il bottone "Entra" è
  visibile senza scorrere;
- rotazione in orizzontale: il bottone resta raggiungibile;
- passaggio da pre-join a stanza senza sfarfallio di layout;
- stesso percorso attraverso il link ospite.

## Fuori ambito

**Ciclo di vita dell'app su mobile** — blocco schermo, telefonata in arrivo,
cambio applicazione. LiveKit sospende i track e il comportamento al ritorno varia
sensibilmente fra iOS e Android. È il lavoro consigliato immediatamente
successivo: su mobile accade a ogni sessione, non è un caso limite.

**Revisione dei controlli in chiamata** e gestione della rotazione a chiamata
avviata, oltre alla riduzione della barra superiore descritta sopra.
