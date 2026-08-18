# Appunti AI — latenza e affidabilità della pipeline

Analisi del 18 agosto 2026, su dati di produzione.

Nasce da una segnalazione concreta: la seduta 75 di un coach è finita in
`report_failed`, e la mail di esito parlava di trascrizione — che invece aveva
funzionato perfettamente. Scavando è emerso che i due problemi veri non erano
quello segnalato.

---

## 1. Che cosa dicono i numeri

### Affidabilità

Sulle sedute reali (oltre i quindici minuti; le altre nel database sono prove
da un minuto e non contano), da inizio agosto: **quattro riuscite, tre
fallite**. Il 43% di fallimento.

Le tre fallite hanno cause diverse, e questo è il punto:

| Seduta | Durata | Codice | Causa reale |
|---|---|---|---|
| 73 | 94 min | `TRANSCRIPTION_INCOMPLETE` | audio oltre i 50 MB del bucket → `413`, file perso per intero |
| 75 | 56 min | `COMPASS_TIMEOUT` | il modello ha sforato i 45 secondi concessi |
| 64 | 17 min | `REPORT_NOT_GENERATED` | stessa famiglia della 75 |

### Latenza

Dalla fine della seduta al riepilogo pronto, ultime sedute:

| Seduta | Attesa |
|---|---|
| 62 | 0,4 min |
| 61 | 1,0 min |
| 72 | 1,8 min |
| 59 | 46,4 min |
| 66 | 82,3 min |
| 69 | 82,8 min |
| 68 | 103,3 min |

**La distribuzione è bimodale**: o due minuti, o un'ora e mezza. Non c'è nulla
in mezzo. È la firma di «la sveglia ha suonato» contro «la sveglia non ha
suonato e si è aspettato il cron».

### Dove va il tempo

Scomposizione della seduta 66 (82 minuti totali):

| Passo | Attesa prima di essere preso | Lavoro |
|---|---|---|
| trascrizione voce 1 | 79,8 min | 10 s |
| trascrizione voce 2 | 78,7 min | 10 s |
| normalizzazione | 48,0 min | 1 s |
| riepilogo | 0,0 min | 39 s |

**Lavoro totale: 60 secondi. Attesa totale: 82 minuti.** Il modello non è il
collo di bottiglia: lo è la coda.

---

## 2. Le tre malattie

Sono indipendenti fra loro e vanno curate separatamente.

### A · Le sveglie non suonano, e nessuno lo sa

`triggerAiNotesWorker` prova quattro origini in fila e restituisce
`'triggered' | 'skipped' | 'failed'`. **Tutti i chiamanti scartano quel
valore.** I modi di fallire sono già elencati nel commento del modulo: il
redirect da `kaipaicoaching.com` a `www` che scarta l'header `Authorization`,
le variabili di sistema Vercel che possono non essere esposte.

Quando la sveglia fallisce, sotto resta un workflow GitHub Actions dichiarato
«ogni 5 minuti» che nella pratica arriva anche dopo ottanta. Nessuno se ne
accorge perché tutto è best effort e silenzioso.

### B · Il riepilogo vive al 90% del suo tempo massimo

Le generazioni riuscite al primo tentativo stanno fra i 38 e i 43 secondi,
contro un taglio a 45. La 58 ce l'ha fatta per due secondi, la 66 per sei.

E il tempo **non dipende dalla lunghezza del trascritto**: tre segmenti
impiegano 31 secondi, milleduecento ne impiegano 39. Se ne va a *scrivere*
l'output — sintesi, temi, sei metriche, andamento, momenti chiave, racconto,
impegni, preparazione, ciascuno con la sua citazione — non a leggere l'input.

Non è una seduta sfortunata: è una moneta lanciata a ogni seduta.

### C · L'audio può superare il tetto dello storage

Cinquanta MB sul piano Supabase gratuito, contro ~84 kbps osservati in
produzione: il muro arriva **intorno ai 79 minuti** di seduta. Oltre, il file
non si tronca — si perde per intero, e con esso il riepilogo.

---

## 3. Che cosa comprano i piani Pro

| Malattia | Vercel Pro | Supabase Pro |
|---|---|---|
| **A** — attesa di un'ora | **In parte**: sblocca i cron al minuto (su Hobby è uno al giorno), quindi il pavimento passa da «ottanta minuti quando GitHub si degna» a «un minuto garantito» | no |
| **B** — timeout del riepilogo | **Sì**: `maxDuration` fino a 300 s | no |
| **C** — audio oltre 50 MB | no | **Sì**, ma non da solo — vedi sotto |

### Il passaggio a Supabase Pro non basta da solo

`getAiNotesAudioMaxBytes` chiede 128 MB e `ensureAudioBucketPrivate` li passa a
`updateBucket`. **Supabase accetta la chiamata e tiene il proprio valore più
basso** quando il limite globale del progetto è inferiore, senza errore e senza
avviso: è il motivo per cui il bucket è rimasto a 50 MB per mesi mentre il
codice credeva di averne 128.

Dopo l'upgrade servono due passi, in quest'ordine:

1. alzare il limite globale in **Dashboard → Storage → Settings**;
2. **rileggere** `file_size_limit` e verificare che sia davvero salito.

---

## 4. La proposta: chi fa cosa

Il difetto di fondo è che **la pipeline è una coda dove potrebbe essere una
catena di eventi**. Ogni passo finisce, scrive una riga e aspetta che qualcuno
passi a prenderlo. Quattro passi, quattro attese.

### Oggi

```
seduta finita → [attesa] → trascrizione (10 s) → [attesa] → normalizzazione (1 s)
              → [attesa] → riepilogo (39 s) → [attesa] → mail
```

### Proposta

```
seduta finita → il webhook LiveKit avvia la trascrizione (subito)
              → la callback Deepgram normalizza *e* genera il riepilogo,
                nella stessa invocazione
              → fatto
```

**1 · La callback di Deepgram lavora invece di accodare.** È già una richiesta
HTTP che arriva quando il trascritto è pronto: con 300 secondi può normalizzare
e generare lì. Toglie due attese su quattro. La coda resta per i ritentativi,
che è il suo mestiere.

**2 · Le sveglie diventano osservabili.** L'esito di `triggerAiNotesWorker` va
registrato in `pipeline_log` invece di essere scartato. È mezza giornata di
lavoro e vale più di tutto il resto, perché rende misurabile ciò che oggi si
può solo indovinare — ed è il difetto che ha lasciato la seduta 66 ferma
ottanta minuti senza che nessuno lo notasse.

**3 · Il riepilogo in chiamate parallele.** Le sezioni sono indipendenti:
sintesi e temi, metriche e andamento, momenti chiave, impegni e preparazione.
Tre chiamate in parallelo con output più corti stanno intorno ai **15
secondi** invece di 40. Conviene anche con Pro: non per rientrare nel limite,
ma perché è la differenza fra «il coach riapre il telefono e c'è» e «aspetta un
minuto». E rende il timeout strutturalmente impossibile invece che tenuto a
bada.

**4 · Il tetto audio.** Supabase Pro più i due passi del paragrafo 3. Vale
anche la pena capire perché il bitrate osservato è ~84 kbps quando
`KAIPAI_AUDIO_PUBLISH_PRESET` ne impone 32: `red: true` raddoppia il payload,
ma non spiega tutto il resto.

---

## 5. Dove si arriva

Con Pro più i punti 1 e 3: **fine seduta → riepilogo pronto in circa trenta
secondi**, con il caso peggiore a un minuto grazie al cron. Con il punto 2 lo
sappiamo invece di sperarlo. Con il punto 4 smettono di sparire le sedute
lunghe.

## 6. Ordine di lavoro proposto

1. **Vercel Pro e Supabase Pro** — sbloccano i cron al minuto, i 300 secondi e
   il tetto dello storage. Da soli portano il caso peggiore da 103 minuti a
   circa uno.
2. **Osservabilità delle sveglie** (punto 2) — piccolo, e senza non sapremo se
   il resto ha funzionato.
3. **La callback che lavora** (punto 1) — il salto vero sulla latenza.
4. **Riepilogo in parallelo** (punto 3) — il salto vero sulla stabilità.
5. **Verifica del tetto audio** (punto 4) — dopo l'upgrade, rileggendo
   `file_size_limit` invece di fidarsi.

---

## Appendice · correzioni già fatte il 18 agosto

Non risolvono le tre malattie, ma tolgono due modi di peggiorarle:

- **Un rifiuto per stato non consuma più un tentativo.** La seduta 75 aveva tre
  tentativi e ne ha usati due: il primo è morto in sessanta millisecondi su una
  sessione ancora `active`, undici secondi prima che passasse a `processing`.
  Ora `failureOutcome` restituisce il tentativo.
- **L'errore del compass non è più anonimo.** `sanitizeFailure` conosceva due
  classi su tre: `SessionCompassError` — quella con cui arriva `COMPASS_TIMEOUT`
  — finiva appiattita in `PROCESSING_FAILED`, nel job, nella riga di sessione e
  quindi nella mail. È il motivo per cui la segnalazione parlava di
  trascrizione.
- **La riapertura risveglia il riepilogo.** `ai-notes:reopen` riportava la
  sessione in `processing` senza rimettere in coda il job, e uno nuovo non si
  può creare perché la chiave di idempotenza porta il fingerprint del
  trascritto e l'indice unico è globale. La sessione tornava viva e restava
  ferma per sempre.
- **Il timeout del compass è configurabile** (`AI_NOTES_COMPASS_TIMEOUT_MS`),
  così una generazione può girare fuori da Vercel, dove il tetto dei sessanta
  secondi non esiste.
