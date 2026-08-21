# Design QA — Card prossimi appuntamenti

## Evidence

- Source visual truth: screenshot annotato allegato dall'utente nella conversazione (651 × 453 px).
- Implementation screenshot: non disponibile.
- Viewport: sorgente ritagliata sulla card; viewport applicativo non dichiarato.
- Pixel density normalization: non applicabile senza una cattura dell'implementazione.
- State: card di un appuntamento accettato, menu azioni chiuso.

## Full-view comparison evidence

La sorgente è stata aperta e usata per l'implementazione. La pagina locale è stata compilata con successo, ma il browser integrato non ha potuto inizializzare la sessione; di conseguenza non è stato possibile acquisire una cattura browser della card allo stesso viewport e affiancarla alla sorgente.

## Focused region comparison evidence

Non eseguita: manca la cattura renderizzata. Le aree da confrontare nel pass successivo sono intestazione/menu, blocco data, riga atleta/icona sport e footer senza menu duplicato.

## Findings

- [P2] Confronto visivo browser mancante
  - Location: card “Prossimi appuntamenti”.
  - Evidence: sorgente disponibile; cattura dell'implementazione non disponibile.
  - Impact: tipografia, spaziature, allineamenti, colori e resa dell'icona sport non possono essere validati visivamente allo stesso viewport.
  - Fix: aprire la dashboard coach nel browser scelto dall'utente, acquisire la card e confrontarla affiancata alla sorgente.

## Required fidelity surfaces

- Fonts and typography: implementati con i token tipografici esistenti; verifica visiva bloccata.
- Spacing and layout rhythm: struttura aggiornata; verifica visiva bloccata.
- Colors and visual tokens: colori esistenti blu/verde/grigio riutilizzati; verifica visiva bloccata.
- Image quality and asset fidelity: immagine atleta invariata; icona sport da libreria vettoriale, senza emoji o disegni approssimati; verifica visiva bloccata.
- Copy and content: “Aggiungi al calendario”, “Aggiungi ospite”, giorno della settimana e nome atleta verificati nei test di rendering.

## Comparison history

- Pass 1: confronto non avviabile perché manca la cattura browser dell'implementazione. Nessuna iterazione visiva completata.

## Implementation checklist

- [x] Menu azioni spostato in alto a destra.
- [x] Azioni calendario e ospite spostate nel menu.
- [x] Giorno della settimana affiancato a mese e anno con lo stesso colore.
- [x] Icona sport affiancata al nome dell'atleta.
- [x] Menu con tre puntini rimosso dal footer.
- [x] TypeScript, test mirati e build di produzione completati.
- [ ] Cattura e confronto visivo allo stesso viewport.

## Final result

final result: blocked

Blocker: il browser integrato non ha inizializzato la sessione e l'uso di un browser Playwright separato richiede l'autorizzazione dell'utente.
