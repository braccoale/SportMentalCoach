# AI Act — classificazione, obblighi, e cosa tiene il sistema dov'è

Regolamento (UE) 2024/1689. **Dal 2 agosto 2026 il regolamento è generalmente
applicabile**, compreso l'art. 50 sulla trasparenza. Questa data è passata: gli
obblighi qui sotto sono in vigore, non in arrivo.

Documento di valutazione, non un adempimento formale. Serve a due cose: dire
perché il sistema **non è ad alto rischio**, e scrivere le condizioni che lo
tengono così — perché sono decisioni di prodotto, e una decisione di prodotto
si può cambiare per sbaglio.

---

## Il ruolo di KaiPai

**Fornitore** (art. 3, punto 3) di un sistema di IA immesso sul mercato con il
proprio nome: il Session Compass. Il modello linguistico è di terzi (OpenAI), ma
il sistema che lo integra, lo istruisce e ne consegna l'esito ai coach è nostro.

KaiPai **non è fornitore di un modello per finalità generali**: quello è OpenAI,
con i propri obblighi ai sensi del capo V. Deepgram è fornitore del servizio di
trascrizione. Entrambi figurano fra i responsabili del trattamento in privacy.

---

## Classificazione: non ad alto rischio

### Non rientra nelle pratiche vietate (art. 5)

Nessuna tecnica manipolativa o subliminale, nessuno sfruttamento di
vulnerabilità legate a età o condizione. Il sistema **non deduce emozioni sul
luogo di lavoro o negli istituti di istruzione** (art. 5, § 1, lett. f): non è
nessuno dei due contesti, e per la ragione al punto seguente non è comunque un
sistema di riconoscimento delle emozioni.

### Non è un sistema di riconoscimento delle emozioni (allegato III, punto 1, lett. c)

**È il punto che decide tutto**, quindi va detto con precisione.

L'art. 3, punto 39 definisce «sistema di riconoscimento delle emozioni» quello
che deduce emozioni o intenzioni **sulla base di dati biometrici**. Il Session
Compass deduce tono e andamento da **ciò che è stato detto**, cioè dal testo
della trascrizione. Non dalla voce.

Non è un'interpretazione benevola del codice: è una regola scritta nel prompt
(`openai-session-compass-provider.ts`), che vieta esplicitamente di valutare
*l'intonazione della voce*, la personalità, l'interesse o il coinvolgimento — e
impone che ogni valore citi la frase da cui nasce. Il contratto
(`session-compass-contract.ts`) lo ripete: «etichette strettamente
linguistiche».

> **Se un giorno qualcuno facesse dedurre lo stato emotivo dall'audio — dal
> tono, dal ritmo, dalle pause — il sistema diventerebbe ad alto rischio ai
> sensi dell'allegato III.** Non è una sfumatura: cambierebbe il regime
> giuridico dell'intero prodotto. Quella riga del prompt non è uno stile di
> scrittura, è un confine.

### Non rientra negli altri punti dell'allegato III

- **Istruzione e formazione professionale** (punto 3): non è un istituto di
  istruzione, non decide ammissioni né valuta esiti di apprendimento.
- **Occupazione e gestione dei lavoratori** (punto 4): l'atleta è il cliente del
  coach, non un lavoratore valutato dal datore di lavoro.
- Non è un dispositivo medico, non è coaching sanitario, non produce diagnosi:
  il contratto vieta i termini diagnostici.
- Nessuna delle altre voci (infrastrutture critiche, servizi essenziali,
  contrasto, migrazione, giustizia) è pertinente.

> **Il varco da sorvegliare è il ruolo `club`.** Esiste nel modello dati e oggi
> non ha quasi nessuna interfaccia. Se un domani una società sportiva potesse
> leggere i riepiloghi mentali dei propri atleti tesserati, quello
> **diventerebbe** monitoraggio e valutazione di lavoratori ai sensi
> dell'allegato III, punto 4 — con tutti gli obblighi del capo III. Prima di
> costruire quella schermata va rifatta questa valutazione.

### Conclusione

**Rischio limitato**: si applica l'**art. 50** (obblighi di trasparenza) e
l'**art. 4** (alfabetizzazione in materia di IA). Non si applicano gli obblighi
del capo III sui sistemi ad alto rischio.

---

## Obblighi applicabili, e stato

### Art. 50 — trasparenza

| Cosa chiede | Stato |
|---|---|
| Informare che si interagisce con un'IA | **Fatto.** Il pannello di consenso, prima di ogni seduta, dice che la conversazione viene registrata e trascritta e che un sistema di IA prepara la bozza. |
| Marcare i contenuti generati artificialmente in formato leggibile da una macchina | **Fatto.** L'export in Markdown porta in testa i marcatori di provenienza (`content-provenance: ai-generated`) più un avviso leggibile da una persona. |
| Informare le persone esposte a riconoscimento delle emozioni | **Non applicabile** — vedi la classificazione. |
| Deep fake e testi di interesse pubblico | **Non applicabile**: i riepiloghi sono documenti privati fra coach e atleta. |

### Art. 4 — alfabetizzazione

Applicabile dal 2 febbraio 2025 a fornitori e deployer. Riguarda le **persone**,
non il codice: chi usa il sistema deve capire che cosa fa e dove sbaglia. Non è
un adempimento che si chiude scrivendo software. Vedi «Cosa resta da fare».

### Trasparenza verso l'atleta, oltre il minimo di legge

La privacy ora contiene una sezione dedicata che dice, in italiano corrente:
che il riepilogo è generato da un'IA; che una persona lo approva prima della
condivisione; che il sistema **non** riconosce emozioni dalla voce o dal volto;
**dove può sbagliare**, e che cosa fare se sbaglia.

L'ultimo punto non è richiesto dall'art. 50. È lì perché un riepilogo che
travisa una frase detta di sfuggita è il modo concreto in cui questo sistema può
fare male a qualcuno, e chi lo legge deve saperlo.

---

## Un difetto trovato durante questa valutazione, e corretto

Fino al 22 agosto 2026 il pannello di consenso diceva:

> «In questa fase di test non verrà ancora avviata alcuna trascrizione reale.»

Nel frattempo erano state trascritte **15 sedute reali di 5 persone**, fra il 30
luglio e il 19 agosto, per un totale di 4.916 segmenti contenenti le loro parole
testuali. Nessuna delle cinque era minorenne.

Un consenso raccolto su un'informazione falsa non è un consenso informato — né
per l'art. 4, punto 11 del GDPR, né per l'obbligo di trasparenza dell'AI Act. La
frase è stata sostituita con la descrizione di ciò che accade davvero.

**Resta una decisione da prendere, e non è tecnica**: informare le cinque persone
che il testo del consenso era inesatto, ed eventualmente richiedere il consenso.
È una scelta di merito, non un'operazione di codice.

---

## Cosa resta da fare, e non lo può fare il software

1. **Alfabetizzazione in materia di IA (art. 4).** I coach usano un sistema che
   scrive di persone reali. Serve una nota — mezza pagina, non un corso — che
   dica che cosa il Compass fa, che la bozza va sempre riletta, e quali errori
   commette. E va tracciato chi l'ha ricevuta.
2. **Informare gli utenti esistenti del cambio di privacy.** La piattaforma
   registra la versione accettata e ne calcola l'hash, ma la funzione che
   verifica se serve una nuova accettazione — `hasAcceptedCurrentTerms` — **non
   è richiamata da nessuna parte**. Quindi chi è già iscritto non vedrà nessun
   avviso. Va deciso se collegarla o se mandare una comunicazione.
3. **Le cinque persone di cui sopra.**
4. **Verificare i contratti con OpenAI e Deepgram**: che l'uso sia coperto e che
   i contenuti non alimentino l'addestramento. La privacy lo afferma già; qui
   serve il documento che lo dimostra.
5. **Rivalutare prima di costruire l'area club**, per il motivo scritto sopra.

---

## Quando rifare questa valutazione

- Prima di dare a una società sportiva accesso ai riepiloghi dei propri atleti.
- Se un indicatore verrà mai dedotto dall'audio invece che dal testo.
- Se il sistema comincerà a proporre decisioni invece che descrizioni.
- Al 2 agosto 2027, quando entrano in applicazione l'art. 6, § 1 e gli obblighi
  per i modelli per finalità generali immessi prima dell'agosto 2025.
