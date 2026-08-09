# Pipeline di trascrizione: affidabilità sotto carico

**Data:** 9 agosto 2026
**Stato:** proposta, da approvare
**Obiettivo:** portare la trascrizione AI da «funziona quando tutto va bene» a
«fallisce in modo visibile e si ripara da sola», con migliaia di sessioni al
giorno e sedute lunghe.

---

## Una premessa che va detta

Un sistema infallibile non esiste. Chi lo promette sta vendendo qualcosa.

Quello che esiste, ed è ottenibile, sono quattro proprietà misurabili:

1. **Nessuno stallo silenzioso.** Ogni sessione raggiunge uno stato terminale
   entro un tempo massimo dichiarato, sempre, anche quando tutto si rompe.
2. **Latenza limitata.** Non «di solito veloce», ma un numero con una soglia
   sopra la quale scatta un allarme.
3. **Riparazione automatica.** Un guasto transitorio — provider giù, rete
   persa, callback smarrita — si risolve senza che nessuno se ne accorga.
4. **Fallimento visibile.** Quando la riparazione non basta, qualcuno lo sa
   entro minuti, con il motivo scritto.

Questo documento persegue quelle quattro. Dove serve spendere — piano Vercel,
coda esterna — lo dice, invece di far finta che l'architettura gratuita regga.

---

## Cosa è successo stasera, e cosa insegna

Cinque guasti in fila, tutti reali, tutti in produzione:

| # | Guasto | Perché era possibile |
|---|---|---|
| 1 | La coda restava ferma fino a 24 ore | L'unica sveglia affidabile era il cron giornaliero |
| 2 | La sveglia dal webhook non arrivava mai | Ricostruiva l'origine da variabili d'ambiente assenti; il dominio di ripiego redirige |
| 3 | Deepgram rifiutava ogni consegna asincrona | Nessun ripiego: la strada sincrona era stata rimossa di proposito |
| 4 | Il motivo del rifiuto era invisibile | La risposta del provider veniva scartata |
| 5 | Una sessione senza parlato girava all'infinito | Nessuno dichiarava finita una sessione senza segmenti |

**La lezione comune:** ogni guasto era un *singolo punto di rottura senza
allarme*. Nessuno di questi era complicato. Tutti erano invisibili finché un
umano non guardava il database.

Il piano che segue non aggiunge funzionalità. Toglie punti di rottura e
accende luci.

---

## Fase 1 — Nessuno stallo silenzioso *(la più urgente)*

**Il principio:** ogni sessione ha una scadenza. Alla scadenza qualcuno decide,
sempre, anche a costo di decidere male. Uno stato terminale sbagliato si
corregge; una rotellina che gira no.

### 1.1 Macchina a stati con scadenze

Ogni stato non terminale riceve un tempo massimo di permanenza e un'azione di
uscita forzata:

| Stato | Tempo massimo | Uscita forzata |
|---|---|---|
| `active` | durata prenotata + 60 min | chiusura, con `closeReason: safety_limit` |
| `processing` senza job attivi | 5 min | stato terminale con motivo |
| `processing` con job attivi | 45 min | stato terminale, job cancellati |
| richiesta al provider `submitted` | 20 min | reimmissione (già esistente) |

*Parzialmente fatto stasera*: la rete di sicurezza a 30 minuti e la chiusura
immediata quando non c'è parlato. Manca la copertura degli altri stati e una
tabella di scadenze esplicita invece di costanti sparse.

### 1.2 Il motivo viaggia sempre con lo stato

`transcription_failed` da silenzio e `transcription_failed` da guasto sono
cose diverse. Il codice motivo esiste già sulla sessione: va valorizzato in
ogni percorso di uscita, e l'interfaccia deve dirlo con parole diverse.
*Fatto stasera per il caso silenzio; da estendere a tutti.*

### 1.3 Test che provano lo stallo, non il successo

Per ogni stato non terminale, un test che simula «il mondo si ferma qui» e
verifica che entro la scadenza la sessione esca comunque. Sono i test che
nessuno scrive e che avrebbero preso quattro dei cinque guasti di stasera.

**Criterio di accettazione:** una query che cerchi sessioni non terminali più
vecchie della loro scadenza restituisce zero righe. Sempre. Diventa un
controllo automatico.

---

## Fase 2 — Un orologio vero

**Il problema di fondo:** su Vercel Hobby il cron gira **una volta al giorno**.
Ogni meccanismo che dipende da «qualcuno prima o poi passerà» eredita quella
latenza. Le sveglie che ho aggiunto stasera — chiusura sessione, apertura
pagina, corsa dentro la richiesta — funzionano, ma sono *opportunistiche*:
dipendono da un umano che compie un gesto.

Con migliaia di sessioni al giorno serve un orologio che non dipenda da
nessuno. Tre strade, in ordine di quanto costano:

**A. Vercel Pro con cron al minuto** *(consigliata come primo passo)*
Un cron ogni minuto è sufficiente: la latenza peggiore diventa 60 secondi,
il codice non cambia, il rischio è nullo. È il rapporto migliore fra costo e
risultato.

**B. Coda gestita esterna** (QStash, Inngest, Trigger.dev)
Ogni job diventa un messaggio con ritentativi, backoff esponenziale e coda dei
falliti gestiti dal servizio invece che da noi. Elimina l'intera classe di
problemi «chi sveglia il worker». È la scelta giusta oltre le poche migliaia
di sessioni al giorno, ma introduce un fornitore in più sul percorso critico.

**C. Processo sempre acceso** (un piccolo worker su Railway/Fly)
Il massimo controllo e il massimo da mantenere. Ha senso solo se un giorno la
trascrizione diventa un prodotto a sé.

**Raccomandazione:** A adesso, B quando il volume giornaliero supera il
migliaio. Le sveglie opportunistiche restano in entrambi i casi: non fanno
male e coprono il minuto di attesa.

---

## Fase 3 — Il percorso asincrono deve funzionare *(vincolo per le sedute lunghe)*

Il ripiego sincrono aggiunto stasera salva le sedute brevi. **Non salva quelle
lunghe**: quaranta minuti di audio non stanno nel tetto di sessanta secondi di
una function. Per le sessioni di Francesco serve la callback funzionante.

### 3.1 Trovare il motivo del rifiuto
Il log dettagliato è già in produzione. Alla prossima consegna rifiutata
avremo stato, corpo della risposta e origine della callback. **Bloccante per
tutto il resto di questa fase.**

### 3.2 Verifica di raggiungibilità all'avvio
Una diagnostica che, a ogni deploy, verifica che l'indirizzo di callback
configurato sia pubblicamente raggiungibile e risponda come previsto — senza
attendere che sia una sessione vera a scoprirlo. Un valore sbagliato in una
variabile d'ambiente non deve poter passare inosservato.

### 3.3 Sessione sintetica giornaliera
Un file audio di riferimento, una trascrizione attesa, un confronto. Gira una
volta al giorno e verifica il percorso completo — consegna, callback,
normalizzazione, riepilogo — su dati che non appartengono a nessun cliente. È
il modo per sapere che la pipeline è rotta **prima** che sia un coach a
scoprirlo.

### 3.4 Due provider, non uno
Deepgram come primario, un secondo provider come riserva dichiarata. Non per
sfiducia: perché un fornitore unico su una funzionalità centrale è un punto di
rottura, e stasera abbiamo visto quanto costa. Il confine `SpeechToTextProvider`
esiste già; serve un secondo adattatore e una regola di commutazione.

---

## Fase 4 — Reggere il carico

### 4.1 Concorrenza verso il provider
Deepgram ha un tetto di richieste simultanee. Con centinaia di sedute che si
chiudono nella stessa ora — la sera, quando i coach lavorano — lo si supera.
Serve un limitatore condiviso: un contatore sul database delle richieste in
volo, e job che aspettano invece di prendere un 429.

### 4.2 Il claim dei job regge già, ma va provato
La presa in carico è atomica e l'indice unico impedisce doppioni. Non è mai
stato verificato sotto concorrenza vera: serve un test che lanci venti worker
sugli stessi job e verifichi che ogni job venga eseguito **esattamente una
volta**.

### 4.3 Durata delle firme
Le url firmate durano quindici minuti. Se la coda si allunga oltre, il
provider scarica un indirizzo scaduto. La firma va generata al momento della
consegna — già così — ma la reimmissione deve rigenerarla sempre, e il tempo
massimo di attesa in coda va tenuto sotto la durata della firma. Vanno legati
esplicitamente invece di essere due numeri indipendenti.

### 4.4 Prova di carico
Uno strumento che crea N sessioni sintetiche con audio reale e misura i tempi
di ogni fase. Senza questo, «regge migliaia di sessioni» è un'opinione. Con
questo è un numero. Da eseguire prima di ogni cambiamento strutturale della
pipeline.

---

## Fase 5 — Vedere cosa succede

### 5.1 Tempi per fase, salvati
Chiusura → audio pronto → consegnato → trascritto → normalizzato → riepilogo.
Cinque intervalli, salvati per ogni sessione. Senza questi, stasera ho dovuto
ricostruire a mano da quattro tabelle diverse per capire dove andava il tempo.

### 5.2 Obiettivi dichiarati
- Il 95% delle sedute ha la trascrizione entro **3 minuti** dalla chiusura.
- Il 99% raggiunge uno stato terminale entro **45 minuti**.
- Zero sessioni non terminali oltre la loro scadenza.

Un obiettivo senza numero è un desiderio.

### 5.3 Allarmi
Quando un obiettivo viene mancato, una email. Non un grafico da guardare: una
email. La differenza fra i due è se qualcuno se ne accorge di notte.

### 5.4 Il cruscotto che già c'è
La pagina di amministrazione mostra già i conteggi. Va estesa con i tempi per
fase e con l'elenco di ciò che è oltre soglia — così la domanda «va tutto
bene?» ha una risposta in tre secondi.

---

## Ordine di esecuzione

| Ordine | Fase | Perché qui |
|---|---|---|
| 1 | 3.1 — motivo del rifiuto | Blocca le sedute lunghe. È una lettura di log. |
| 2 | Fase 1 completa | Nessuno stallo silenzioso: la proprietà più importante |
| 3 | Fase 2, opzione A | Un cron al minuto: costo basso, guadagno immediato |
| 4 | 5.1 + 5.2 | Senza misure, le fasi successive sono alla cieca |
| 5 | 3.2 + 3.3 | La pipeline si accorge da sola di essere rotta |
| 6 | 4.4 poi 4.1 + 4.2 | Prima misurare il carico, poi correggere ciò che cede |
| 7 | 5.3 | Gli allarmi hanno senso quando le soglie sono tarate su dati veri |
| 8 | 3.4 — secondo provider | Il più costoso, e il meno urgente se i precedenti reggono |

Le fasi 1 e 2 insieme eliminano tutti e cinque i guasti di stasera. Il resto
serve per la scala che hai in mente, non per quella di adesso.

---

## Cosa serve da te

**Una decisione:** il piano Vercel. Con Hobby, l'unico orologio automatico
passa una volta al giorno, e tutto il resto poggia su sveglie opportunistiche.
È il vincolo che limita di più, e non si aggira con il codice.

**Una prova:** una seduta lunga vera, quaranta minuti o più, dopo che la
callback funziona. È l'unico modo per sapere se la strada asincrona regge —
il ripiego sincrono di stasera su quella durata scade.
