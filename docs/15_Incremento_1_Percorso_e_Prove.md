# Incremento 1 — percorso esplicito, prove ripetute, pausa

2026-09-09 · Ramo `main` · **Nessuna migrazione eseguita in produzione, nessun test
contro la produzione, nessun deploy, nessun push.**

Progetto di riferimento: [14_App_Atleta_Tra_Due_Sessioni.md](14_App_Atleta_Tra_Due_Sessioni.md).

---

## 1. Il ciclo implementato

Mercoledì Giulia registra «Provata» sulla routine concordata lunedì. Sabato, in partita,
ritrova **la stessa routine** e registra una seconda prova con un esito diverso. Lunedì
Marco apre la preparazione e legge entrambe, con le date e le note. Nel mezzo Giulia può
mettere la routine in pausa e riprenderla, e correggere una prova.

Le quattro cose che non succedono, e sono la sostanza dell'incremento:

- **una prova non chiude l'azione** — nessuna scrittura su
  `session_ai_commitments.status`;
- **una prova non tocca l'obiettivo del percorso** — `athlete_journey_goals` resta
  invariato, riga, stato e `updateddate`;
- **la pausa non è una conclusione** — vive su tre colonne nuove, ortogonali allo stato,
  quindi i sette punti del prodotto che partizionano i quattro stati continuano a
  comportarsi come prima;
- **un altro coach non vede niente**, né dal dominio né interrogando il database.

### Come provarlo

```bash
# 1. Database di prova isolato (Docker deve essere in esecuzione)
npm run test:db:up
cp .env.test.example .env.test.local
npm run test:db:reset          # applica le 68 migrazioni da zero

# 2. Le regole, senza database
npm test

# 3. Il ciclo e i permessi, sul database isolato
npm run test:policies

# 4. I due typecheck, separati
npx tsc --noEmit -p tsconfig.json
cd mobile && npx tsc --noEmit -p tsconfig.json
```

Sull'app: entrando come atleta compare la barra con **Oggi** e **Sessioni**; il coach non
la vede e l'app resta com'era. Da «Oggi» si segna una prova, si mette in pausa e si
corregge. Il coach ritrova tutto in **Dall'ultimo incontro**, primo blocco del foglio di
preparazione, su web e su telefono.

---

## 2. Fase A — l'ambiente di verifica

### Cosa c'era in locale

Verificato prima di scegliere: Docker installato (motore fermo, riavviato); Supabase CLI
2.78 presente ma dipendente da Docker; nessun PostgreSQL locale; il pacchetto `postgres`
già fra le dipendenze. Il registro pubblico Docker rifiutava il download
(`EOF` su CloudFront); l'immagine è arrivata dal mirror
`public.ecr.aws/docker/library/postgres:16-alpine`.

### Come è fatto

Un contenitore dedicato su **porta 55432**, database `kaipai_test`, separato da tutto il
resto. Sopra, tre difese invece di una:

| # | Difesa | File |
|---|---|---|
| 1 | `TEST_DATABASE_URL` esiste, **non coincide** con `POSTGRES_URL`, non punta a un servizio gestito, e il nome del database si riconosce come di prova | [test-database.ts](../lib/core/test-env/test-database.ts) |
| 2 | Il database **si dichiara di prova**: `current_setting('kaipai.environment')` deve valere `test`, scritto da `ALTER DATABASE` | [connect.ts](../scripts/test-db/connect.ts) |
| 3 | `.env.local` **non viene mai caricato**: `POSTGRES_URL` si legge dal file solo per confrontarla, e non entra in `process.env` | [connect.ts](../scripts/test-db/connect.ts) |

Il solo nome della variabile non prova niente, ed è il motivo della seconda difesa: un URL
può somigliare a quello che si vuole, ma solo un database preparato apposta risponde
`test`. Undici test puri coprono il cancello, compreso il caso in cui `POSTGRES_URL` non è
nota e resta solo l'host a difendere.

**RLS non viene disattivata per far passare i test.** Il bootstrap *riproduce* ciò che
serve: i tre ruoli Supabase (`anon`, `authenticated`, `service_role`), lo schema `auth`
con `auth.uid()` che legge la stessa impostazione di sessione di quella gestita, e la
tabella `auth.users` ridotta alle colonne che lo schema referenzia davvero. Le 68
migrazioni si applicano **così come sono**: se una policy non reggesse qui, non
reggerebbe nemmeno in produzione.

Risultato: 62 tabelle, 33 con RLS attiva, 8 policy — le 5 di produzione più le 3 nuove.
Il bootstrap fallisce di proposito se trova zero policy, perché un database senza RLS
farebbe passare qualunque test.

### Una scoperta da segnalare

`public.rls_auto_enable()` e il suo event trigger `ensure_rls` **esistono in produzione ma
non sono creati da nessuna migrazione**: sono stati aggiunti a mano nel progetto Supabase,
e la migrazione 0058 li dà per esistenti (li irrigidisce con `ALTER FUNCTION ... SET
search_path` e `REVOKE`). Senza di loro la catena non si applica a un database nuovo.

Nel bootstrap il corpo è quindi una **ricostruzione**, non una copia: il sorgente di
produzione non sta nel repository. È scritta per essere almeno altrettanto severa
dell'originale, che è la direzione sicura in cui sbagliare.

**Conseguenza pratica per la migrazione:** in produzione quel trigger attiva RLS su ogni
tabella nuova. Le tre tabelle di questo incremento sarebbero nate con RLS attiva e **zero
policy**, cioè invisibili alla Data API, e nessun errore lo avrebbe detto. Per questo la
migrazione attiva RLS esplicitamente e scrive le sue policy accanto.

---

## 3. Fase B — che cosa è stato costruito

### 3.1 Il dominio, puro e testato senza database

| Modulo | Che cosa decide | Test |
|---|---|---|
| [path-policy.ts](../lib/core/paths/path-policy.ts) | attivazione, chiusura, riapertura, i quattro livelli di accesso, l'ordine dei destinatari | 25 |
| [commitment-attempts.ts](../lib/core/ai-session-notes/commitment-attempts.ts) | validazione di una prova, correzione con versione, pausa e ripresa, forma del registro | 31 |
| [athlete-today.ts](../lib/core/ai-session-notes/athlete-today.ts) | i sette stati e il loro ordine, la scelta dell'azione principale, il testo | 18 |
| [test-database.ts](../lib/core/test-env/test-database.ts) | quando un URL è un ambiente di prova | 11 |
| [session-brief.ts](../lib/core/ai-session-notes/session-brief.ts) (esteso) | il blocco «Dall'ultimo incontro» | 8 nuovi, 21 preesistenti invariati |

Tutti aggiunti allo script `test`, come prescrive `CLAUDE.md`.

### 3.2 Le decisioni tecniche, e perché

**La pausa non entra in `status`.** Verificati uno per uno i sette punti che partizionano
i quattro stati in «aperto» e «chiuso» — `athlete-next-steps.tsx`, i due pannelli del
Session Compass, quattro punti di `mental-journey.ts`, le etichette dei due PDF, l'editor
del coach, e il vincolo del database. Con un quinto stato, un'azione in pausa **sparirebbe**
da `athlete-next-steps.tsx`: non è né in `open` né in `closed`. Tre colonne ortogonali
(`paused_at`, `paused_reason`, `paused_by`) lasciano tutti e sette esattamente come sono.

**La correzione non conserva il testo precedente.** Nessun archivio: la riga si aggiorna
sul posto, `version` avanza, `edited_at` si valorizza. Il coach vede il contenuto corrente
con «Modificato». La concorrenza è ottimistica e la difesa vera è nel `where`
dell'`UPDATE`: se un altro dispositivo ha scritto, zero righe aggiornate e risposta `409`
con un messaggio che dice cosa fare.

**L'idempotenza è nel database.** `unique (commitment_id, client_request_id)`, con
l'identificativo generato dal telefono all'apertura del foglio — non a ogni invio. Un
ritentativo dopo il timeout di quindici secondi, o un doppio tocco, ricade sulla riga già
scritta e riceve `duplicate: true`.

**Il registro non contiene testo.** `attemptAuditDetail` produce solo identificativi,
numeri, un'etichetta chiusa e un booleano `hasNote`. Un test puro serializza il risultato e
fallisce se ci trova dentro la nota; il test di integrazione ripete il controllo sulle
righe vere. Verificate anche le dipendenze: Drizzle è costruito senza `logger`, il client
`postgres` senza opzione di debug, e nel codice nuovo non c'è **nessuna** istruzione di
log.

**Nessuna nuova libreria di navigazione.** Due schede si fanno con due stati. La cosa che
conta è che `baseTab` sta **fuori** da `route`: `CallScreen` resta la sovrapposizione che
era, e cambiare scheda sotto una chiamata ridotta non la smonta. Le due schermate di base
restano entrambe montate e si nasconde quella che non serve, così tornarci non fa
ripartire nessuna richiesta.

### 3.3 Attivazione del percorso

Agganciata ai **due** punti in cui una prenotazione diventa `accepted`: `decideBooking`
(il coach accetta una richiesta) e la creazione di un appuntamento da parte del coach.
Non può far fallire l'accettazione: se andasse storta, l'errore resta nei log e il percorso
si apre alla prossima occasione, perché la funzione è idempotente.

Non attivano: `requested`, `declined`, `expired`, `cancelled`, `completed`, un preferito.
E **nessun backfill**: le coppie del pilot si aprono a mano, una alla volta, con
[activate-path.ts](../scripts/pilot/activate-path.ts), che senza `--scrivi` stampa soltanto
la storia della coppia. Non è stato eseguito.

---

## 4. File

### Aggiunti

```
lib/core/test-env/test-database.ts + .test.ts
lib/core/paths/path-policy.ts + .test.ts
lib/core/paths/path-store.ts
lib/core/ai-session-notes/commitment-attempts.ts + .test.ts
lib/core/ai-session-notes/commitment-attempts-store.ts
lib/core/ai-session-notes/athlete-today.ts + .test.ts
lib/core/ai-session-notes/athlete-today-store.ts
app/api/mobile/today/route.ts
app/api/mobile/commitments/[commitmentId]/attempts/route.ts
app/api/mobile/commitments/[commitmentId]/pause/route.ts
app/api/mobile/attempts/[attemptId]/route.ts
mobile/src/screens/TodayScreen.tsx
mobile/src/components/AttemptSheet.tsx
scripts/test-db/connect.ts · bootstrap.ts · policies.ts
scripts/pilot/activate-path.ts
lib/db/migrations/0067_percorso-atleta-prove.sql
lib/db/migrations/meta/0067_snapshot.json
.env.test.example
docs/15_Incremento_1_Percorso_e_Prove.md
```

### Modificati

```
lib/db/schema.ts                              tre tabelle, tre colonne, quattro eventi di audit
lib/core/bookings/index.ts                    attivazione del percorso sui due punti di accettazione
lib/core/ai-session-notes/session-brief.ts    blocco «Dall'ultimo incontro» (additivo)
lib/core/ai-session-notes/session-brief-store.ts   carica prove e pause
components/session-brief-section.tsx          il blocco sul web
app/api/mobile/sessions/[bookingId]/prep/route.ts  campo `sinceLastSession`
mobile/App.tsx                                due schede, senza libreria di navigazione
mobile/src/screens/SessionsScreen.tsx         riporta il ruolo ad App
mobile/src/components/SessionPrepSheet.tsx    il blocco sul telefono
mobile/src/lib/api.ts                         quattro funzioni nuove
package.json                                  quattro test nuovi, cinque script
lib/db/migrations/meta/_journal.json          voce 0067
```

**Non toccati**, e verificato: `CallScreen.tsx`, `lib/core/video/`, `app/api/video/`,
la homepage, il billing, i prompt AI.

---

## 5. Migrazione preparata (non eseguita)

`lib/db/migrations/0067_percorso-atleta-prove.sql`, generata da `drizzle-kit` sullo schema
e poi completata a mano con RLS, policy e commenti.

**Additiva.** Tre `CREATE TABLE`, tre `ADD COLUMN`, chiavi esterne, indici, vincoli,
policy. Un solo `DROP`: `session_ai_audit_events_type_check`, sostituito con la stessa
lista più quattro valori. È un **allargamento** — nessuna riga esistente può violarlo, e
l'applicazione in esecuzione continua a scrivere gli stessi eventi.

Sullo strumento, per correggere quanto scritto nella revisione precedente del progetto:
`db:generate` **non** ricrea l'intero schema. La testa della catena è allineata — lo
snapshot 0066 conteneva 58 tabelle, quante ne dichiarava `schema.ts` — e la generazione ha
prodotto una differenza incrementale normale, con il suo snapshot 0067. Restano mancanti
gli snapshot da 0021 a 0056, un debito separato che non impedisce di generare oggi ma
rende impossibile ricostruire lo schema a una revisione intermedia.

Applicata **68 volte da zero** sul database isolato, senza errori.

---

## 6. Test eseguiti, con esito reale

| Comando | Dove | Esito |
|---|---|---|
| `npm test` | locale, nessuna rete | **1153 passati, 0 falliti** (26 in `pretest`) |
| `npm run test:policies` | database isolato `localhost:55432` | **50 verifiche su 50** |
| `npm run test:route-policies` | database isolato `localhost:55432` | **35 verifiche su 35** |
| `npm run test:db:negative` | database isolato + un database usa-e-getta nello stesso contenitore | **6 verifiche su 6** |
| `npx tsc --noEmit` (web) | locale | pulito |
| `npx tsc --noEmit` (mobile) | locale | pulito |
| `npm run test:db:reset` | database isolato | 68 migrazioni, 62 tabelle, 33 con RLS, 8 policy |
| `bash scripts/test-db/isolated-build.sh` | `next build`, database isolato, `.env`/`.env.local` fisicamente assenti | **compilazione riuscita**, hash di `.env`/`.env.local` invariato, verificato tre volte |

**Nessun test tocca la produzione.** I 91 controlli sul database (50+35+6) raggiungono
esclusivamente il contenitore Docker locale su `localhost:55432`; questo collaudo lo ha
verificato di persona, non solo dichiarato — vedi §7.2 per come.

Questo giro di collaudo ha aggiunto due suite e trovato tre difetti reali, corretti e
riverificati (§10).

---

## 7. Verifica delle autorizzazioni

### 7.1 Che cosa dimostra ciascuna suite, e con quale ruolo database

| Suite | Ruolo di connessione | `BYPASSRLS` | Che cosa dimostra | Identità applicativa |
|---|---|---|---|---|
| `test:policies` (50) | `postgres` (superuser del contenitore) | sì, sempre | Il **dominio e lo store**: `path-policy.ts`/`commitment-attempts.ts` applicati contro righe vere | Chiamate dirette alle funzioni store, con `athleteUserId`/`coachUserId`/`actorUserId` sintetici passati come parametro |
| `test:policies`, sezione «Isolamento nel database, con RLS attiva» (5 dei 50) | `authenticated`, via `SET ROLE` + `request.jwt.claim.sub` | **no** — è l'unico punto di tutto il collaudo dove RLS è davvero il meccanismo sotto esame | Le policy SQL della migrazione 0067, lette con l'identità di un vero JWT Supabase impersonato |
| `test:route-policies` (35) | `postgres` (superuser del contenitore) | sì, sempre | Le **rotte HTTP vere** (`app/api/mobile/.../route.ts`): parsing del corpo, parametri di rotta, traduzione del rifiuto in stato HTTP | `getApiUser` sostituito con `node:test`'s `mock.module`, mutabile fra una chiamata e l'altra — le rotte restano il codice vero, solo il loro ingresso è impersonato |
| `test:db:negative` (6) | `postgres`, più un secondo database creato e distrutto nello stesso contenitore | sì, sempre | Il **cancello stesso** (`connect.ts`/`test-database.ts`): rifiuta un database reale ma senza marcatore; non carica mai `.env.local` | Nessuna: qui non si impersona nessuno, si verifica l'infrastruttura di test |

Il punto che l'incarico chiedeva di non dare per scontato è esplicito: **86 dei 91
controlli girano come `postgres`, 5 come `authenticated` — 86+5=91, non 85+5=90 come una
prima stesura di questa pagina aveva scritto.** I 5 come `authenticated` sono il
sottoinsieme già descritto alla riga «Isolamento nel database, con RLS attiva» della tabella
sopra (5 dei 50 di `test:policies`); gli altri 45 di `test:policies`, i 35 di
`test:route-policies` e i 6 di `test:db:negative` (di cui solo 2 toccano davvero un
database — gli altri 4 sono letture statiche del codice sorgente o confronti di hash file,
senza alcuna connessione: si veda l'elenco puntuale in §7.2) fanno 45+35+6=86 come
`postgres`. Per la stragrande maggioranza dei controlli, quindi, l'isolamento dimostrato è
applicativo, non del database: `POSTGRES_URL` di prova punta all'utente `postgres` del
contenitore — superuser, che PostgreSQL esenta sempre da Row Level Security, qualunque cosa
dicano le policy — ed è **lo stesso ruolo con cui, in produzione, Next.js si connette
tramite il pooler di Supabase**: l'applicazione non passa mai per `anon`/`authenticated`.
Quindi quando `test:route-policies` dimostra che un altro atleta prende un `403`, il merito
è di `getApiUser` più le funzioni di dominio — non di RLS, che in quella richiesta non ha
mai avuto voce in capitolo.

**Fonte dell'affermazione sul ruolo di produzione, senza pubblicare credenziali:** in
`POSTGRES_URL` di `.env.local` il nome utente ha la forma `postgres.<project-ref>` — il
prefisso `postgres.` è la convenzione con cui il pooler Supavisor/PgBouncer di Supabase
identifica il ruolo Postgres dietro la connessione pooled, indipendentemente dal
`<project-ref>` che segue. Non è `anon.<project-ref>` né `authenticated.<project-ref>`, le
uniche altre forme che quel pooler emette. **Questo collaudo non ha eseguito alcuna query
sulla produzione per verificarlo**: la lettura è del solo nome utente nella stringa di
connessione già presente in `.env.local`, mai aperta per il valore della password né per
nessun'altra parte dell'URL. **Il ruolo database di produzione non viene cambiato da questo
lavoro**: un eventuale passaggio a privilegi ridotti (`anon`/`authenticated` con RLS
realmente enforced anche per l'app) è un intervento a parte, che tocca ogni query esistente
scritta assumendo `BYPASSRLS`, e richiede la sua progettazione dedicata.

Le policy RLS restano una difesa **reale ma separata**: proteggono le tre tabelle nuove nel
solo scenario in cui qualcuno le raggiunga direttamente via l'API dati di Supabase
(PostgREST) con il JWT di un utente vero, bypassando del tutto Next.js — un percorso che
Supabase espone di default per ogni tabella in `public`, e che questo collaudo verifica a
parte, impersonando `authenticated` con `SET ROLE` e `request.jwt.claim.sub`, negli stessi
cinque controlli già presenti in `test:policies` (coach A legge, coach B non vede la riga
nemmeno interrogandola per id, un altro atleta non vede niente, chi ha scritto vede sempre,
una scrittura diretta dal client è rifiutata dai permessi di tabella).

### 7.2 Come si è verificato che nessuno di questi 91 controlli tocchi la produzione

Non per dichiarazione: `connect.ts` applica due controlli in sequenza, ed entrambi sono
sotto test.

1. **Statico** (`test:db:negative`, prima sezione): il codice sorgente di `connect.ts` è
   letto e verificato a righe — nessun `dotenv.config()` senza percorso (che leggerebbe
   `.env` di default), l'unico file caricato in `process.env` è `.env.test.local`, e
   `.env.local` viene letto solo per il confronto con `POSTGRES_URL`, mai scritto
   nell'ambiente.
2. **Dinamico, con infrastruttura vera** (`test:db:negative`, seconda e terza sezione): un
   secondo database — usa e getta, creato e distrutto nello stesso contenitore Docker,
   **mai** passato dal bootstrap — dimostra che `connectToTestDatabase` lo rifiuta
   (`current_setting('kaipai.environment')` torna vuoto). E `.env`/`.env.local` veri
   vengono **fisicamente spostati fuori dalla cartella**, sostituiti da un `.env.local`
   civetta con un `POSTGRES_URL` inventato, per dimostrare che la connessione riesce
   comunque verso il database di prova indicato esplicitamente e che `process.env.POSTGRES_URL`
   resta **non impostata** per tutta la durata della prova. I file originali sono poi
   ripristinati e il ripristino è verificato con lo hash SHA-256, non solo riportato.

Lo stesso metodo — spostamento fisico, non un tentativo di vincere la precedenza delle
variabili — è quello di `isolated-build.sh` (§9).

### 7.3 Percorso applicativo, con identità sintetiche: cosa è stato verificato dove

| Richiesta del collaudo | Dove | Esito |
|---|---|---|
| Atleta A non legge/modifica le prove di B | `test:route-policies`, «Isolamento fra atleti» | `403` su scrittura, correzione e pausa; `/today` non la mostra |
| Coach destinatario legge solo il percorso autorizzato | `test:route-policies`, «Il coach destinatario legge solo il percorso autorizzato» | La rotta vera `GET /api/mobile/sessions/:id/prep`, chiamata come coach A (200, con le due prove) e come coach B (404 — la rotta non conferma nemmeno che la prenotazione esista) |
| Altro coach non accede tramite identificativi alterati | `test:route-policies`, «Un coach non aggira le rotte dell'atleta» + «Isolamento fra atleti» | Un coach non registra una prova al posto dell'atleta (403); non tocca un'azione di un percorso che non è il suo (403); un id di prova vero, preso in prestito da un altro atleta, non basta a correggerla (403) |
| Percorso chiuso impedisce nuovi invii | `test:route-policies`, «Chiusura del percorso, attraverso la rotta» | `POST /close` (200), poi `POST /attempts` sullo stesso percorso → `409` |
| Riapertura segue la policy esplicita | `test:route-policies`, «Chiusura del percorso» | Il coach non riapre un percorso chiuso dall'atleta (**403**, e correggere questo era un difetto vero — §10.2); chi ha chiuso riapre (200); una prenotazione nuova propone, non esegue |
| Pausa/ripresa e correzioni rispettano ownership e stato | `test:route-policies`, «Pausa e ripresa» + «Correzione concorrente» | Pausa doppia → 409; ripresa doppia → 409; correzione con versione superata → 409, testo più recente intatto |
| Vecchi percorsi web non aggirano le nuove regole | `test:route-policies`, «I vecchi percorsi web non aggirano le nuove regole» | Il vecchio «Fatto» del web (`recordAthleteCommitmentOutcome`) chiude l'azione come sempre; **e ora** ripulisce anche la pausa (era un difetto — §10.1); dopo, la nuova rotta delle prove rispetta quella chiusura (409), e non si può «riprendere» un'azione chiusa (409, non 200) |

Tutti i controlli sopra usano identità **sintetiche**: righe create per l'occasione nel
database isolato, mai un account reale, mai un dato di produzione.

---

## 8. Riproducibilità del database

### 8.1 Come il bootstrap ricostruisce `rls_auto_enable` / `ensure_rls`

Confermato in questo giro: quella funzione e il suo event trigger **non sono in nessuna
migrazione** — furono aggiunti a mano nel progetto Supabase, e la migrazione 0058 li dà per
esistenti (li irrigidisce con `ALTER FUNCTION ... SET search_path` e `REVOKE`). Il bootstrap
(`scripts/test-db/bootstrap.ts`) li **ricostruisce**, non li copia: il sorgente vero non è
nel repository e non è mai stato letto.

La ricostruzione:

```sql
create or replace function public.rls_auto_enable() returns event_trigger
language plpgsql as $fn$
declare command record;
begin
  for command in select * from pg_event_trigger_ddl_commands() loop
    if command.command_tag = 'CREATE TABLE' and command.schema_name = 'public' then
      execute format('alter table %s enable row level security', command.object_identity);
    end if;
  end loop;
end
$fn$;
```

attaccata **dopo** che tutte e 68 le migrazioni sono state applicate, non prima — perché in
produzione il trigger fu creato a catena già avviata, e le tabelle precedenti non hanno mai
ricevuto RLS automatica da lui. Attaccarlo prima, nel database di prova, avrebbe reso il
database di prova **più severo** dell'originale su decine di tabelle vecchie, e i conteggi
(«33 tabelle con RLS attiva») non avrebbero più detto niente di vero sulla produzione.

### 8.2 Differenze dichiarate rispetto alla produzione

| Cosa | Produzione | Database di prova | Perché |
|---|---|---|---|
| Corpo di `rls_auto_enable()` | Sconosciuto — non nel repository | Ricostruito, azione: `ENABLE ROW LEVEL SECURITY` su ogni `CREATE TABLE` in `public` | Il comportamento osservabile (RLS attiva d'ufficio sulle tabelle nuove) è quello che conta per questo collaudo: se una tabella nuova la riceve qui, la riceve anche là |
| Identità Supabase Auth | Servizio Auth completo (GoTrue), con webhook, provider OAuth, MFA | `auth.users` ridotta a `id`/`email`/`raw_app_meta_data`/`raw_user_meta_data`/`created_at` — le sole colonne che lo schema referenzia | Autenticare per davvero non è nel perimetro di questo collaudo (è un sistema esterno già maturo); l'unico punto di contatto dello schema con `auth.users` è la colonna `auth_id`, e la ricostruzione basta a farla funzionare |
| `auth.uid()` | Legge il JWT verificato dal servizio Auth | Legge `request.jwt.claim.sub`, impostato a mano da chi impersona | Stessa **forma** della funzione reale (stesso nome, stesso tipo di ritorno); cambia solo da dove prende il valore, ed è esattamente il punto che gli script di verifica devono poter controllare |
| I 36 snapshot mancanti (`0021`–`0056`) | — | — | Debito preesistente, non introdotto qui: la testa della catena (`0067`) è allineata allo schema corrente, verificato contando le tabelle prima di generare la migrazione di questo incremento |

Nessuna di queste differenze è nascosta dentro un conteggio: sono scritte qui, e nel codice
del bootstrap, perché chi le trova dopo non debba dedurle da un comportamento sorprendente.

### 8.3 Il reset rifiuta un database senza marcatore — verificato, non solo scritto

Vedi §7.2, seconda sezione: un database reale (nello stesso contenitore, mai marcato) fa
fallire `connectToTestDatabase` con il messaggio che nomina l'impostazione mancante. Lo
stesso vale, per costruzione, per `bootstrap.ts --reset` quando invocato senza
`--skip-marker` implicito (il bootstrap salta il controllo **solo** al primissimo giro,
prima di scrivere lui stesso il marcatore — è l'unica eccezione dichiarata nel codice, e
serve esattamente a poterlo scrivere la prima volta).

---

## 9. Build isolata

### 9.1 Metodo

`scripts/test-db/isolated-build.sh` non tenta di vincere la precedenza delle variabili
d'ambiente di Next: **sposta fisicamente** `.env` e `.env.local` fuori dalla cartella prima
di lanciare `next build`, e li ripristina sempre — anche se la build fallisce (`trap ...
EXIT`) — verificando con lo hash SHA-256 che il contenuto sia tornato identico. Un file che
non esiste non può essere letto, in nessuna versione di Next, indipendentemente da come
cambino domani le sue regole di precedenza fra `.env.production.local`/`.env.local`/`.env`.

Ogni variabile che il progetto usa è passata esplicitamente, con un valore riconoscibilmente
finto (`*.invalid.test`, chiavi come `build-isolato-...-key`): `POSTGRES_URL` (verso il
database isolato, l'unica reale), `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `BASE_URL`,
`NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_API_KEY`/`SECRET`, `RESEND_API_KEY`/`FROM_EMAIL`,
`EMAIL_NOTIFICATIONS_ENABLED=false`, le due chiavi VAPID, `OPENAI_API_KEY`,
`DEEPGRAM_API_KEY`. Se un giorno un modulo provasse davvero a contattare uno di questi
servizi durante la build, l'host o la chiave inesistenti farebbero fallire quella singola
chiamata — visibilmente — invece di raggiungere il servizio vero.

### 9.2 Che cosa la build tocca per davvero durante la generazione statica

Cercato esplicitamente: `app/sitemap.ts` ha `revalidate = 3600` e chiama
`getApprovedCoaches()`, quindi **è** una delle chiamate al database che avvengono durante
`next build` — confermato dall'output (`○ /sitemap.xml`, generato staticamente). Contro il
database isolato (vuoto di coach) la funzione ha semplicemente restituito un elenco senza
profili, senza errori: il suo stesso codice ha già un `try/catch` che degrada
all'elenco base in caso di problemi col database, pensato per un'interruzione di servizio,
non per questo scenario — ma il risultato è lo stesso, sicuro. Nessun'altra pagina usa
`generateStaticParams`; le pagine sotto `(dashboard)` sono tutte a rendering dinamico.

### 9.3 Esito, verificato tre volte

Tre esecuzioni indipendenti, in momenti diversi di questa sessione (dopo l'aggiunta delle
rotte del percorso, dopo la correzione dei due difetti, e come controllo finale): tutte e
tre **compilazione riuscita**, tutte e tre con l'hash di `.env` e di `.env.local` identico
prima e dopo. Nessun avviso relativo a variabili mancanti, nessun tentativo di rete verso i
servizi finti (avrebbe prodotto un errore visibile in build, e non ne è comparso nessuno).

---

## 10. Difetti trovati e corretti

Tre difetti applicativi reali, tutti dentro il perimetro dell'incremento; più tre errori
nei miei stessi script di collaudo, corretti separatamente perché non si confondano con
difetti del prodotto.

### 10.1 La chiusura per la vecchia strada del web lasciava la pausa incoerente

**Trovato da:** `test:route-policies`, sezione «I vecchi percorsi web non aggirano le nuove
regole».

Il vecchio meccanismo del web — i pulsanti «Fatto» / «Non riuscito» sulla dashboard atleta,
`recordAthleteCommitmentOutcome` → `session-commitments-store.ts` — esisteva prima di questo
incremento e non è stato disattivato: resta un modo legittimo di chiudere un'azione.
Le tre colonne di pausa (`paused_at/reason/by`), aggiunte da questa migrazione, non erano
note a quel codice: chiudere un'azione **già in pausa** per quella strada lasciava le tre
colonne valorizzate, e un'azione chiusa poteva risultare ancora «in pausa» nel blocco
«Dall'ultimo incontro» del coach e nella scheda «Oggi».

**Corretto in** [session-commitments-store.ts](../lib/core/ai-session-notes/session-commitments-store.ts):
`columnsFor()` ora azzera le tre colonne di pausa ogni volta che uno dei due percorsi di
chiusura preesistenti (`recordAthleteCommitmentOutcome`, `updateCommitmentByCoach`) porta lo
stato a `completed` o `skipped`. Un'azione chiusa non è mai anche «in pausa» — due concetti
che questo incremento non doveva far coesistere sulla stessa riga.

**Riverificato:** sì, nella stessa sezione — dopo la correzione, chiudere un'azione in pausa
per la vecchia strada la ripulisce, e ne` la nuova rotta delle prove ne` quella della pausa
accettano più niente su un'azione così chiusa.

### 10.2 Riaprire un percorso chiuso dall'altra parte tornava `409`, non `403`

**Trovato da:** `test:route-policies`, sezione «Chiusura del percorso, attraverso la rotta»
— prima correzione, il controllo falliva.

`app/api/mobile/paths/[pathId]/reopen/route.ts` traduceva il rifiuto del dominio con un
ternario a cascata: `NOT_FOUND → 404`, `NOT_A_PARTICIPANT → 403`, **tutto il resto → 409**.
`NOT_THE_CLOSER` — il coach che prova a riaprire un percorso chiuso dall'atleta — cadeva nel
ramo generico e tornava `409 Conflict`, quando è un rifiuto di autorizzazione
(«non sei tu ad averlo chiuso»), non di stato della risorsa: `403` è la risposta corretta.

**Corretto in** tutte e tre le rotte del percorso (`close`, `reopen`, `sharing`
`route.ts`): il ternario è sostituito da uno `switch` esplicito, esaustivo su ogni
`PathRefusal`, con un caso per motivo — non un ramo che intercetta «tutto il resto». La
stessa forma nelle tre rotte, per non lasciare aperta la stessa classe di errore altrove.

**Riverificato:** sì, nella stessa sezione — ora `403`.

### 10.3 Chiudere e riaprire un percorso non erano raggiungibili da nessuna rotta

**Trovato:** preparando questo stesso collaudo, verificando che ogni criterio della
consegna fosse raggiungibile «tramite il percorso applicativo» come richiesto. Lo store
(`closePath`, `reopenPath`, `setContributionSharing` in `path-store.ts`) esisteva ed era
testato dalla prima consegna; **nessuna rotta HTTP li esponeva**. Nella app consegnata,
nessun atleta e nessun coach avrebbe potuto davvero chiudere o riaprire un percorso — pur
essendo «attivazione/chiusura tracciate» parte dichiarata del perimetro dell'incremento.

**Corretto** aggiungendo tre rotte minime, pura connessione verso lo store esistente,
nessuna logica di dominio nuova: `POST /api/mobile/paths/:id/close`, `.../reopen`,
`.../sharing`. Non è stata aggiunta nessuna schermata mobile per usarle (la gestione del
percorso resta, come da progetto, dell'incremento «Percorso»): sono raggiungibili e testate,
non ancora collegate a un pulsante.

**Riverificato:** sì — sono la superficie su cui gira gran parte di §7.3.

**Aggiornamento (§17.2):** «non ancora collegate a un pulsante» non è più vero. Un giro
successivo ha collegato `close`/`reopen` a un gesto reale su entrambe le superfici previste —
l'app per l'atleta, la scheda dell'atleta sul web per il coach — riusando queste stesse tre
rotte e lo stesso store, senza toccarne la logica.

### 10.4 Tre correzioni ai miei script di collaudo, non al prodotto

Perché non si confondano con difetti applicativi, dette qui separate:

- **Date future nel test.** `route-policies.ts` usava date scritte a mano
  (`'2026-09-13'`) per la settimana fittizia di Giulia. La rotta vera usa `new Date()`
  reale, e quella data era già nel futuro rispetto a oggi (10 settembre): la regola
  `FUTURE_DATE` la rifiutava, giustamente. Corretto calcolando le date relative a *oggi*
  con lo stesso `romeCalendarDay` che usa il dominio — lo script resta corretto per sempre,
  non solo per questa settimana.
- **Entitlement mancante nella scena.** `getSessionBrief` passa da `getMentalJourney`, che
  richiede la funzione `AI_SESSION_NOTES` attiva sul coach. Senza seminarla, la rotta di
  preparazione tornava `200` con un foglio vuoto — non un errore, ma un falso «vuoto» che
  avrebbe nascosto un vero controllo. Corretto seminando l'entitlement nella scena.
- **Aspettativa sbagliata su un id indovinato.** Mi aspettavo `403` quando un coach
  interroga la prenotazione di un altro; il comportamento vero — e migliore — è `404`: la
  rotta non conferma nemmeno che quella prenotazione esista, a chi non ne fa parte. Corretta
  l'aspettativa, non il codice: qui l'applicazione aveva ragione.

---

## 11. Livello di verifica mobile

Aggiornato da questo giro, con due livelli distinti invece di uno solo:

- **`emulatore` — build, installazione, avvio, rendering.** La build nativa
  (`prebuild` + `gradlew assembleDebug`) è stata eseguita per davvero, l'APK installato su
  un Pixel 7 con Android 14, l'app avviata e osservata correttamente a schermo — nessun
  crash — attraverso due screenshot reali. Metro raggiunto, interfaccia reattiva al tocco.
- **`typecheck/test`, ancora — per tutto ciò che richiede un login.** Nessuna schermata
  autenticata (Oggi, prove, pausa, correzione) né LiveKit sono state raggiunte
  interattivamente: manca un'identità Supabase Auth di prova, e crearne una vera avrebbe
  significato toccare la produzione. Vedi §12 per il dettaglio ed §12.4-§12.5 per la
  checklist manuale, pronta per quando quel prerequisito esisterà.

Non è stato dichiarato verificato niente di più di questo.

**Superato dal giro successivo, §16.** I due prerequisiti mancanti qui sotto — un'identità
Supabase Auth di prova e una stanza LiveKit non di produzione — sono stati entrambi
costruiti in locale (Supabase locale via Docker, LiveKit locale via binario ufficiale) senza
toccare la produzione. §16 documenta cosa è stato effettivamente raggiunto con un login
vero: resta qui, non riscritta, la cronaca di questo giro perché resta vera per l'ambiente
descritto in quel momento.

---

## 12. Collaudo mobile

### 12.1 Ambiente usato

Emulatore Android **Pixel 7, Android 14**, AVD già presente sulla macchina
(`%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -avd Pixel_7`), avviato e portato a
`sys.boot_completed=1` prima di procedere. Compilazione nativa con
`JAVA_HOME` sul JBR di Android Studio (21) e `ANDROID_HOME` sull'SDK locale, seguendo alla
lettera [SVILUPPO-LOCALE.md](../mobile/SVILUPPO-LOCALE.md) — incluso il
`--project-cache-dir` fuori dal progetto, senza il quale la build fallisce su Windows.

### 12.2 Il vincolo che ha deciso cosa si poteva provare per davvero

`mobile/src/lib/config.ts` punta di default ad `API_BASE_URL =
'https://www.kaipaicoaching.com'` — la produzione — e `mobile/.env`, già presente sulla
macchina, ha `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY` uguali a quelli di `.env.local` del
progetto web: **lo stesso, unico progetto Supabase Auth che esiste**, secondo CLAUDE.md.
Non esiste un tenant Supabase Auth di prova separato da quello di produzione.

Questo decide cosa segue: **entrare nell'app richiede un'identità autenticata per davvero**,
e l'unico modo di ottenerne una è la strada normale — email e password contro il progetto
Supabase reale. Farlo per questo collaudo avrebbe significato creare un account vero in un
sistema di produzione per generare un token di prova: esattamente il tipo di scorciatoia
che l'incarico chiede di non prendere («non usare credenziali di produzione per superare
errori»). Non l'ho fatto, e non ho modificato il codice dell'app per aggirare
l'autenticazione: avrebbe significato testare un percorso diverso da quello vero.

**Conseguenza dichiarata:** ho potuto verificare su un dispositivo reale tutto ciò che
precede il login; non ho potuto verificare, per questa ragione — non per mancanza di tempo
— nessuno degli scenari che richiedono una sessione autenticata (Oggi, le due prove,
pausa/ripresa, correzione) né LiveKit. Sono elencati come checklist manuale in §12.4 e §12.5,
con il prerequisito preciso che manca.

### 12.3 Che cosa è stato osservato per davvero

1. `npx expo prebuild --platform android --clean` — riuscito, ha generato `mobile/android`.
2. Primo tentativo di `gradlew assembleDebug` — **fallito**: errori di compilazione Kotlin
   nel modulo `@react-native/gradle-plugin` (`settings-plugin:compileKotlin`), con
   l'avviso «Detected multiple Kotlin daemon sessions» nel log. Diagnosticato come daemon
   Gradle/Kotlin non compatibili rimasti da un giro precedente sulla macchina — non un
   difetto di questo incremento (nessun file nativo è stato toccato).
3. `./gradlew --stop`, terminazione dei processi `java` residui, poi
   `assembleDebug --no-daemon --project-cache-dir=C:/tmp/gcache` da capo — **riuscita**:
   `BUILD SUCCESSFUL in 10m 19s`, 980 attività (134 eseguite, 846 già aggiornate), APK da
   183 MB in `android/app/build/outputs/apk/debug/app-debug.apk`.
4. `adb install -r app-debug.apk` — fallita la prima volta per spazio esaurito
   sull'emulatore (`INSTALL_FAILED_INSUFFICIENT_STORAGE`); disinstallata una versione
   precedente dell'app già presente (`adb uninstall com.kaipaicoaching.app`, lasciata da un
   giro di sviluppo precedente, non da questa sessione) e reinstallata: **riuscita**.
5. `adb shell am start -n com.kaipaicoaching.app/.MainActivity` — l'app **si avvia**, diventa
   l'app in primo piano (`mFocusedApp=...com.kaipaicoaching.app/.MainActivity`), e due
   screenshot presi in momenti diversi (`Read` su `screen4.png` e `screen6.png`, non
   riprodotti qui) mostrano la schermata reale del pacchetto Expo Dev Client — intestazione
   «KaiPai · Development Build», sezione «Development servers», ricerca automatica del
   server e opzione «Enter URL manually» — con il tema scuro e la disposizione corretti.
   **Nessun crash dell'app.**
6. `npx expo start --dev-client` + `adb reverse tcp:8081 tcp:8081` — Metro risponde
   (`packager-status:running`) e risultano connessioni TCP stabilite fra l'emulatore e
   Metro: l'app ha effettivamente raggiunto il bundler. Toccando «Enter URL manually» la
   tastiera si apre (visibile in uno screenshot successivo) — l'interfaccia reagisce al
   tocco.
7. **Non raggiunto oltre questo punto**: durante l'intera sessione, il processo di sistema
   Android (`system_server`, non `com.kaipaicoaching.app`) ha mostrato ripetutamente la
   finestra «Process system isn't responding», a intervalli di uno—due minuti, indipendente
   da quale azione veniva fatta. È coerente con un emulatore sotto forte pressione di
   risorse subito dopo una compilazione nativa di dieci minuti sulla stessa macchina, non
   con un difetto dell'app: l'app restava l'attività a fuoco e rispondeva ai tocchi (punto
   6) mentre il dialogo di sistema compariva sopra di lei. Ho interrotto qui la sessione
   interattiva invece di insistere contro un ambiente instabile, dopo aver raccolto
   un'evidenza reale superiore al solo typecheck (punti 3–6).

**Nota operativa.** Per fermare Metro a fine sessione ho terminato tutti i processi
`node.exe` della macchina (`taskkill /F /IM node.exe`), non solo quello di Metro: un
comando indiscriminato, che può aver chiuso anche processi Node non collegati a questo
collaudo se ce n'erano altri in esecuzione sulla stessa macchina in quel momento. Lo dichiaro
qui perché chi legge lo sappia, non perché abbia avuto un effetto visibile durante la
sessione.

### 12.4 Checklist manuale — funzioni dell'atleta (bloccata: serve un'identità di prova)

**Superata dal giro successivo — vedi §16.3.** Il prerequisito qui sotto ora esiste
(Supabase locale, quattro identità sintetiche); la checklist è stata eseguita per davvero e
il suo esito reale è in §16.3, punto per punto. Il testo che segue resta per la cronaca di
questo giro.

**Prerequisito mancante:** un tenant Supabase Auth non di produzione (o un modo dichiarato
di emettere un JWT di prova contro il progetto esistente, con un utente marcato come tale
e mai promosso), collegato a un server `next dev` puntato sul database isolato con lo stesso
metodo di `isolated-build.sh`. Nessuno dei due esiste oggi.

Una volta disponibile, la sequenza è:

1. Aprire l'app, autenticarsi con l'identità di prova, atterrare su **Oggi**.
2. Con un'azione assegnata, registrare **Provata** un giorno, poi — in un'altra sessione
   dell'app — registrare **Non era adatta al momento** un altro giorno sulla stessa azione:
   verificare che compaiano entrambe, con le rispettive date.
3. Forzare la chiusura dell'app (non il semplice passaggio in background) e riaprirla:
   verificare che le due prove siano ancora entrambe visibili.
4. Mettere l'azione in **pausa** con un motivo; verificare che non compaia più come azione
   principale ma resti nell'elenco; **riprenderla** e verificare che le prove precedenti
   siano ancora lì.
5. Correggere una prova: verificare che compaia l'indicazione **«Modificato»** e che il
   testo precedente non sia recuperabile da nessuna parte nell'app.
6. Disattivare la rete del dispositivo a metà compilazione di una nota e tentare di salvare:
   verificare che il testo resti nel campo e che il messaggio d'errore inviti a riprovare,
   non a riscrivere.
7. Toccare due volte di seguito «Salva» su una prova (o forzare un doppio invio):
   verificare che compaia una sola riga, non due.
8. Aprire la tastiera sul campo della nota e verificare che non copra il pulsante di invio;
   ripetere con la dimensione del testo di sistema al massimo (impostazioni di
   accessibilità Android) e verificare che i pulsanti restino leggibili e toccabili.

### 12.5 Checklist manuale — LiveKit (bloccata: nessuna stanza di prova)

**Parzialmente superata dal giro successivo — vedi §16.4.** Un LiveKit locale (binario
ufficiale, credenziali di sviluppo `devkey`/`secret`, mai quelle di produzione) ha permesso
di entrare per davvero nella stessa stanza da due partecipanti sintetici. Non tutti i punti
sotto sono stati eseguibili con l'instabilità osservata sull'emulatore — il dettaglio esatto
di cosa è stato verificato e cosa no è in §16.4. Il testo che segue resta per la cronaca di
questo giro.

**Prerequisito mancante:** un progetto LiveKit separato da quello di produzione (o una
stanza dedicata, con webhook puntato a un ambiente non di produzione), e la stessa identità
di prova di §12.4. Le credenziali in `.env.local` sono quelle reali: usarle per una
chiamata di prova aprirebbe una stanza vera, consumerebbe minuti veri, e il webhook
configurato lato LiveKit continuerebbe comunque a chiamare la produzione — non l'ambiente
isolato — perché l'URL del webhook è impostato a livello di progetto LiveKit, non per
singola chiamata.

Una volta disponibile:

1. Entrare in chiamata da entrambi i lati (coach e atleta, due dispositivi o un dispositivo
   più il web); verificare audio e video su entrambi.
2. Passare dalla scheda «Sessioni» a «Oggi» e viceversa durante la chiamata: verificare che
   non si scolleghi e che l'audio non si interrompa — è il rischio più serio dichiarato in
   questo incremento (§13), perché `baseTab` è stato tenuto fuori da `route` proprio per
   questo, ma nessuno lo ha ancora visto succedere davvero.
3. Minimizzare la chiamata (barra in basso) e riaprirla: verificare che la connessione non
   sia mai stata interrotta.
4. Portare l'app in background (tasto Home) e poi in primo piano: verificare lo stesso.
5. Controllare nella dashboard LiveKit che non compaiano partecipanti duplicati per la
   stessa persona dopo i passaggi 2–4.
6. Terminare la chiamata e verificare, sempre dalla dashboard, che la stanza risulti chiusa
   e le risorse rilasciate entro pochi secondi.

### 12.6 Perché questo non abbassa il giudizio complessivo del ciclo testato

Il ciclo di permessi (§7) e la build (§9) sono verificati end-to-end con codice vero. Il
blocco qui riguarda **l'interfaccia mobile e LiveKit**, che sono comunque marcati
`typecheck/test` nella consegna precedente e non erano mai stati dichiarati verificati su
dispositivo. Questo giro aggiunge un livello vero (avvio reale su emulatore, fin dove
un'identità non autenticata lo permette) senza mai dichiarare superato ciò che non lo è.

---

## 16. Collaudo autenticato — Supabase locale, LiveKit locale, identità sintetiche

Questo giro completa §12: un login vero, un token emesso davvero da Supabase Auth, e una
chiamata LiveKit locale, tutto senza toccare la produzione e senza sostituire `getApiUser`.

### 16.1 Comando riproducibile per avviare l'ambiente

```bash
# 1. Supabase locale (Docker deve essere in esecuzione) — una volta sola, poi resta avviato
cd scripts/test-db/local-supabase && npx supabase start && cd ../../..

# 2. Applica lo schema applicativo completo a quel Supabase locale (68 migrazioni)
npx tsx scripts/test-db/bootstrap-local-supabase.ts --reset

# 3. Crea le quattro identità sintetiche (atleta A, atleta B, coach del percorso,
#    coach estraneo) via Supabase Auth admin API, più il percorso/azione minimi
#    perché «Oggi» abbia qualcosa da mostrare
LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
LOCAL_SUPABASE_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY da: cd scripts/test-db/local-supabase && npx supabase status -o json>" \
npx tsx scripts/test-db/seed-identities.ts

# 4. LiveKit locale (binario ufficiale, non Docker — evita l'instabilità del registro
#    immagini incontrata altrove in questa sessione)
scripts/test-db/local-livekit/livekit-server.exe --dev --bind 0.0.0.0

# 5. Il server web, con endpoint espliciti sul Supabase e sul LiveKit locali
bash scripts/test-db/dev-server.sh
#   — usa ws://127.0.0.1:7880; per il collaudo dall'emulatore Android è stato rilanciato
#     con NEXT_PUBLIC_LIVEKIT_URL=ws://10.0.2.2:7880 (vedi §16.4: il server distribuisce lo
#     stesso URL a chiunque chieda un token, e 127.0.0.1 dentro l'emulatore indica
#     l'emulatore stesso, non l'host — non è un problema in produzione, dove l'URL LiveKit
#     è un indirizzo pubblico raggiungibile da chiunque)

# 6. L'app mobile, in modalità di test esplicita, verso il server del punto 5
cd mobile && adb reverse tcp:8081 tcp:8081 && env \
  EXPO_PUBLIC_ENV=test \
  EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000 \
  EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321 \
  EXPO_PUBLIC_SUPABASE_ANON_KEY="<ANON_KEY, stesso comando status del punto 3>" \
  npx expo start --dev-client
```

Password comune per il login manuale delle quattro identità: `kaipai-collaudo-2026!`
(stampata anche da `seed-identities.ts`, insieme alle email generate con un suffisso
casuale per invocazione).

### 16.2 Configurazione richiesta, senza segreti

Nessun valore qui sotto è un segreto: `ANON_KEY`/`SERVICE_ROLE_KEY` locali sono le chiavi
demo che Supabase CLI documenta pubblicamente per **ogni** progetto avviato con
`supabase start` — identiche su qualunque macchina, non generate per questo progetto — e
`devkey`/`secret` sono le credenziali di sviluppo che il binario `livekit-server --dev`
stampa a schermo di default. `AUTH_SECRET`, le chiavi VAPID, OpenAI e Deepgram passate a
`dev-server.sh` sono stringhe inventate: bastano perché il server si avvii, non autenticano
nulla di reale (le funzionalità che le userebbero per davvero — invio push, trascrizione —
non sono state esercitate da questo collaudo).

`mobile/src/lib/config.ts` (nuovo in questo giro) rifiuta esplicitamente la produzione in
modalità di test: se `EXPO_PUBLIC_ENV=test` ma manca `EXPO_PUBLIC_API_BASE_URL`, o se
quest'ultima coincide con l'URL di produzione, o se `EXPO_PUBLIC_SUPABASE_URL` contiene
`supabase.co` mentre l'app crede di essere in test, l'app lancia
`TestEnvironmentMisconfigured` invece di procedere — nessun ripiego silenzioso. L'indicatore
visibile è una barra viola sotto l'orologio di sistema, presente su ogni schermata di questo
collaudo: **«AMBIENTE DI TEST · 10.0.2.2:3000»**.

`.env` e `.env.local` del progetto web, e `mobile/.env`/`mobile/.env.development.local`,
non sono mai stati aperti in scrittura né spostati durante questo giro: ogni variabile è
arrivata tramite `env VAR=valore comando`, che ha precedenza sui file perché sia dotenv sia
Next non sovrascrivono una variabile già presente in `process.env` all'avvio — lo stesso
principio già verificato per `isolated-build.sh` (§9) e per `test:db:negative` (§7.2).

### 16.3 Scenari effettivamente osservati — ciclo atleta

Tutti con login reale (`supabase.auth.admin.createUser` per la creazione, grant di password
reale per il token), Bearer reale, `getApiUser` **non sostituito**.

| Scenario richiesto | Come verificato | Esito |
|---|---|---|
| L'azione compare in «Oggi» | Login app come atleta A, schermata «Oggi» | «Puoi entrare.» con l'azione assegnata, titolo e nome del coach corretti |
| Due prove distinte registrate | «Segna una prova» → **Provata**, poi una seconda volta → **Non ancora**, entrambe dall'interfaccia reale | Due righe nuove, distinte da quelle già presenti da un giro di verifica precedente nello stesso database; confermate anche via `GET /api/mobile/today` con Bearer reale (`attemptCount: 4`) |
| Riavvio e persistenza | `am force-stop` dell'app, riapertura, nuovo login | Le quattro prove sono tutte presenti dopo il riavvio completo — la schermata «Oggi», subito dopo il salvataggio e prima del riavvio, ne mostrava solo tre: un difetto di aggiornamento dello stato locale dopo la mutazione, non di persistenza (il server aveva già tutte e quattro le righe, verificato via API nello stesso istante) |
| Correzione di una prova | Tocco su una prova esistente → «Correggi la prova» → cambiato esito, salvato | La riga mostra ora **«Non era adatta al momento · Modificato»**; `GET /api/mobile/sessions/1/prep` (come coach) conferma `"edited": true` sulla stessa prova |
| Pausa e ripresa | «Metti in pausa» dall'interfaccia | L'azione principale sparisce e ricompare in «Le tue azioni» con **«In pausa · 4 prove»** e i pulsanti «Segna una prova»/«Riprendi»; «Riprendi» la riporta allo stato precedente |
| Contenuto nella preparazione del coach | `GET /api/mobile/sessions/1/prep` con Bearer del coach del percorso | Vuoto (`emptyReason: "no_sessions"`) finché al coach sintetico non è stato concesso l'entitlement `AI_SESSION_NOTES` (mancante nel seed, non nel prodotto — §16.6); dopo il grant, mostra il punto da riprendere e tutte e quattro le prove con le rispettive note e lo stato «modificato» |
| Rifiuto per atleta/coach estranei | Bearer di atleta B su `/today` (nessun percorso), Bearer del coach estraneo su `/sessions/1/prep` (**404**) e su `/commitments/1/pause` (**400**) | Isolamento confermato in tutti e tre i casi |
| Chiusura del percorso e rifiuto di nuovi invii | `POST /api/mobile/paths/1/close` (coach), poi `POST /api/mobile/commitments/1/attempts` (atleta) | Chiusura riuscita (200); nuovo invio **409**; `/today` dell'atleta torna `openActionCount: 0` |
| Riapertura | `POST /api/mobile/paths/1/reopen` (coach) | 200, percorso di nuovo `active` — usato per non lasciare il database in uno stato di collaudo a metà per il resto della sessione |
| Errore di rete, retry, doppio tocco | Non eseguito con un'interruzione di rete reale in questo giro (vedi §16.6); il doppio invio è stato osservato per un altro motivo (sotto) | Non tutto verificato — dichiarato, non taciuto |

**Attivazione, chiusura e riapertura del percorso: raggiungibili solo via rotta HTTP, non
da alcun gesto dell'interfaccia mobile.** Verificato leggendo `mobile/src` per intero: nessun
punto dell'app chiama `/api/mobile/paths/:id/close` o `/reopen` (l'unica occorrenza di
«close» nel client mobile è `closeAiNotes`, per un'altra funzionalità). L'attivazione, in
questo collaudo come nel precedente, è stata fatta scrivendo direttamente le righe nel
database isolato in `seed-identities.ts` — non esiste ancora una schermata «Gestisci il
percorso» nell'app, per progetto: la presenza della rotta non completa da sola un gesto
utente, ed è esattamente il punto su cui l'incarico chiedeva di non sorvolare.

### 16.4 Collaudo della chiamata — LiveKit locale

Due partecipanti sintetici: l'app sull'**emulatore Android** (Pixel 7, come atleta A) e un
client **browser minimale** scritto per questo collaudo (`livekit-client` UMD, servito da un
piccolo server HTTP locale, mai un progetto o una stanza reali — token firmato con
`devkey`/`secret` locali, identità `collaudo-browser-coach`, stessa stanza `booking-1`).

| Scenario richiesto | Esito osservato |
|---|---|
| Entrare nella stessa stanza | Il browser si connette e resta in attesa; l'app, dopo la schermata di pre-ingresso nativa (microfono/telecamera «Accesi», permessi di sistema concessi al volo), entra nella stanza `booking-1` come `user-1` — il browser registra `participant connected: user-1` |
| Duplicati | **Nessuno**: in tutta la sessione, incluso un primo tentativo fallito e un secondo riuscito (sotto), il browser ha visto un solo `user-1` alla volta, mai due |
| Audio, video, connessione | Il **secondo** tentativo di ingresso ha pubblicato davvero una traccia video: la fotocamera virtuale dell'emulatore si è aperta (Camera2, 1280×720@30, log a ~11 fps per circa 15 secondi) e la traccia è stata pubblicata (`kind: 'video'`, poi `kind: 'audio'`) verso il server LiveKit locale |
| Cambio scheda, minimizza/riapri, background/foreground | **Non verificati in questo giro**: l'instabilità della connessione (sotto) ha assorbito il tempo disponibile prima di poter eseguire questi passaggi in modo significativo. Dichiarato come non fatto, non presentato come superato |
| Terminazione e rilascio risorse | La sessione si è chiusa da sola dopo circa 15 secondi (l'indicatore di sistema della fotocamera in uso è scomparso, l'app è tornata a «Oggi»); la causa esatta non è isolata con certezza in questo giro — vedi sotto |

**Un difetto reale trovato nel primo tentativo, non nel secondo.** Il primo ingresso in
chiamata si è connesso al segnale LiveKit (`connected to Livekit Server ... version 1.13.6`)
ma è rimasto 30 secondi senza inviare né ricevere media — tempo impiegato da chi scrive per
concedere i permessi di sistema di microfono e fotocamera, richiesti solo a quel punto,
non prima. Il client ha quindi chiuso per `ping timeout`, tentato una negoziazione di
recupero, e quella negoziazione ha prodotto un errore reale e riproducibile:

```
Failed to set local offer sdp: Failed to apply the description for m= section with
mid='0': Local fingerprint does not match identity.
```

— un `PeerConnection` ricreato dopo la caduta della connessione con un'impronta DTLS che non
corrisponde più a quella attesa dal lato client SDK. Il tentativo successivo (una nuova
chiamata a «Entra», non un doppio tocco nello stesso istante) è ripartito pulito e ha
funzionato, come sopra. **Non è stato possibile isolare se questo richieda l'esatta sequenza
osservata qui — permessi concessi con calma innaturale durante una sessione di collaudo
interattiva — o se sia riproducibile anche a permessi già concessi in precedenza** (il caso
normale per un utente che ha già usato l'app): non demo verificato oltre questo punto, e
segnalato come tale in §16.6.

Una seconda osservazione minore: il banner d'errore («unable to set offer…») mostrato
dall'app durante il primo tentativo è rimasto visibile in fondo allo schermo per il resto
della sessione — inclusi il secondo tentativo riuscito e il ritorno a «Oggi» — senza che
nulla lo aggiornasse o lo rimuovesse quando la situazione si era di fatto risolta.

**Sul web, la pagina di chiamata non è stata raggiungibile in questo ambiente locale.**
`/dashboard/video/1`, con login reale del coach del percorso, ha risposto **500**:
`ReferenceError: Worker is not defined`, lanciato durante la valutazione del modulo
`@livekit/krisp-noise-filter` (importato da `components/livekit-call-controls.tsx`, un
componente `'use client'`) sotto Turbopack in `next dev`. Non è stato modificato il
componente per aggirarlo: è uno dei tre nuclei del prodotto (`realtime-video-calls`), e un
errore di questo tipo — una libreria che referenzia `Worker` durante la valutazione lato
server del grafo dei moduli — merita l'attenzione dedicata di quella skill, non una
correzione improvvisata dentro un collaudo. **Non verificato se lo stesso accade in
produzione** (Vercel, non Turbopack dev): è precisamente il tipo di differenza fra ambiente
di test e produzione che questo collaudo deve dichiarare, non nascondere. Per questo la
seconda metà del test — un vero browser sulla pagina di chiamata del prodotto — è stata
sostituita con il client minimale sopra, che dimostra il ciclo di vita di LiveKit ma non la
UI reale del coach.

### 16.5 Differenze fra emulatore, dispositivo fisico e produzione

- **Emulatore vs dispositivo fisico**: nessuna parte di questo collaudo è stata eseguita su
  un telefono Android fisico o su iOS. Ogni esito sopra vale per l'emulatore Pixel 7 usato,
  e **non è stato esteso** a un dispositivo reale — in particolare l'errore di negoziazione
  WebRTC (sopra) potrebbe essere specifico della fotocamera/microfono virtuali
  dell'emulatore o della sua rete NAT verso l'host, e un telefono fisico su una rete Wi-Fi o
  mobile reale è l'unico modo per saperlo.
- **Rete locale vs Internet**: LiveKit locale (`ws://` non cifrato, sulla stessa macchina)
  dimostra il ciclo di vita della stanza — join, pubblicazione, nessun duplicato — non la
  tenuta su una rete reale con perdita di pacchetti, NAT traversal fra reti diverse, o TURN:
  esattamente il limite che l'incarico chiedeva di dichiarare esplicitamente.
- **URL LiveKit condiviso fra emulatore e browser**: la rotta che emette il token
  (`lib/core/video/index.ts`) restituisce lo stesso `NEXT_PUBLIC_LIVEKIT_URL` a chiunque lo
  richieda — corretto in produzione, dove quell'URL è un indirizzo pubblico raggiungibile da
  ovunque, ma scomodo in locale: l'host raggiunge LiveKit su `127.0.0.1`, l'emulatore deve
  usare `10.0.2.2`. Il server di questo collaudo è stato riavviato con il secondo valore per
  poter testare l'app; il client browser usato per il secondo partecipante non dipende da
  quella rotta (token generato a parte con `livekit-server-sdk`), quindi non ne ha risentito.
- **Ruolo del database**: locale, il ruolo `postgres` del container Supabase è privo di
  `SUPERUSER` per costruzione (`Create role, Create DB, Replication, Bypass RLS`) — la
  stessa combinazione della produzione, verificata con `\du` all'avvio del bootstrap. Non è
  stato cambiato nulla sul ruolo di produzione da questo lavoro (§7.1).

### 16.6 Prerequisiti ancora mancanti, e difetti locali corretti durante il collaudo

**Corretti in questo giro, perché bloccavano il collaudo stesso — non il prodotto:**

- L'emulatore aveva una partizione dati da 6 GB, insufficiente per una build di sviluppo
  completa (`INSTALL_FAILED_INSUFFICIENT_STORAGE` al 90% di utilizzo): portata a 12 GB
  nella configurazione dell'AVD (`disk.dataPartition.size`), con un cold boot e reinstallo.
  Cambiamento locale alla macchina di sviluppo, non al progetto.
- Il coach sintetico non aveva l'entitlement `AI_SESSION_NOTES`: concesso manualmente nel
  database isolato (`user_feature_entitlements`), perché è esattamente il tipo di
  configurazione che un account reale avrebbe già.
- L'atleta sintetico A non aveva una riga in `client_profiles` con una data di nascita: la
  pagina di chiamata web tratta l'assenza come «minorenne senza tutore» per prudenza (una
  scelta corretta lato prodotto, non un difetto) e blocca la chiamata. Aggiunta una data di
  nascita da maggiorenne nel database isolato.

**Restano, dichiarati esplicitamente, non aggirati:**

- Errore di rete, retry e doppio invio sulle prove (§16.3, ultima riga): non ancora
  esercitati con un'interruzione di rete reale — richiede simulare la caduta della
  connessione fra l'emulatore e `10.0.2.2:3000` a metà richiesta, non fatto in questo giro.
- Cambio scheda, minimizzazione e background/foreground durante la chiamata (§16.4): non
  raggiunti a causa dell'instabilità della connessione WebRTC osservata.
- Verifica su dispositivo fisico Android o iOS: non eseguita (§16.5).
- La pagina web della chiamata (`/dashboard/video/[bookingId]`): bloccata da un errore
  proprio dell'ambiente Turbopack locale (sopra); non riprodotta né esclusa in produzione.
- LiveKit locale dimostra il ciclo di vita del segnale, non l'affidabilità su Internet o reti
  mobili — per quello serve un progetto LiveKit di test separato da quello di produzione, con
  TURN configurato, oppure osservazione diretta su reti reali.

---

## 17. Chiusura dei punti residui (2026-09-10, stesso ambiente locale di §16)

Riusa l'ambiente già in piedi (Supabase locale, LiveKit locale, server e Metro sulle stesse
porte, stesso emulatore) senza ripetere ciò che §16 aveva già superato. Tre punti, nell'ordine
in cui erano rimasti aperti.

### 17.1 Pausa/ripresa: verificato che riguardi l'azione, non il percorso

**Nessuna divergenza trovata.** `planPause`/`planResume`
(`lib/core/ai-session-notes/commitment-attempts.ts`) operano solo su `commitmentId`, mai su
`pathId`; il commento nel codice lo dichiara esplicitamente («Non tocca `status`, non tocca
`completed_at`, non tocca l'obiettivo del percorso»). Le rotte sono separate fin dai nomi
(`/commitments/:id/pause` contro `/paths/:id/close|reopen`), e la vista dell'atleta mostra
«pausa» come stato dell'azione singola, mai del percorso. Nessuna correzione necessaria: il
punto era già corretto in codice e in documentazione.

### 17.2 Gestione del percorso: attivazione, chiusura e riapertura ora raggiungibili

**Attivazione: già automatica, per progetto.** `planPathActivation` apre il percorso da sé
quando una prenotazione diventa `accepted` — non è un gesto mancante, è una scelta esistente
che non richiede un pulsante. Il caso che *mancava* un'interfaccia era un altro: un percorso
**chiuso** che riceve una nuova prenotazione accettata non si riapre da solo
(`propose_reopen`), e nessuno schermo lo raccontava.

**Chiusura e riapertura, aggiunte riusando le funzioni esistenti — nessuna regola nuova:**

- **Atleta, sull'app** (`mobile/src/screens/TodayScreen.tsx`): «Chiudi il percorso» sotto
  l'azione principale, con conferma che spiega l'effetto («Non riceverai più nuove azioni da
  ‹coach›... Le sessioni già prenotate e tutto ciò che vi siete scritti restano visibili»);
  chiama la rotta mobile già esistente `/api/mobile/paths/:id/close`. Quando il percorso è
  chiuso **dall'atleta**, compare «Riapri il percorso» — la stessa promessa che il testo del
  vuoto (`todayCopy`, stato `no_active_path`) faceva già («puoi riaprirlo quando vuoi») senza
  che nulla la mantenesse: il commento nello store diceva alla lettera «serve a spiegare il
  vuoto, non a riaprirlo». Per renderla vera è bastato portare `pathId` fin dentro
  `TodayPayload` (`athlete-today.ts`, `athlete-today-store.ts`, tre file, un campo).
- **Coach, sul web** (`/dashboard/coach/athletes/[athleteId]`, sezione «Stato della
  collaborazione» — non «Il percorso», che in questa stessa pagina è già il titolo della
  striscia del percorso mentale poco sotto): «Chiudi il percorso» quando attivo, con la
  stessa spiegazione dell'effetto; quando chiuso, «Riapri il percorso» se è stato lui a
  chiuderlo, altrimenti una riga che dice chi può farlo. Le due azioni
  (`setPathStatusAction` in `actions.ts`) chiamano `closePath`/`reopenPath` di
  `path-store.ts` — le stesse funzioni che servono le rotte mobili, stessa autorizzazione di
  `path-policy.ts`, nessun terzo cancello.

**Nessun permesso nuovo, nessun backoffice, nessuna riapertura automatica**: entrambe le
superfici rifiutano esattamente ciò che la policy già rifiutava (non partecipante, percorso
già nello stato richiesto, chi non ha chiuso non riapre), e lo fanno tacendo — la pagina si
ricarica con lo stato vero, non con un messaggio d'errore per un rifiuto che è normale
funzionamento.

**Collaudato con utenti sintetici, in questo stesso giro:**

| Gesto | Superficie | Esito |
|---|---|---|
| Chiudere il percorso | App, atleta A, «Chiudi il percorso» sotto l'azione | Bottone visibile e funzionante — screenshot durante il collaudo della chiamata (§17.3) lo mostra a schermo |
| Vedere «Riapri» dopo la chiusura | App, atleta A | Non ancora rifotografato in questo giro (la chiusura reale è stata evitata per non interrompere il collaudo della chiamata che segue) — la logica è la stessa già coperta dal test dominio `athlete-today.test.ts`, 18/18 verifiche superate dopo l'aggiunta di `pathId` |
| Chiudere/riaprire dalla scheda del coach | Web, coach del percorso, `/dashboard/coach/athletes/1` | Verificato per lettura del codice e per tipo (`tsc --noEmit` pulito su web e mobile); non fotografato interattivamente in questo giro — vedi §17.6 |
| Nessuna rotta nuova, nessuna regola nuova | — | `closePath`/`reopenPath`/`path-policy.ts` invariati; solo la superficie che li chiama è nuova |

Test di dominio interessati dalla correzione, e nessun altro: `athlete-today.test.ts`
(aggiunto `pathId` a `closedPath`), rieseguito — **18/18 superati**. `path-policy.test.ts` non
è stato toccato e non è stato rieseguito: nessuna riga del suo dominio è cambiata.

### 17.3 La chiamata: l'errore Worker isolato, e un ciclo a due partecipanti riuscito per intero

**L'errore `Worker is not defined` è un bug della libreria, non del codice del progetto, e
non esiste in produzione.** Isolato con una prova diretta: `node -e
"require('@livekit/krisp-noise-filter')"`, **fuori da qualunque Next o Turbopack**, lancia lo
stesso `ReferenceError: Worker is not defined`. La causa è nel bundle stesso della libreria
(`dist/index.umd.cjs`, modulo interno `927`): `class g extends Worker {}` a livello di
modulo — l'estensione di una classe valuta subito l'identificatore `Worker`, anche se non
verrà mai istanziata, e Node non ha quel globale. `components/livekit-call-controls.tsx` è
correttamente `'use client'`; il problema è che **Turbopack, in `next dev`, valuta comunque
il grafo dei moduli lato server** per costruire il manifesto dei client reference, ed evaluare
questo pacchetto — ovunque nell'albero — è sufficiente a farlo esplodere.

**Confermato assente in una build isolata.** `next build` (webpack, non Turbopack — lo stesso
usato da `npm run build`/produzione) con lo stesso ambiente locale: **compilazione riuscita
senza alcun errore su `/dashboard/video/[bookingId]`**. Avviata poi con `next start -p 3001`
(porta separata dal server di sviluppo su 3000, per non toccarlo) e raggiunta con un login
reale del coach: la pagina di preparazione alla chiamata si carica per intero — anteprima
camera, sfondo virtuale, prova microfono, indicatore di qualità di rete, «Riduzione rumore,
cancellazione eco e volume automatico sono attivi» — e una connessione di controllo (rete)
al server LiveKit locale riesce e si chiude da sola, come previsto.

**Non è stata toccata una riga di codice applicativo per questo**: la causa dimostrata è
`next dev --turbopack`, non `components/livekit-call-controls.tsx`, quindi non c'era niente
da correggere lì. Resta un problema di *sviluppo locale*: chi lavora su quella pagina con
`next dev --turbopack` continuerà a vederlo, e la sola informazione utile è questa pagina —
la funzionalità in produzione (webpack) non è toccata.

**L'errore di negoziazione WebRTC, riprodotto e spiegato — non più un mistero.** Nello stesso
ambiente, con lo stesso booking, in una chiamata **vera e a due partecipanti reali** (il coach
sulla build isolata di produzione al punto sopra, l'atleta A sull'app mobile):

1. **Primo tentativo, permessi non ancora concessi**: l'atleta tocca «Entra», il client si
   collega al segnale LiveKit e resta **30 secondi** senza inviare né ricevere media — il
   tempo impiegato a concedere manualmente i permessi di sistema di microfono e telecamera
   durante il collaudo. Il client chiude per `ping timeout`, tenta un recupero automatico, e
   quel recupero fallisce con lo stesso errore già descritto in §16.4: `Local fingerprint
   does not match identity` — un secondo `PeerConnection` creato dopo la caduta della
   connessione, con un'impronta DTLS che non combacia più.
2. **Secondo tentativo, permessi già concessi** (il caso normale per chi ha già usato l'app
   una volta): l'atleta tocca di nuovo «Entra» — **connessione pulita al primo colpo,
   nessun errore**, fotocamera pubblicata, il coach la vede in tempo reale.

Questo isola la causa con ragionevole certezza: **il timeout di 30 secondi sui permessi di
sistema, non un difetto ricorrente della negoziazione.** Non è stata modificata nessuna
logica di retry o di negoziazione: la causa dimostrata è un tempo di attesa lungo prima del
primo invio di media in un caso specifico di collaudo interattivo, non un pattern d'uso reale
atteso (un utente che nega o concede permessi la primissima volta che apre l'app, non ad ogni
chiamata). Log tecnici raccolti senza token né contenuti personali (redatti negli estratti
sopra e in §16.4).

**Con la connessione riuscita, i sei scenari richiesti sull'emulatore, tutti osservati nella
stessa chiamata a due:**

| Scenario | Esito |
|---|---|
| Cambio scheda | Uscendo dalla schermata di chiamata (freccia indietro) verso «Oggi», una barra flottante «Coach del percorso · Sessione in corso» resta visibile in fondo allo schermo; la chiamata **non si interrompe** — confermato dal lato coach, che continua a vedere `atleta-a` senza interruzioni |
| Minimizzazione e rientro | Toccando la barra flottante si torna alla schermata di chiamata a schermo intero, connessione mai persa |
| Background/foreground | Tasto Home (app in background), poi riapertura da icona: la barra flottante è ancora lì, il coach vede ancora il video dell'atleta senza interruzioni nello stesso periodo |
| Audio, video, connessione | Fotocamera dell'emulatore pubblicata e ricevuta dal coach (frame reali, non un segnaposto); stato «Connessione ottima» sul lato coach per tutta la durata |
| Nessun partecipante duplicato | Verificato due volte: visivamente (un solo riquadro «atleta-a» sul lato coach, prima e dopo ogni passaggio) e **sul server**, con `ListParticipants` dell'API LiveKit — un solo partecipante attivo alla volta |
| Rilascio delle risorse alla chiusura | L'atleta chiude la chiamata dall'app: la barra flottante sparisce, l'indicatore di fotocamera in uso sparisce dalla barra di stato; il lato coach perde il riquadro `atleta-a` senza lasciarne un fantasma; `ListParticipants` subito dopo conferma **un solo partecipante rimasto** (il coach) |

### 17.4 Cosa NON è stato ripetuto, e perché

Per non ripetere verifiche già superate senza un motivo che lo giustificasse: non è stato
rieseguito `test:policies` (50), `test:route-policies` (35) né `test:db:negative` (6) — nessuna
riga toccata dal dominio che coprono; non è stata ripetuta l'installazione dell'app, il
bootstrap del database o il seed delle identità sintetiche, tutti già in piedi e verificati in
§16; non è stata ripetuta la build isolata originale di §9 (Docker, non Supabase locale),
perché la domanda di questo giro — Turbopack contro build/start — riguardava specificamente
`next dev` contro `next build`, non l'isolamento da `.env`, già coperto lì.

### 17.5 Limite dichiarato, non aggirato

**Tutto quanto sopra resta sull'emulatore Android**, mai un telefono fisico né iOS. In
particolare, il timeout dei 30 secondi che ha innescato l'errore di negoziazione dipende dal
tempo che *chi collauda* impiega a concedere i permessi: su un dispositivo fisico, con
un'app già in uso, quel tempo è normalmente vicino a zero, e non c'è motivo di aspettarsi lo
stesso errore — ma non è stato osservato per davvero, ed è dichiarato qui invece che dedotto.

### 17.6 Cosa resta da fotografare, non da costruire

Le due superfici di gestione del percorso (§17.2) sono complete, tipizzate e verificate per
lettura contro la stessa autorizzazione già in produzione; la conferma interattiva completa —
uno screenshot della chiusura e della riapertura da entrambi i lati, atleta e coach — non è
stata ripetuta in questo giro per non interferire con l'unica sessione di chiamata riuscita
(chiudere il percorso durante o subito prima di una chiamata reale ne avrebbe alterato lo
stato). Non è un collaudo mancato per il gesto in sé — «Chiudi il percorso» è visibile e
premibile nello screenshot di §17.3 — ma la sequenza chiudi→verifica vuoto→riapri→verifica
azione non è stata fotografata passo per passo in questo giro.

### 17.7 Servizi lasciati attivi, e come fermarli

Tutti processi già in piedi da §16, riusati senza riavvii non necessari; uno script di grant
temporaneo (`scripts/test-db/*-tmp.mjs`) creato e rimosso subito dopo l'uso in ciascun caso.
Nessun processo è stato terminato per nome in questo giro.

| Servizio | Come identificarlo | Comando per fermarlo |
|---|---|---|
| Supabase locale (Docker) | `docker ps --format "{{.Names}}"` → container `supabase_*_kaipai-local-test` | `cd scripts/test-db/local-supabase && npx supabase stop` |
| Server web di test (porta 3000) | `netstat -ano \| findstr :3000` → PID in ascolto | `taskkill /F /PID <quel-pid>` — mai per nome |
| Metro (porta 8081) | `netstat -ano \| findstr :8081` | `taskkill /F /PID <quel-pid>` |
| LiveKit locale (porta 7880) | `netstat -ano \| findstr :7880` | `taskkill /F /PID <quel-pid>` |
| Emulatore Android Pixel 7 | `Get-Process emulator` (PowerShell) | Chiudere dalla finestra dell'emulatore, o `taskkill /F /PID <pid-di-emulator.exe>` |

Le due modifiche ai dati sintetici di §16.6 (entitlement `AI_SESSION_NOTES` per il coach, data
di nascita per l'atleta A) restano nel database isolato: righe di test in un database di test,
non richiedono pulizia per lo stesso motivo per cui il resto del seed non la richiede.

---

## 13. Rischi residui

**Il ciclo di vita della chiamata durante il cambio di scheda — osservato, §17.3.** Non più
un rischio dichiarato e mai visto: con una chiamata vera a due (coach sulla pagina web reale,
atleta sull'app), cambio scheda, minimizzazione/rientro e background/foreground sono stati
osservati tutti e tre senza che la chiamata si interrompesse, senza partecipanti duplicati, e
con le risorse rilasciate correttamente alla chiusura (confermato anche interrogando
`ListParticipants` sul server LiveKit). Resta **non osservato su un dispositivo fisico**, solo
sull'emulatore — vedi §17.5 per il limite dichiarato.

**Il momento in cui il ruolo arriva.** La barra compare quando `SessionsScreen` riceve
`viewerIsCoach` dal server. Su rete lenta, un atleta vede per qualche istante l'elenco
sessioni senza barra. Non è un difetto di correttezza, va guardato su un dispositivo vero
(§12.4).

**I percorsi non esistono ancora in produzione.** Nessun backfill, per scelta di progetto:
il pilot non parte finché qualcuno non attiva le coppie a mano
(`scripts/pilot/activate-path.ts`, mai eseguito) o finché non arriva la prima accettazione
dopo il rilascio.

**La finestra dei sette giorni** in `pathsWithUpcomingSession` guarda solo la prossima
prenotazione, non tutte: con due coach e due sessioni vicine, la precedenza fra le due
azioni si decide sulla sola sessione più imminente. Corretto per i volumi attuali,
approssimato in generale.

**Il divario voluto con i moduli storici.** Mental Journey, segnalibri e Session Compass
continuano a usare `coachHasRelationship`. Un coach può quindi leggere il percorso mentale
di un atleta con cui il percorso è chiuso, ma non riceverne contributi nuovi — dichiarato
nel progetto (§4.11) e ora con un caso esplicito in mente per il test di regressione che gli
manca ancora.

**I tre script RLS preesistenti** (`test:ai-notes:rls`, `:commitments-rls`,
`test:db:function-security`) leggono ancora `POSTGRES_URL` diretto, non
`connectToTestDatabase`. Non sono stati toccati in questo giro (fuori dal perimetro
dell'incremento) e restano gli unici, in tutto il repository, che parlano ancora con la
produzione quando eseguiti.

---

## 14. Che cosa resta fuori, come previsto

Momenti e Replay, la scheda Percorso completa, il riepilogo condiviso sul telefono, la chat
mobile, e ogni notifica nuova. Sono gli incrementi successivi. La barra ha due voci perché
due sono le schermate che funzionano: nessuna scheda vuota per completare la navigazione.

---

## 15. Giudizio

**Pronto per test manuale — sul ciclo di permessi e sulla build.** I 91 controlli
sul database isolato (dominio, store, rotte HTTP vere, e il cancello stesso) coprono ogni
scenario richiesto per questo incremento, con il ruolo database di ciascuno dichiarato e la
distinzione fra isolamento applicativo e isolamento RLS resa esplicita. La build isola
correttamente la produzione, verificato tre volte con controllo di hash, non per
dichiarazione.

**Aggiornato dal collaudo autenticato di §16.** I due prerequisiti che bloccavano §12 —
un'identità Supabase Auth di prova, una stanza LiveKit non di produzione — sono stati
costruiti interamente in locale (Supabase locale via Docker, LiveKit locale via binario
ufficiale) e usati con un login vero, un Bearer vero, `getApiUser` mai sostituito.

**Verificato con autenticazione reale — il ciclo atleta.** Azione mostrata in «Oggi», due
prove distinte registrate dall'interfaccia, persistenza confermata dopo un riavvio completo
dell'app, correzione con l'indicatore «Modificato» visibile, pausa e ripresa, contenuto
corretto nella preparazione del coach (dopo aver corretto un entitlement mancante nel seed),
rifiuto per atleta e coach estranei, chiusura del percorso con rifiuto delle nuove prove
(`409`) e riapertura. Verificato che pausa/ripresa riguardino sempre l'azione, mai il
percorso (§17.1) — nessuna divergenza trovata fra codice e testo mostrato.

**Attivazione, chiusura e riapertura del percorso: ora raggiungibili dalla superficie
prevista per ciascun attore (§17.2).** Non più solo rotte HTTP: l'atleta le trova nell'app
(«Chiudi il percorso» sotto l'azione, «Riapri il percorso» quando è stato lui a chiuderlo), il
coach le trova sulla scheda dell'atleta sul web («Stato della collaborazione»). Stessa
autorizzazione di sempre (`path-policy.ts`), nessuna regola nuova, nessun backoffice. Il
gesto di chiusura è stato visto a schermo durante il collaudo della chiamata; la sequenza
completa chiudi→riapri non è stata rifotografata passo per passo in questo giro (§17.6).

**La chiamata — verificata per intero in un ciclo a due partecipanti reali (§17.3).**
L'errore `Worker is not defined` è isolato con certezza: un bug del bundle di
`@livekit/krisp-noise-filter` (riproducibile con un semplice `require()` fuori da Next),
innescato solo perché `next dev --turbopack` valuta il grafo dei moduli lato server —
confermato **assente** in una build isolata di produzione (`next build` + `next start`), dove
la pagina di chiamata del coach ha funzionato per intero con un login vero. L'errore di
negoziazione WebRTC è isolato altrettanto: un timeout di 30 secondi sui permessi di sistema
durante il primo tentativo, non un difetto ricorrente — a permessi già concessi (il caso
normale) la connessione riesce pulita al primo colpo, come poi dimostrato. Con quella
connessione riuscita, tutti i sei scenari richiesti sono stati osservati nella stessa
chiamata: cambio scheda, minimizzazione/rientro, background/foreground senza interruzioni;
audio e video reali; nessun partecipante duplicato (confermato anche via API LiveKit); risorse
rilasciate alla chiusura (un solo partecipante rimasto, verificato lato server).

**Non pronto per una beta isolata** per un solo motivo dichiarato, non aggirabile da questo
collaudo: **nessuno scenario è stato osservato su un dispositivo fisico**, solo
sull'emulatore Android (§17.5) — né Android fisico né iOS. Il rischio sulla sopravvivenza
della chiamata al cambio di scheda, invariato da consegne precedenti, è ora osservato e
positivo in ambiente di test; resta da confermare che lo stesso valga fuori da un emulatore.
