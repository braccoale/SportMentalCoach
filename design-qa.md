# Design QA — Modale accesso demo

## Evidence

- Source visual truth: screenshot della modale allegato dall'utente nella conversazione (525 × 499 px).
- Implementation screenshot: `tmp/demo-login-modal-production-final.png` (512 × 477 px).
- URL verificato: `https://www.kaipaicoaching.com/`.
- Browser viewport: 1440 × 900 CSS px, device scale factor 1.
- Density normalization: entrambe le immagini sono a densità 1×; la sorgente è un ritaglio con margine esterno, mentre l'implementazione è la cattura esatta del pannello.
- State: landing page, modale “Da quale prospettiva vuoi entrare?” aperta, nessun ruolo in caricamento.

## Full-view comparison evidence

La struttura del pannello coincide con la sorgente: stessa larghezza, gerarchia, griglia a due card, copy, colori, bordi, raggi e spaziatura. L'unico cambiamento intenzionale è la sostituzione dei pittogrammi con due ritratti circolari. Il pannello renderizzato misura 512 × 477 px; la differenza rispetto ai 525 × 499 px della sorgente è dovuta al margine esterno incluso nello screenshot originale.

## Focused region comparison evidence

Le aree avatar sono state verificate nella cattura di produzione. Alessandro Riva e Giulia Martini sono riconoscibili, centrati e nitidi; entrambe le immagini sono caricate tramite Next Image, visualizzate a 46 × 46 px dentro un contenitore nominale da 48 × 48 px con bordo da 1 px, crop `object-cover` e maschera circolare. Non sono presenti stretching, aloni o placeholder.

## Findings

- Nessun finding P0, P1 o P2.
- Nessun finding P3 necessario per questa modifica.

## Required fidelity surfaces

- Fonts and typography: famiglia, pesi, dimensioni, interlinea, tracking e wrapping risultano invariati rispetto alla sorgente.
- Spacing and layout rhythm: frame, padding, griglia, gap, raggi e ritmo verticale risultano coerenti; l'aumento intenzionale dell'area avatar da 44 a 48 px non altera le card.
- Colors and visual tokens: i token esistenti `kp-red`, `kp-line`, `kp-surface`, `kp-hi` e `kp-mid` sono preservati; contrasto e gerarchia restano corretti.
- Image quality and asset fidelity: usate le foto già associate ai profili demo Alessandro Riva e Giulia Martini; crop e nitidezza verificati in produzione.
- Copy and content: invariati rispetto alla sorgente.

## Comparison history

- Pass 1: confronto locale inizialmente bloccato perché il browser integrato non aveva inizializzato la sessione.
- Pass 2: con autorizzazione dell'utente è stata acquisita la modale locale; nessun errore console e immagini caricate correttamente.
- Pass 3: dopo il deploy definitivo di `main` è stata acquisita e verificata la modale sul dominio di produzione; HTTP 200, nessun errore console, entrambe le foto complete e correttamente dimensionate.

## Implementation checklist

- [x] Sostituita l'icona Coach con la foto di Alessandro Riva.
- [x] Sostituita l'icona Atleta con la foto di Giulia Martini.
- [x] Conservato lo spinner nei due stati di caricamento.
- [x] Aggiunti testi alternativi descrittivi.
- [x] TypeScript e build di produzione completati senza errori.
- [x] Verifica visiva locale completata.
- [x] Deploy e smoke test sul dominio di produzione completati.

## Follow-up polish

- Nessun intervento aggiuntivo richiesto.

## Final result

final result: passed

---

# Design QA - Pulsante PDF compatto a destra

## Evidence

- Source visual truth: screenshot fornito dall'utente e cattura della precedente barra in produzione `tmp/session-pdf-row-reference.png` (1200 x 2541 px).
- Implementation screenshot: `tmp/session-pdf-icon-right-local.png` (1200 x 2521 px).
- Combined comparison input: `tmp/session-pdf-button-design-qa.png` (1200 x 260 px), con precedente versione sopra e implementazione sotto.
- Browser viewport: 1440 x 1000 CSS px, device scale factor 1.
- State: coach demo autenticato, sessione approvata 213, pannello Session Compass aperto; nessun controllo in caricamento.

## Full-view and focused comparison evidence

La barra mantiene gerarchia, spaziatura, bordi e tipografia esistenti. Il comando PDF passa da pulsante testuale iniziale a controllo circolare con la sola icona e viene reso dopo “Rigenera bozza” e “Condividi con l’atleta”, quindi all'estrema destra. Nel ritaglio comparativo l'asset PDF rimane nitido e immediatamente riconoscibile; non introduce wrapping né sottrae spazio agli altri comandi.

## Required fidelity surfaces

- Fonts and typography: nessuna variazione ai testi rimanenti; il testo “PDF sessione” è stato rimosso solo dalla superficie visiva.
- Spacing and layout rhythm: controllo da 48 x 48 px, centrato verticalmente e ultimo nella sequenza; gap esistenti preservati.
- Colors and visual tokens: fondo bianco traslucido, ring, ombra e focus violetto esistenti preservati.
- Image quality and asset fidelity: conservato `public/icons/pdf-download.png`, renderizzato a 40 x 40 px senza deformazioni.
- Copy and content: tooltip e nome accessibile “Scarica e apri il report PDF della sessione” restano disponibili.

## Findings

- Nessun finding P0, P1 o P2.
- Nessun finding P3 necessario per questa modifica.

## Functional verification

- [x] Ordine browser verificato: Rigenera, Condividi, PDF.
- [x] Il pulsante PDF non contiene testo visibile.
- [x] Nome accessibile completo verificato.
- [x] Tre test mirati e TypeScript completati senza errori.
- [x] Nessun errore console o eccezione pagina.

## Comparison history

- Pass 1: verifica locale bloccata da più vecchie istanze Next.js che condividevano `.next`.
- Pass 2: chiuse le sole istanze del progetto e riavviata una preview pulita sulla porta 4173.
- Pass 3: confronto combinato completato; nessuna differenza P0, P1 o P2 oltre al cambiamento richiesto.

## Final result

final result: passed

---

# Design QA - Icona PDF ingrandita e widget più trasparenti

## Evidence

- Source visual truth: `tmp/athlete-header-pdf-icon-production.png`, versione precedente della testata atleta in produzione.
- Implementation screenshot: `tmp/athlete-header-pdf-icon-large-production.png`, versione aggiornata sul dominio di produzione.
- Combined comparison input: `tmp/athlete-header-pdf-icon-large-qa.png`, prima e dopo affiancati nello stesso raster.
- Viewport browser: 1440 x 900 CSS px, device scale factor 1.
- Source e implementation: regione header 1200 x 240 px a densità 1x; nessuna normalizzazione necessaria.
- State: coach demo autenticato, scheda atleta Lorenzo Conti, percorso esportabile e pulsante PDF inattivo.

## Full-view and focused comparison evidence

Il confronto affiancato mostra che la composizione dell'header, l'allineamento e la gerarchia restano invariati. Nel focus destro l'asset PDF fornito occupa ora 40 px dentro un controllo da 48 px: sagoma, simbolo Acrobat e scritta “PDF” sono riconoscibili. I widget passano da `bg-white/45` a `bg-white/30`, lasciano vedere maggiormente la copertina e mantengono cifre e label leggibili; i valori restano centrati.

## Required fidelity surfaces

- Fonts and typography: nessuna variazione; label e valori mantengono dimensione, peso, interlinea e gerarchia esistenti.
- Spacing and layout rhythm: controllo PDF da 48 x 48 px allineato verticalmente ai widget, senza overflow o variazioni alla griglia.
- Colors and visual tokens: fondo widget alleggerito al 30%, ring al 45% e blur ridotto; contrasto dei numeri preservato.
- Image quality and asset fidelity: usato `public/icons/pdf-download.png`, derivato dall'immagine PDF fornita dall'utente; rendering 40 x 40 px nitido e senza deformazioni.
- Copy and content: testi, numeri e nome accessibile del download invariati.

## Findings

- Nessun finding P0, P1 o P2.
- Nessun finding P3 necessario per questa modifica.

## Functional verification

- [x] Pulsante rilevato a 48 x 48 px.
- [x] Download `percorso-lorenzo-conti-2026-08-22.pdf` completato.
- [x] Nessun errore console o eccezione pagina.
- [x] Sei test mirati, TypeScript e build di produzione completati.

## Comparison history

- Pass 1: icona renderizzata a 28 px e widget al 45% di bianco, entrambi percepiti troppo piccoli/pieni.
- Pass 2: icona portata a 40 px, controllo a 48 px e widget al 30%; confronto sullo stesso header senza regressioni visive.

## Final result

final result: passed

---

# Design QA - Icona export PDF nella testata atleta

## Evidence

- Source visual truth: `tmp/athlete-header-reference.png`, testata atleta precedente con il controllo di download generico.
- Implementation screenshot: `tmp/athlete-header-pdf-icon-production.png`, cattura della testata atleta sul dominio di produzione.
- Combined comparison input: `tmp/athlete-header-pdf-icon-qa.png`.
- Viewport browser: 1440 x 900 CSS px, device scale factor 1.
- Regione confrontata: header da 1200 x 240 px; entrambe le catture sono a densità 1x e non richiedono normalizzazione.
- State: coach demo autenticato, scheda atleta Lorenzo Conti, export disponibile e pulsante inattivo.

## Comparison evidence

Il controllo generico con freccia è stato sostituito da un documento con la sigla PDF leggibile. Il pulsante passa da 40 a 44 px, conserva forma circolare e allineamento con i due widget, ma usa fondo bianco più presente, bordo più netto, ombra leggera e pittogramma da 24 px. La funzione resta immediatamente riconoscibile senza introdurre testo aggiuntivo nella testata.

## Required fidelity surfaces

- Fonts and typography: nessuna variazione al testo o alla gerarchia dell'header.
- Spacing and layout rhythm: il nuovo diametro resta allineato verticalmente ai widget e non crea overflow.
- Colors and visual tokens: rosso KaiPai, bianco traslucido e focus ring esistente preservati.
- Image quality and asset fidelity: usata l'icona vettoriale `TbFileTypePdf` della libreria già installata, nitida a densità 1x.
- Copy and content: tooltip e nome accessibile continuano a descrivere download e apertura del PDF.

## Findings

- Nessun finding P0, P1 o P2.
- Nessun finding P3 necessario per questa modifica.

## Functional verification

- [x] Pulsante rilevato a 44 x 44 px con nome accessibile descrittivo.
- [x] Click completato e download `percorso-lorenzo-conti-2026-08-22.pdf` ricevuto.
- [x] Stato di completamento annunciato tramite regione live.
- [x] Nessun errore console o eccezione pagina durante il flusso.

## Comparison history

- Pass 1: l'icona precedente risultava piccola e poco immediata.
- Pass 2: introdotta l'icona documento PDF, aumentati dimensione e contrasto; verifica sul dominio di produzione completata senza regressioni visive.

## Final result

final result: passed

---

# Design QA - Export PDF del percorso mentale

## Evidence

- Source visual truth: `tmp/athlete-header-reference.png`, cattura dell'header atleta KaiPai in produzione (1200 x 240 px).
- Implementation screenshots: `tmp/percorso-giulia-martini-page-1.png` e `tmp/percorso-giulia-martini-page-2.png` (893 x 1263 px ciascuna, raster 1.5x).
- Combined comparison input: `tmp/journey-pdf-design-qa.png`.
- PDF verificato: `tmp/percorso-giulia-martini-2026-08-22.pdf`, formato A4 (595.28 x 841.89 pt), 2 pagine.
- State: esportazione del percorso di un'atleta con foto profilo, dati generali, otto sessioni svolte, 8h 12m di lavoro, otto riepiloghi approvati e sei impegni.

## Full-view comparison evidence

Il PDF riprende intenzionalmente il linguaggio KaiPai dell'interfaccia reale: nero, bianco e rosso, logo ufficiale, ritratto dell'atleta, dati anagrafici e statistiche compatte. Il layout e' adattato al supporto A4 invece di clonare la card orizzontale: prima pagina di sintesi operativa, seconda pagina dedicata alla cronologia. Il confronto combinato mostra coerenza di marca senza sacrificare leggibilita' e densita' del documento.

## Focused region comparison evidence

- Header: lockup ufficiale KaiPai ball/brain, banda scura alleggerita, data semplice in alto, foto reale del profilo atleta e accento rosso coerenti con il prodotto; il ritratto e' nitido, centrato e non deformato.
- Dati generali: eta', sport e livello sono leggibili accanto al nome senza sovrapporsi alla foto.
- Statistiche: sessioni svolte, tempo totale, durata media e attività concordate sono leggibili a colpo d'occhio.
- Sezioni: sintesi, temi, impegni e punti da riprendere hanno una gerarchia uniforme.
- Cronologia: le otto sedute approvate restano interamente entro la seconda pagina.
- Footer: firma email su quattro righe, contatto, sito, dicitura riservata e numerazione presenti su entrambe le pagine senza elementi promozionali estranei.

## Findings

- Pass 1 - P2: la cronologia generava una terza pagina quasi vuota. Risolto compattando la disclosure e la spaziatura delle sezioni.
- Pass 2: prima versione a due pagine verificata senza overflow o clipping.
- Pass 3: aggiunti foto, dati generali e quattro statistiche; il documento resta di due pagine e non presenta finding P0, P1, P2 o P3.
- Pass 4: aggiunto il footer editoriale KaiPai con borraccia, payoff, contatto e firma; il documento resta di due pagine, il footer non si sovrappone alla cronologia e non presenta finding P0, P1, P2 o P3.
- Pass 5: aggiunta nell'header una disclosure persistente e leggibile su assistenza IA, revisione umana, possibilita' di errore, assenza di diagnosi/decisioni automatizzate, riservatezza e contatto privacy. Il PDF resta di due pagine; nessun overflow, clipping o finding P0, P1, P2 o P3.
- Pass 6: sostituito il vecchio mini-logo con il lockup ufficiale ball/brain, usata la foto del profilo demo reale, rimosso il badge del periodo in favore della data, ridotti header e statistiche e trasformato il footer in una firma email senza borraccia. Il PDF resta di due pagine e non presenta finding P0, P1, P2 o P3.
- Pass 7: rimosse le etichette ripetute “RIEPILOGO APPROVATO” dalla cronologia e sostituito il quarto KPI con “ATTIVITÀ CONCORDATE”, mostrando il totale e quante sono state completate. Il PDF resta di due pagine e non presenta finding P0, P1, P2 o P3.

## Required fidelity surfaces

- Fonts and typography: gerarchia coerente, corpi leggibili e contrasto adeguato alla stampa.
- Spacing and layout rhythm: griglia A4, margini, card e separatori regolari su entrambe le pagine.
- Colors and visual tokens: palette KaiPai nero/bianco/rosso preservata.
- Image quality and asset fidelity: lockup ufficiale `public/email/kaipai-logo.png` e foto del profilo atleta sono incorporati come raster; nessuna immagine generica o ricostruzione del marchio.
- Copy and content: data odierna, atleta, coach, eta', sport, livello, statistiche compatte, email, sito, firma del team e sezioni principali presenti; le bozze non approvate sono escluse.

## Functional verification

- [x] Output binario PDF valido e metadati verificati.
- [x] Content-Type `application/pdf` e download `.pdf` verificati da test.
- [x] Nome file con atleta e data odierna verificato da test.
- [x] TypeScript verificato sul perimetro della modifica.
- [x] Calcolo delle durate reali e di fallback verificato da test.
- [x] Rendering e confronto visivo completati su entrambe le pagine.
- [x] Disclosure IA/privacy visibile verificata nell'header e metadati machine-readable verificati da test.
- [x] Header HTTP anti-cache, `nosniff`, sandbox e `no-referrer` verificati da test.

## Final result

final result: passed
