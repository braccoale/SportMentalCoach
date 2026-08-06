# Design QA — Statistiche scheda atleta admin

- Source visual truth: screenshot fornito dall'utente nella conversazione (sezione “Attività su KaiPai” con due indicatori).
- Implementation screenshot: non disponibile; il collegamento al browser integrato non è stato inizializzato dall'ambiente.
- Viewport: riferimento circa 512 px di larghezza; implementazione prevista responsive con passaggio a tre colonne da 480 px.
- Pixel dimensions / CSS size / density: non verificabili senza cattura browser.
- State: dashboard admin, popup “Scheda atleta”, sezione statistiche.
- Primary interaction: apertura popup non verificata nel browser; build e rendering TypeScript verificati.
- Console errors: non verificabili senza collegamento browser.

## Full-view comparison evidence

Il riferimento mantiene una card chiara con due gauge. L'implementazione conserva lo stesso componente `GaugeRing`, gli stessi token, raggi, ombre e gerarchia, aggiungendo un terzo indicatore “Sessioni pianificate”. Non è stato possibile produrre la cattura renderizzata necessaria al confronto visivo.

## Focused region comparison evidence

Regione interessata: griglia dei gauge. Dal codice, la griglia passa a tre colonne da 480 px e resta a una colonna sui display più stretti. La verifica visiva di wrapping, spaziatura e allineamento è bloccata dall'indisponibilità del browser integrato.

## Findings

- [P2] Confronto visivo non eseguito.
  - Location: popup scheda atleta, sezione “Attività su KaiPai”.
  - Evidence: sorgente disponibile nella conversazione; cattura dell'implementazione assente.
  - Impact: non è possibile attestare la fedeltà finale a 480–670 px.
  - Fix: aprire `/dashboard/admin` con un account admin, visualizzare una scheda atleta e catturare la sezione alle larghezze desktop e mobile.

## Required fidelity surfaces

- Fonts and typography: componenti e classi esistenti conservati; verifica raster bloccata.
- Spacing and layout rhythm: griglia responsive implementata; verifica visiva bloccata.
- Colors and visual tokens: verde e azzurro esistenti conservati, ambra aggiunta per distinguere le sessioni pianificate; verifica visiva bloccata.
- Image quality and asset fidelity: nessuna nuova immagine; icona dalla libreria già in uso.
- Copy and content: “Sessioni pianificate” presente; sottotitolo aggiornato per descrivere tutti e tre gli indicatori.

## Comparison history

- Iterazione 1: implementazione completata; confronto browser non avviabile nell'ambiente, quindi nessuna evidenza post-fix disponibile.

## Implementation checklist

- [x] Aggiungere il dato delle sessioni pianificate.
- [x] Escludere appuntamenti conclusi, annullati, rifiutati o scaduti.
- [x] Mostrare il terzo gauge con stile coerente.
- [x] Verificare test automatici e build.
- [ ] Eseguire confronto visivo autenticato desktop/mobile.

## Follow-up polish

Nessuna raccomandazione P3 finché non è disponibile una cattura renderizzata.

Historical final result: blocked

---

# Design QA — Popup disponibilità coach

- Source visual truth: screenshot fornito dall’utente nella conversazione, sezione “Disponibilità settimanale”.
- Implementation screenshot: non disponibile; la pagina locale richiede una sessione Supabase valida e il trasferimento del cookie demo dalla produzione a localhost non è stato autorizzato.
- Viewport: riferimento desktop, circa 1000 × 230 px per la sezione; implementazione prevista responsive.
- Pixel dimensions / CSS size / density: non normalizzabili senza entrambe le catture.
- State: dashboard coach, pagina servizi, popup “Aggiungi giorno o fascia” aperto.
- Primary interactions: comportamento verificato tramite logica, test automatici e build; click-through autenticato non completato.
- Console errors: non verificabili senza sessione browser autenticata.

## Full-view comparison evidence

Il riferimento mostra una card compatta con CTA in alto a destra e righe orarie sottostanti. L’implementazione mantiene card, griglia e token esistenti, rende verde la CTA e sposta inserimento/modifica in un popup. Non è stato possibile catturare la pagina autenticata per un confronto raster.

## Focused region comparison evidence

La regione critica è il nuovo popup con giorno inizialmente vuoto, orari `00:00`, azioni “Annulla” e “OK”. Il codice e la build confermano la presenza degli stati richiesti; allineamento, wrapping e resa dei controlli nativi richiedono ancora una cattura browser.

## Findings

- [P2] Confronto visivo autenticato non eseguito.
  - Location: `/dashboard/coach/services`, sezione disponibilità e popup.
  - Evidence: sorgente disponibile nella conversazione; cattura dell’implementazione assente.
  - Impact: non è possibile attestare la fedeltà finale desktop/mobile o l’assenza di errori console.
  - Fix: verificare la pagina su un ambiente autenticabile con account coach demo e catturare card e popup alle larghezze desktop e mobile.

## Required fidelity surfaces

- Fonts and typography: font, pesi e gerarchia della piattaforma riutilizzati; verifica raster bloccata.
- Spacing and layout rhythm: card e griglia responsive coerenti con la sezione esistente; verifica visiva bloccata.
- Colors and visual tokens: CTA e conferma usano il verde standard KaiPai; errori e cancellazione usano rosso semantico.
- Image quality and asset fidelity: nessuna immagine richiesta; icone dalla libreria già adottata dal prodotto.
- Copy and content: CTA, campi obbligatori, “Annulla”, “OK” e messaggio di sovrapposizione presenti.

## Comparison history

- Iterazione 1: implementazione, 36 test e build completati; cattura browser bloccata dalla sessione locale non valida.

## Implementation checklist

- [x] CTA verde “Aggiungi giorno o fascia”.
- [x] Popup con giorno vuoto e orari `00:00`.
- [x] “Annulla” senza scrittura.
- [x] “OK” con salvataggio immediato.
- [x] Eliminazione del salvataggio generale.
- [x] Modifica delle fasce esistenti tramite popup.
- [x] Controllo atomico delle sovrapposizioni.
- [x] Conferma prima della cancellazione.
- [x] Test automatici, TypeScript e build.
- [ ] Confronto visivo autenticato desktop/mobile.

## Follow-up polish

Nessuna raccomandazione P3 finché non è disponibile la cattura renderizzata.

final result: blocked

---

# Design QA — Modifica appuntamento e gerarchia CTA

- Source visual truth: screenshot fornito dall’utente della card “Appuntamento confermato”.
- Implementation screenshot: non disponibile; il collegamento al browser integrato è stato bloccato dall’ambiente prima dell’apertura della pagina locale.
- Viewport: riferimento desktop compatto, circa 620 × 500 px.
- State: dettaglio di una sessione accettata e popup “Modifica appuntamento”.
- Primary interactions: tooltip video, apertura popup e salvataggio verificati tramite codice, TypeScript, test e build; click-through autenticato non disponibile.
- Console errors: non verificabili senza browser integrato.

## Full-view comparison evidence

La gerarchia della card è stata invertita come richiesto: “Apri videochiamata” è ora la CTA verde a tutta larghezza, mentre Google Calendar è un’azione secondaria compatta. Il resto della card conserva struttura, spaziatura e componenti KaiPai esistenti.

## Focused region comparison evidence

La nuova regione azioni comprende CTA video con tooltip, chat, modifica, calendario, annullamento e ritorno alla dashboard. Il popup di modifica riusa il linguaggio visivo dei popup KaiPai e presenta giorno, orario a intervalli di 15 minuti, slot occupati rossi e azioni Annulla/Salva modifica.

## Findings

- [P2] Confronto raster autenticato non eseguito.
  - Location: `/dashboard/appointments/[id]` e card “Prossimi appuntamenti”.
  - Evidence: screenshot sorgente disponibile; cattura implementazione assente per indisponibilità del browser integrato.
  - Impact: wrapping e posizione esatta del tooltip non sono attestabili alle diverse larghezze.
  - Fix: aprire una sessione accettata con account atleta e coach, catturare dettaglio, tooltip e popup su desktop e mobile.

## Required fidelity surfaces

- Fonts and typography: font e gerarchie esistenti conservati.
- Spacing and layout rhythm: CTA principale separata dalle azioni secondarie; popup responsive.
- Colors and visual tokens: verde KaiPai per video/salvataggio, rosso semantico per occupato/annulla.
- Image quality and asset fidelity: nessuna nuova immagine; icone dalla libreria già adottata.
- Copy and content: tooltip dei 5 minuti, “Modifica appuntamento”, slot “Occupato” e messaggi di errore presenti.

## Comparison history

- Iterazione 1: implementazione completata; 41 test, TypeScript e build superati; cattura browser bloccata dall’ambiente.

## Implementation checklist

- [x] Google Calendar reso secondario e compatto.
- [x] “Apri videochiamata” reso CTA principale nel dettaglio.
- [x] Tooltip accessibile sull’apertura video.
- [x] Pulsante Modifica nel dettaglio.
- [x] Pulsante Modifica nelle card “Prossimi appuntamenti”.
- [x] Popup con giorno/orario e slot occupati.
- [x] Controlli server su partecipazione, disponibilità e conflitti.
- [x] Notifica all’altro partecipante dopo la modifica.
- [x] Test automatici, TypeScript e build.
- [ ] Confronto visivo autenticato desktop/mobile.

## Follow-up polish

Nessuna raccomandazione P3 prima della cattura autenticata.

final result: blocked

---

# Design QA — stato registrazione nella card sessione

- Source visual truth: screenshot fornito dall'utente nella conversazione (card archivio coach, sessione completata).
- Source dimensions: 660 × 483 px, densità non dichiarata.
- Implementation screenshot: non disponibile; la route richiede una sessione coach autenticata e il browser integrato non è accessibile in questa sessione.
- Intended viewport: card desktop nello stesso stato e con gli stessi dati dello screenshot.
- Implementation CSS size/density: non misurabile senza rendering autenticato.
- State: sessione completata con registrazione AI e stato di elaborazione/report variabile.

## Full-view comparison evidence

Bloccata: è disponibile la sorgente visiva, ma non una cattura browser della card implementata nello stesso stato autenticato.

## Focused region comparison evidence

Bloccata per lo stesso motivo. La regione da confrontare è la testata della card, tra “Sessione completata” e il margine destro, dove viene inserito il badge di stato.

## Findings

- Nessun P0/P1/P2 rilevabile dal controllo statico di struttura e classi.
- Verifica visiva ancora necessaria per wrapping del badge, equilibrio della testata e resa mobile.
- Font, colori, spaziatura, icone, immagini e copy riusano rispettivamente tipografia, token Tailwind, Lucide e asset già presenti nella card; la corrispondenza visiva non può però essere dichiarata senza screenshot browser.

## Comparison history

- Prima iterazione: badge collocato nella testata con layout `flex-wrap`, dimensione testo 10 px e palette semantica per stato.
- Test funzionali e TypeScript superati; nessuna iterazione visiva possibile senza accesso alla pagina autenticata.

## Implementation checklist

- [x] Stato reale AI collegato alla prenotazione.
- [x] Esistenza reale della registrazione verificata prima di mostrare “Registrata”.
- [x] Stati elaborazione, revisione, approvazione, condivisione ed errore rappresentati.
- [x] Layout predisposto al wrapping responsive.
- [ ] Confronto screenshot nello stesso stato autenticato.

final result: blocked
