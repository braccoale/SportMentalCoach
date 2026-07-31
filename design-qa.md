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
