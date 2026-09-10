# App atleta fra due sessioni — progetto

Revisione 3 · 2026-09-09 · Ramo `main` · Nessuna operazione sulla produzione.

La revisione 3 recepisce due decisioni di prodotto — la **pausa** di un'azione (§2.6) e la
**correzione di una prova senza archivio delle versioni** (§2.7) — e apre
l'implementazione del primo incremento. Lo stato di avanzamento è in
[docs/15_Incremento_1_Percorso_e_Prove.md](docs/15_Incremento_1_Percorso_e_Prove.md).

Obiettivo: chiudere il ciclo **azione concordata → prova nello sport → riscontro
dell'atleta → preparazione della sessione successiva**, dentro l'app.

Questa revisione recepisce nove correzioni di prodotto e di modello. Le tre che cambiano
la forma del progetto: il riscontro diventa una **storia di prove**, non un esito unico;
la relazione coach-atleta diventa un **percorso esplicito** con attivazione e chiusura
tracciate; gli obiettivi arrivano all'atleta **solo se condivisi**, mai per derivazione.

---

## 0. Decisioni recepite in questa revisione

| # | Correzione | Cosa cambia |
|---|---|---|
| 1 | Azione, prova e chiusura sono tre cose distinte | Nuova entità `commitment_attempts`. «Provata» **non** chiude più l'impegno. Cade la colonna `athlete_outcome` proposta prima (§2) |
| 2 | Obiettivi visibili solo se condivisi esplicitamente | Condivisione per obiettivo, sul modello di `shared_report_json`. Nessuna visibilità retroattiva (§3) |
| 3 | Niente autorizzazione a 180 giorni | Nuova entità `coach_athlete_paths` con attivazione e chiusura. I 180 giorni restano solo per ordinare elenchi (§4) |
| 4 | «Oggi» dà continuità | Sette stati mutuamente esclusivi, richiesta in attesa inclusa. «Per adesso è tutto» non è più uno stato (§5) |
| 5 | Microcopy che descrive il software | «Condiviso con {coach}, da riprendere nella prossima seduta.» Nessuna promessa di lettura. Cade il limite di 24 ore (§8) |
| 6 | Nessuna notifica nuova in v1 | Nessun evento, nessun template, nessun promemoria comportamentale (§9) |
| 7 | Incrementi verticali | Nessun rilascio con semantica provvisoria da correggere dopo. La chat è un incremento a sé, con un elenco di lavoro reale (§10) |
| 8 | Qualità verificabile | Nove criteri espliciti, database isolato obbligatorio per i test dei permessi (§11) |
| 9 | Evidenze datate | Ogni numero porta fonte e data, o è marcato non verificato (§12) |

Correzioni a errori della revisione 1, elencati per non ripeterli:

- **`db:generate` non «ricrea tutto».** Era una lettura sbagliata di uno stato locale.
  Causa e stato reale in §12.2.
- **La classificazione dei test era fatta sul prefisso del comando.** Due script che
  avevo dichiarato «tocca la produzione» non toccano nulla. Riclassificati in §12.3.
- **«Sessione entro 60 minuti» era inventato.** La regola server è
  `canJoinVideoNow`, con `VIDEO_JOIN_LEAD_MINUTES = 5` (§5).
- **«La chat serve solo il cambio di autenticazione» era falso.** Il lavoro reale è in
  §10.2.

---

## 1. Mappa del codice esistente e lacune

### 1.1 App mobile

`mobile/App.tsx` non usa una libreria di routing: quattro stati (`login`, `sessions`,
`settings`, `call`), con il tasto Indietro di Android gestito a mano. Quattro schermate:
[LoginScreen.tsx](mobile/src/screens/LoginScreen.tsx),
[SessionsScreen.tsx](mobile/src/screens/SessionsScreen.tsx),
[CallScreen.tsx](mobile/src/screens/CallScreen.tsx),
[SettingsScreen.tsx](mobile/src/screens/SettingsScreen.tsx).

Riutilizzabili subito: [SessionHeroCard.tsx](mobile/src/components/SessionHeroCard.tsx),
[SessionHistoryRow.tsx](mobile/src/components/SessionHistoryRow.tsx),
[SessionPrepSheet.tsx](mobile/src/components/SessionPrepSheet.tsx),
[PastSessionSheet.tsx](mobile/src/components/PastSessionSheet.tsx),
[Icon.tsx](mobile/src/components/Icon.tsx), il tema in
[theme.tsx](mobile/src/theme.tsx).

Client API: una funzione sola, timeout 15 s, `ApiError` tipizzato, `Content-Type:
application/json` imposto — [api.ts](mobile/src/lib/api.ts). Autenticazione Bearer da
Supabase Auth, accettata dal server accanto al cookie in
[api-user.ts](lib/auth/api-user.ts).

### 1.2 Server: i pezzi che il ciclo richiede

**Impegni.** [session-commitments.ts](lib/core/ai-session-notes/session-commitments.ts) è
puro, con store iniettato: `session_ai_commitments`
([schema.ts:1642](lib/db/schema.ts#L1642)) con `owner`, `status`, `due_date`,
`athlete_note`, `archived_at`; `listAthleteCommitments` come proiezione atleta separata
per tipo; `isProtectedFromSync`, e `planCommitmentSync` che non riscrive mai lo stato
operativo.

**Riepilogo condiviso.** [shared-report.ts](lib/core/ai-session-notes/shared-report.ts)
decide una volta per tutti cosa esce verso l'atleta, per **aggiunta** e non per
sottrazione. È la fotografia salvata in `shared_report_json`, non un puntatore: se il
coach corregge dopo aver condiviso, quello che l'atleta ha letto non cambia. **È il
modello da imitare per gli obiettivi condivisi** (§3).

**Preparazione della sessione.**
[session-brief.ts](lib/core/ai-session-notes/session-brief.ts), puro, monta solo materiale
già scritto o validato dal coach. Store in
[session-brief-store.ts](lib/core/ai-session-notes/session-brief-store.ts), rotta app
`GET /api/mobile/sessions/:id/prep`, schermata `SessionPrepSheet`. Ha già `emptyReason`.

**Obiettivi.** `athlete_journey_goals` ([schema.ts:2823](lib/db/schema.ts#L2823)):
`title`, `is_primary`, `status`, `theme_key`, `archived_at`. **Nessun campo di
descrizione, nessun concetto di condivisione.**

**Tempi di sessione.** [sessions.ts](lib/core/sessions.ts): `canJoinVideoNow`,
`isSessionJoinable`, `isSessionUpcoming`, `nextVideoJoinAvailabilityChange`,
`isRequestExpired`, con `VIDEO_JOIN_LEAD_MINUTES = 5`,
`REQUEST_RESPONSE_WINDOW_HOURS = 48`, `HEARTBEAT_STALE_MINUTES = 5`. Modulo non
`server-only`: usabile da entrambi i lati.

**Chat.** `messages`, `message_reactions`, policy pura in
[policy.ts](lib/core/messages/policy.ts), UI in
[chat-panel.tsx](<app/(dashboard)/dashboard/chat/[bookingId]/chat-panel.tsx>) con canale
Supabase Realtime che spinge un refetch.

**Database di test isolato.** `requireTestDatabaseUrl` in
[test-database.ts](lib/core/ai-session-notes/test-database.ts) impone `TEST_DATABASE_URL`
diverso da `POSTGRES_URL` e riconoscibile. **Esiste e non è usato da nessuno script**:
lo usa solo il proprio test. È il gancio su cui appendere i test dei nuovi permessi (§11).

### 1.3 Lacune

| # | Lacuna | Riferimento |
|---|---|---|
| L1 | Sul telefono l'atleta non vede nulla del riepilogo: `canShowAiSessionReport` è `false` per l'atleta e la rotta mobile taglia `report: null` | [report-visibility.ts](lib/core/ai-session-notes/report-visibility.ts), [route.ts](<app/api/mobile/sessions/[bookingId]/route.ts#L126>) |
| L2 | Sul telefono l'atleta non vede i suoi impegni: `getAthleteNextSteps` è cablato solo alla pagina web | [athlete/page.tsx:570](<app/(dashboard)/dashboard/athlete/page.tsx#L570>) |
| L3 | Il riscontro passa solo da una Server Action, non da una rotta HTTP | [athlete/actions.ts:202](<app/(dashboard)/dashboard/athlete/actions.ts#L202>) |
| L4 | **Non esiste storia delle prove.** Un impegno ha uno stato, non una sequenza di tentativi datati | `session_ai_commitments` |
| L5 | Nessun contributo dell'atleta fra due sedute | nessuna tabella |
| L6 | La chat non è raggiungibile dall'app, e manca molto più dell'autenticazione | §10.2 |
| L7 | Il Percorso non è una superficie dell'atleta: `authorizeMentalJourney` lo nega esplicitamente | [mental-journey.ts:290](lib/core/ai-session-notes/mental-journey.ts#L290) |
| L8 | **La relazione coach-atleta non esiste come entità.** `coachHasRelationship` è «almeno una prenotazione, di qualunque stato, da sempre»; `getAthleteRelationshipCoaches` è prenotazioni ∪ preferiti | [mental-journey-store.ts:42](lib/core/ai-session-notes/mental-journey-store.ts#L42), [bookings/index.ts:556](lib/core/bookings/index.ts#L556) |
| L9 | Gli obiettivi non hanno né descrizione né condivisione | [schema.ts:2823](lib/db/schema.ts#L2823) |
| L10 | La preparazione del coach non sa nulla di ciò che l'atleta ha fatto nel frattempo | [session-brief.ts](lib/core/ai-session-notes/session-brief.ts) |

---

## 2. Azione, prova, chiusura

### 2.1 Il difetto della revisione 1

Mappare «Provata» a `completed` chiudeva l'azione alla prima prova. Una routine mentale si
prova più volte: fra allenamenti e gare, e proprio nelle occasioni diverse sta il suo
valore. Nell'esempio della settimana, Giulia prova mercoledì in allenamento e deve
ritrovare la stessa routine sabato in partita. Con la mappatura precedente sabato non
c'era più niente da riprendere. Una colonna con l'ultimo esito non basta: perde la storia.

### 2.2 Tre livelli, tre proprietari

| Livello | Dove vive | Chi scrive | Cosa significa |
|---|---|---|---|
| **Azione assegnata** | `session_ai_commitments` (esistente) | AI in bozza, poi il coach approvando | Cosa avete concordato |
| **Prova** | `commitment_attempts` (nuova) | **Solo l'atleta** | Cosa ha fatto, quando, com'è andata |
| **Chiusura** | `session_ai_commitments.status` | **Solo il coach**, o l'atleta con un gesto esplicito e distinto | L'azione non è più in corso |

Nessun automatismo fra i livelli. Una prova non chiude un'azione. Una chiusura non
cancella le prove. Nessuno dei due tocca `athlete_journey_goals`: lo stato di un obiettivo
resta un giudizio del coach, e oggi nessun codice lo scrive dagli impegni.

**Cade la colonna `athlete_outcome`** proposta nella revisione 1. L'esito vive sulla riga
della prova, dove ha anche la data e l'autore. Una colonna sull'impegno avrebbe
sovrascritto la prova precedente a ogni nuova prova: era il difetto, non la soluzione.

### 2.3 `commitment_attempts`

```sql
create table commitment_attempts (
  id                 serial primary key,
  commitment_id      integer not null
                       references session_ai_commitments(id) on delete cascade,
  -- Denormalizzato: serve alla RLS e ai test di isolamento fra coach.
  athlete_user_id    integer not null references users(id) on delete cascade,
  path_id            integer not null references coach_athlete_paths(id),
  outcome            varchar(16) not null,   -- provata | non_ancora | non_adatta
  note               text,                   -- facoltativa su tutti e tre gli esiti
  -- Quando ha provato, dichiarato dall'atleta. Non l'istante del salvataggio.
  occurred_on        date not null,
  -- Idempotenza dei retry: il client genera l'id prima di inviare, e un reinvio
  -- dopo un timeout ricade sulla stessa riga invece di crearne una seconda.
  client_request_id  uuid not null,
  -- Correzione sul posto: nessun archivio dei testi precedenti (§2.6).
  -- `version` è il gettone di concorrenza ottimistica.
  version            integer not null default 1,
  edited_at          timestamptz,
  -- Rimozione dalla vista. Non è cancellazione: vedi §8.4.
  hidden_at          timestamptz,
  createddate        timestamptz not null default now(),
  createdby          integer not null references users(id) on delete restrict,
  updateddate        timestamptz not null default now(),
  updatedby          integer references users(id) on delete set null,
  constraint commitment_attempts_outcome_check
    check (outcome in ('provata','non_ancora','non_adatta')),
  constraint commitment_attempts_note_len
    check (note is null or length(btrim(note)) between 1 and 1000),
  constraint commitment_attempts_idempotency
    unique (commitment_id, client_request_id)
);
create index commitment_attempts_commitment_idx
  on commitment_attempts (commitment_id, occurred_on desc);
create index commitment_attempts_athlete_idx
  on commitment_attempts (athlete_user_id, createddate desc);
```

Perché una tabella e non un sistema generico di eventi: ha tre colonne di significato
(`outcome`, `note`, `occurred_on`), un solo autore possibile e un solo genitore. Un
registro generico avrebbe richiesto un discriminatore, uno schema per tipo e una
validazione che nessun vincolo del database può esprimere.

**Retry senza duplicati.** `client_request_id` è generato dal telefono prima dell'invio.
Un reinvio dopo un timeout — il caso normale su rete mobile, dove
[api.ts](mobile/src/lib/api.ts) interrompe a 15 secondi — colpisce il vincolo di unicità e
il server risponde con la riga già scritta, non con un errore. È idempotenza vera, non un
controllo sul testo.

**Correzioni senza confondere le voci.** Correggere una prova aggiorna la riga sul posto,
incrementa `version` e valorizza `edited_at`; il coach vede il contenuto corrente con
l'indicazione «Modificato», e non esiste un archivio delle versioni (§2.6). L'atleta
corregge solo le proprie prove; il coach non scrive mai in questa tabella. Le decisioni
del coach restano su `session_ai_commitments`, dove `manuallyEdited` le dichiara già.

### 2.4 Azione singola o routine ripetibile

**Non serve una distinzione in v1.** Ogni azione assegnata all'atleta si comporta come
ripetibile: resta aperta e riprovabile finché qualcuno non la chiude esplicitamente. È il
comportamento corretto per la quasi totalità delle azioni di mental coaching, e non
richiede né una colonna né una scelta in più al coach al momento dell'approvazione.

Se i coach chiederanno azioni a colpo singolo, il passo successivo è una colonna
`repeatable boolean not null default true` su `session_ai_commitments`, scritta solo da
`updateCommitmentByCoach`. Additiva, reversibile, e con il default che conserva il
comportamento di v1.

### 2.5 Pausa di un'azione

**Decisione presa.** L'atleta può mettere in pausa un'azione e riprenderla, con due gesti
espliciti e un motivo facoltativo. La pausa non è «completata», non è «raggiunto», non è
«abbandonata».

**Come, senza toccare gli stati esistenti.** La pausa **non** entra in
`session_ai_commitments.status`. Aggiungere `paused` all'insieme
`pending | in_progress | completed | skipped` avrebbe cambiato in silenzio il significato
di percorsi web già in produzione. Verificati uno per uno, i chiamanti che partizionano
sui quattro stati sono sette:

| File | Cosa fa | Cosa sarebbe successo con un quinto stato |
|---|---|---|
| [athlete-next-steps.tsx:22](components/athlete-next-steps.tsx#L22) | divide in `open` e `closed` | un'azione in pausa **sparisce**: non è in nessuno dei due |
| [journey-narrative.tsx:23](components/session-compass/journey-narrative.tsx#L23) | conta gli aperti | conteggio silenziosamente sbagliato |
| [journey-panel.tsx:148](components/session-compass/journey-panel.tsx#L148) | conta gli aperti | idem |
| [mental-journey.ts:509](lib/core/ai-session-notes/mental-journey.ts#L509), `:595`, `:679`, `:724` | quattro punti su aperto/chiuso | idem, dentro il percorso mentale |
| [session-pdf.ts:823](lib/core/ai-session-notes/session-pdf.ts#L823), [journey-pdf.ts:801](lib/core/ai-session-notes/journey-pdf.ts#L801) | etichetta italiana per stato | etichetta mancante nel PDF |
| [report-sections.tsx:43](components/session-compass/report-sections.tsx#L43) | elenco stati ammessi nell'editor coach | uno stato non selezionabile e non mostrato |
| `session_ai_commitments_status_check` | vincolo del database | rifiuterebbe la scrittura |

Quindi tre colonne nuove su `session_ai_commitments`, ortogonali allo stato:

```sql
paused_at      timestamptz,
paused_reason  text,          -- facoltativo, max 500 caratteri
paused_by      integer references users(id) on delete set null
```

Chi non le legge continua a comportarsi esattamente come oggi: un'azione in pausa resta
`pending` o `in_progress` e i sette chiamanti sopra non cambiano né numero né etichetta.
È il senso di «riusa il modello esistente dove compatibile».

Conseguenze:

- **«Oggi» non propone come azione principale un'azione in pausa** (§5.2): la selezione
  scarta `paused_at is not null` prima di ordinare.
- **Resta consultabile**: compare nell'elenco «Le tue azioni» con l'etichetta «In pausa» e
  il bottone «Riprendi».
- **Il coach la vede in preparazione**, nel blocco «Dall'ultimo incontro», con la data e il
  motivo se c'è.
- **La conclusione resta al coach.** In v1 l'atleta non chiude un'azione: cade la proposta
  di §14.1 e cade il gesto «Non mi serve più». La pausa è la risposta corretta al bisogno
  che quel gesto voleva coprire, e non richiede all'atleta un giudizio di conclusione.
- **Nessun effetto sugli obiettivi.** Mettere in pausa non tocca
  `athlete_journey_goals`, come non lo tocca una prova.
- **Storia delle prove intatta.** La pausa è stato operativo; le prove restano in
  `commitment_attempts`. Mettere in pausa e riprendere non cancella né nasconde nulla.

### 2.6 Correzione di una prova

**Decisione presa.** Correggere una prova **sostituisce il contenuto**. Il coach vede il
contenuto corrente con l'indicazione «Modificato». In v1 non esiste un'interfaccia per
leggere le versioni precedenti, e **non si introduce un archivio dei testi precedenti**.

Cade quindi la catena `supersedes_id` della revisione 2: conservare le versioni per non
mostrarle sarebbe stato tenere un archivio senza averne dichiarato lo scopo. La riga viene
aggiornata sul posto.

Conseguenze di modello:

- `commitment_attempts` guadagna `version integer not null default 1` e
  `edited_at timestamptz`. La correzione incrementa la versione e valorizza `edited_at`.
- **Concorrenza.** La correzione è ottimistica: il client manda la `version` che ha letto,
  e il server aggiorna solo se combacia (`where id = $1 and version = $2`). Zero righe
  aggiornate significa che qualcun altro ha scritto prima: risposta `409`, con la riga
  corrente allegata, e nessuna sovrascrittura silenziosa.
- **Audit senza testo.** `session_ai_audit_events.detail` riceve identificativi, autore,
  istante e tipo di operazione. Mai il testo della prova, né quello precedente né quello
  nuovo. È la regola già scritta in
  [pipeline-log.ts](lib/core/ai-session-notes/pipeline-log.ts).
- **Dipendenze verificate.** Il client `postgres` è costruito senza opzione di log delle
  query e Drizzle senza `logger`, quindi nessun testo transita nei log del processo. Un
  test di dominio verifica che la funzione di audit riceva solo campi non testuali.
- **Nessuna promessa di cancellazione.** Il microcopy non dice che la correzione cancella
  ciò che il coach ha già letto, perché non è vero: dice che sostituisce il testo, e che
  il coach potrebbe aver già letto la versione precedente.
- **La cancellazione resta separata** e segue §8.4: «Rimuovi» nasconde, e la cancellazione
  definitiva non si pubblica finché non esiste il lavoro di ritenzione che la esegue.

### 2.7 Chi chiude, e come

- **Il coach** chiude dal Session Compass, con `updateCommitmentByCoach`, che esiste già e
  imposta `manuallyEdited`. **In v1 è l'unico che chiude.**
- **L'atleta non chiude.** Se un'azione non gli serve più adesso, la mette in pausa
  (§2.5): è un gesto reversibile che non gli chiede di giudicare conclusa una cosa che
  avevano concordato in due. Il gesto «Non mi serve più» della revisione 2 è ritirato.
- **La risincronizzazione di un report successivo** archivia (`archived_at`) un impegno
  sparito dalla nuova versione, come oggi. Va esteso `isProtectedFromSync` a un impegno
  che ha **almeno una prova registrata**: una persona ci ha lavorato sopra, e una bozza AI
  successiva non deve poterlo riscrivere.

---

## 3. Obiettivi condivisi

L'atleta vede **titolo e descrizione dei soli obiettivi che il coach ha condiviso**.
Nessuna derivazione dalla Mental Journey, nessuna visibilità retroattiva, e lo stato
interno del coach (`in_corso`, `in_miglioramento`, `da_riprendere`, `raggiunto`) resta
fuori dalla proiezione atleta.

Il meccanismo esistente compatibile è quello di `session_ai_reports`: una colonna di
istantanea più una data di condivisione, con `getSharedReportForAthlete` che autorizza
dentro la query. Si applica lo stesso schema agli obiettivi.

```sql
alter table athlete_journey_goals
  -- Il testo scritto per l'atleta. Non il titolo interno: il coach lo scrive
  -- guardando chi lo leggerà, come già fa con la nota di seduta.
  add column shared_title       varchar(160),
  add column shared_description text,
  add column shared_at          timestamptz,
  add column shared_by          integer references users(id) on delete set null;

alter table athlete_journey_goals
  add constraint athlete_journey_goals_share_complete
    check ((shared_at is null) = (shared_title is null));
```

Conseguenze:

- **Nessuna visibilità retroattiva.** Le righe esistenti hanno `shared_at` nullo, quindi
  non escono. La condivisione è un'azione, non una migrazione.
- **È una fotografia.** Rinominare l'obiettivo interno non cambia ciò che l'atleta ha
  letto. Ricondividere aggiorna testo e data, e lo dichiara.
- **Si può revocare.** Azzerare `shared_at` toglie l'obiettivo dalla proiezione. Non
  cancella nulla di ciò che l'atleta ha scritto.
- **La proiezione atleta legge solo le tre colonne condivise**, mai `title` né `status`.
  Come `buildSharedReport`, si costruisce per aggiunta: un campo nuovo su
  `athlete_journey_goals` non arriva all'atleta perché nessuno si è ricordato di
  escluderlo.

---

## 4. Il percorso coach-atleta

### 4.1 Perché serve un'entità

Oggi l'autorizzazione è derivata: `coachHasRelationship` restituisce vero se esiste **una
qualunque** prenotazione fra i due, in **qualunque** stato, da **sempre**. Una richiesta
rifiutata basta. `getAthleteRelationshipCoaches` aggiunge i preferiti, cioè un coach che
non ha mai risposto a nessuno. La regola dei 180 giorni della revisione 1 non correggeva
questo: sostituiva un criterio sbagliato con un altro criterio derivato.

Contributi nuovi dell'atleta — prove, note, momenti — non possono dipendere da una
derivazione del genere.

### 4.2 Il modello

```sql
create table coach_athlete_paths (
  id                 serial primary key,
  coach_user_id      integer not null references users(id) on delete restrict,
  athlete_user_id    integer not null references users(id) on delete cascade,
  status             varchar(16) not null default 'active',   -- active | closed
  -- L'evento che ha autorizzato l'attivazione: la prenotazione accettata.
  activated_at       timestamptz not null default now(),
  activation_booking_id integer references bookings(id) on delete set null,
  closed_at          timestamptz,
  closed_by_role     varchar(8),                              -- coach | athlete
  closed_by          integer references users(id) on delete set null,
  -- L'atleta ha revocato la condivisione dei propri contributi (§4.6 C).
  contributions_revoked_at timestamptz,
  createddate        timestamptz not null default now(),
  updateddate        timestamptz not null default now(),
  updatedby          integer references users(id) on delete set null,
  constraint coach_athlete_paths_unique unique (coach_user_id, athlete_user_id),
  constraint coach_athlete_paths_status_check check (status in ('active','closed')),
  constraint coach_athlete_paths_closed_complete
    check ((status = 'closed') = (closed_at is not null)),
  constraint coach_athlete_paths_closed_role
    check (closed_by_role is null or closed_by_role in ('coach','athlete'))
);

-- Tre transizioni, non un registro generico: serve a rispondere «quando si è
-- chiuso, chi l'ha chiuso e quante volte è stato riaperto».
create table coach_athlete_path_events (
  id           serial primary key,
  path_id      integer not null references coach_athlete_paths(id) on delete cascade,
  event        varchar(16) not null,        -- activated | closed | reopened
  actor_role   varchar(8) not null,         -- coach | athlete | system
  actor_id     integer references users(id) on delete set null,
  booking_id   integer references bookings(id) on delete set null,
  createddate  timestamptz not null default now(),
  constraint path_events_event_check
    check (event in ('activated','closed','reopened'))
);
```

Nessun testo di contributo entra in queste tabelle, coerentemente con la regola già
scritta in [pipeline-log.ts](lib/core/ai-session-notes/pipeline-log.ts): identificativi,
esiti e conteggi, mai contenuti.

### 4.3 Chi attiva, e quale evento lo autorizza

**Attiva il sistema, e l'evento è una prenotazione che raggiunge `accepted`.** È il primo
momento in cui il coach ha detto sì a questa persona: un coach che accetta sta dichiarando
la relazione. La riga nasce lì, con `activation_booking_id`.

Non attivano: una richiesta `requested`, una `declined`, una `expired`, una `cancelled`,
un preferito. Nessuno dei cinque è un consenso del coach.

### 4.4 Come si interrompono i nuovi contributi

Entrambi possono chiudere, dalla propria superficie: il coach dalla scheda atleta sul web,
l'atleta dal Percorso nell'app. La chiusura ha effetto **solo** sui contributi nuovi.

### 4.5 Appuntamenti futuri

Chiudere un percorso **non cancella nessuna prenotazione**: sarebbe una disdetta
mascherata da impostazione, con conseguenze che il testo del bottone non annuncia.

Se esiste una prenotazione `accepted` futura, la chiusura è **rifiutata** con il motivo:
«C'è ancora una sessione in calendario il {data}. Annullala, oppure chiudi il percorso
dopo.» Chi vuole chiudere davvero passa dalla disdetta, che ha già le sue notifiche e le
sue regole di preavviso.

### 4.6 I quattro livelli, separati

| | Cosa | Chiuso dal coach | Chiuso dall'atleta | Condivisione revocata |
|---|---|---|---|---|
| **A** | Ricevere nuovi contributi | no | no | no |
| **B** | Leggere lo storico già condiviso | sì, entrambi | sì, entrambi | **no per il coach**, sì per l'atleta |
| **C** | Revoca della condivisione | — | — | azione a sé, solo dell'atleta |
| **D** | Cancellazione dei dati | mai implicita | mai implicita | mai implicita |

- **A** si spegne con la chiusura: niente prove nuove, niente momenti nuovi, nessuna
  azione nuova assegnabile su quel percorso.
- **B** resta: chiudere un percorso non cancella la memoria di ciò che ci si è detti.
  Entrambi continuano a leggere quello che era già stato condiviso.
- **C** è la revoca, ed è **solo dell'atleta**: `contributions_revoked_at` toglie al coach
  la vista dei contributi dell'atleta, passati e futuri, senza cancellarli e senza
  chiudere il percorso. È un gesto diverso dalla chiusura, con un testo diverso, e va
  offerto separatamente.
- **D** è la cancellazione, che resta un'azione esplicita per singolo contributo (§8.4) o
  la cancellazione dell'account, già esistente.

### 4.7 Riapertura, senza riaperture involontarie

**Riapre solo chi ha chiuso, con un'azione esplicita.** `closed_by_role` dice chi.
Accettare una nuova prenotazione **non** riapre un percorso chiuso: propone di riaprirlo.

- Percorso chiuso dall'atleta: al coach che accetta una nuova prenotazione compare «Il
  percorso con {atleta} è chiuso. Solo {atleta} può riaprirlo.» All'atleta compare la
  proposta.
- Percorso chiuso dal coach: la proposta compare al coach.

Finché non è riaperto, la sessione si svolge — la chiamata non dipende dal percorso — ma
non si registrano prove né momenti su di esso.

### 4.8 La beta: quali percorsi esistono al primo giorno

Backfill esplicito, scritto come migrazione dati e **letto prima di eseguirlo**:

> un percorso `active` per ogni coppia (coach, atleta) che ha almeno una prenotazione
> arrivata a `accepted` o `completed`, con `activated_at` pari alla prima di quelle e
> `activation_booking_id` che la nomina.

Restano fuori: coppie con sole richieste `requested`, `declined`, `expired`, `cancelled`,
e i preferiti. La migrazione stampa il conteggio delle coppie create e di quelle
escluse per ciascun motivo, e il numero va guardato prima di proseguire.

### 4.9 Che fine fanno i 180 giorni

Solo presentazione: ordinare l'elenco dei coach, e segnalare un percorso inattivo con
«Nessuna sessione da {mesi} mesi». Mai un'autorizzazione.

### 4.10 Il contributo non segue il coach

Un momento o una prova appartengono al percorso su cui sono nati. Cambiando coach **non si
trasferiscono**: il nuovo coach non vede nulla di ciò che è stato scritto per il
precedente. È il motivo per cui `path_id` è obbligatorio su entrambe le tabelle nuove, e
non ricavato al momento della lettura.

### 4.11 Moduli storici: cosa non cambia, e cosa va verificato

Il percorso esplicito **non sostituisce** `coachHasRelationship` in questa fase. I moduli
che lo usano — Mental Journey, segnalibri, Session Compass — continuano con la regola
attuale: cambiarla insieme a tutto il resto significherebbe modificare l'autorizzazione di
funzioni in produzione dentro un rilascio che riguarda altro.

Ne segue una differenza da documentare e da tenere sotto test: **un coach può leggere il
percorso mentale di un atleta con cui il percorso è chiuso, ma non riceverne contributi
nuovi.** È voluto, e coerente con il livello B di §4.6. L'allineamento dei moduli storici
al percorso esplicito è un lavoro successivo, con i suoi test di regressione.

Test richiesti: per ciascun modulo storico, un caso su percorso chiuso che verifica che il
comportamento sia **quello di oggi** e non cambi per effetto collaterale.

---

## 5. «Oggi»

### 5.1 Sette stati, mutuamente esclusivi

I difetti della revisione 1: S3 e S7 potevano essere veri insieme, «riscontro da
registrare» era uno stato mentre è una possibilità sempre disponibile, e «Per adesso è
tutto» compariva subito dopo la prima interazione. Corretti così.

Ingressi, tutti calcolati sul server: percorsi attivi; azioni aperte
(`owner='athlete'`, `status ∈ {pending, in_progress}`, non archiviate, su percorso
attivo); prove per azione; prossima prenotazione `accepted`; richieste `requested` non
scadute; `canJoinVideoNow` sulla prossima prenotazione.

| Ordine | Stato | Condizione, non ambigua | Cosa mostra |
|---|---|---|---|
| 1 | **Puoi entrare** | `canJoinVideoNow(prossima) === true` | La sessione, con «Entra» |
| 2 | **Sessione fra poco** | esiste `prossima` con `scheduledFor` entro 2 ore e `canJoinVideoNow === false` | Orario, e «La stanza apre 5 minuti prima» |
| 3 | **Azione in corso** | almeno un'azione aperta | L'azione scelta da §5.2, con le prove già fatte |
| 4 | **In attesa di risposta** | nessuna azione aperta, almeno una richiesta `requested` non scaduta | Da quando, ed entro quando il coach risponde |
| 5 | **Percorso attivo, nessuna azione** | almeno un percorso attivo, nessuna azione aperta, nessuna richiesta in attesa | Perché è vuoto, prossimo appuntamento se c'è, «Segna un momento» |
| 6 | **Nessun percorso attivo** | nessun percorso attivo, ma esiste una riga in `coach_athlete_paths` o una prenotazione passata | Come si riapre, o come si cerca un coach |
| 7 | **Appena registrato** | nessun percorso, nessuna prenotazione | «Trova un coach» |

Le condizioni sono valutate in quest'ordine e la prima vera vince: due stati non possono
essere veri insieme perché ciascuna condizione nega quelle sopra. Funzione pura in
`lib/core/ai-session-notes/athlete-today.ts`, con test su tutte e sette.

Note su due stati:

- **Lo stato 1 usa la regola server**, `canJoinVideoNow`, che apre la stanza
  `VIDEO_JOIN_LEAD_MINUTES = 5` minuti prima e la chiude alla fine della durata
  concordata. Non c'è nessuna soglia dei sessanta minuti: era inventata. Il momento esatto
  del cambio lo dice già `nextVideoJoinAvailabilityChange`, che l'app usa per aggiornarsi
  senza interrogare il server a ripetizione.
- **Lo stato 5 non è «tutto completato»**, ed è raro proprio perché un'azione provata
  resta aperta. Ci si arriva solo prima della prima azione, o dopo che qualcuno l'ha
  chiusa esplicitamente.

### 5.2 Quale azione, con più azioni e più coach

Ordine deterministico, calcolato sul server:

1. azione il cui percorso ha una sessione nei prossimi sette giorni — è quella di cui si
   parlerà per prima;
2. a parità, azione concordata più di recente (data della seduta di origine);
3. a parità, azione con meno prove registrate — quella su cui c'è meno da dire.

Le altre **restano raggiungibili**: sotto la scheda, «Le tue azioni (3)» apre l'elenco
completo, raggruppato per coach quando i percorsi attivi sono più d'uno. Il nome del coach
compare sempre sulla scheda: con due coach, un'azione senza nome è un'azione ambigua.

### 5.3 Dopo un riscontro

Conferma, e poi ciò che ha senso in quel momento — mai un'attività inventata:

- «Riprendi la routine», sempre, perché l'azione è ancora aperta;
- «Segna un nuovo momento», sempre;
- «Rivedi il tuo ultimo Replay», **solo se** esiste un momento con i tre campi compilati.

La schermata torna allo stato 3, non allo stato 5: l'azione è ancora lì, con una prova in
più nella sua storia.

---

## 6. La settimana di Giulia, corretta

Giulia, 16 anni, pallavolo. Coach Marco. Percorso attivo dal 12 maggio.

**Lunedì 18:00 — seduta.** Chiamata dall'app. Martedì mattina Marco approva il riepilogo e
lo condivide. All'approvazione nasce l'impegno: *«Prima della battuta, tre respiri e una
parola sola: dove tiro.»* — `owner: athlete`, `pending`.

**Martedì.** Giulia apre l'app. Stato 3, azione senza prove: «Da provare». Non fa niente.
Nessuna notifica la sollecita: in v1 non ce ne sono di nuove.

**Mercoledì 20:15, dopo l'allenamento.** Prova in tre battute su sei. Tocca **Provata**,
data «mercoledì», due righe di nota. Nasce la prima riga in `commitment_attempts`.
L'impegno resta `pending`. Conferma: «Segnato. Condiviso con Marco, da riprendere nella
prossima seduta.» Sotto: Riprendi la routine · Segna un nuovo momento.

**Giovedì.** Stato 3, non stato 5: l'azione è ancora lì, ora con «Ultima prova: mercoledì».

**Sabato, partita.** Giulia apre l'app **prima**: la routine è dov'era. Nel terzo set,
sotto 22 pari, due battute in rete. La sera tocca **Non era adatta al momento**, data
«sabato», nota: «ero già arrabbiata, non mi sono ricordata di niente». Seconda riga in
`commitment_attempts`. L'azione resta aperta. Due prove, due esiti diversi, due date: è la
cosa che nella revisione 1 andava perduta.

**Sabato sera.** Segna anche un momento, tipo *difficoltà*: cosa è successo, come ho
reagito, cosa voglio riprovare. Sopra il bottone: «Condiviso con Marco, da riprendere
nella prossima seduta.»

**Domenica.** Un momento tipo *domanda*, un campo solo.

**Domenica sera, rete assente.** Rimanda la modifica di una nota. La schermata conserva il
testo e dice cosa è successo; al ritorno della rete l'invio riparte con lo stesso
`client_request_id` e non crea una seconda prova.

**Lunedì 17:52.** Marco apre la preparazione. Blocco **Dall'ultimo incontro**: l'azione con
**due prove**, in ordine di data, ciascuna con esito e nota; la difficoltà di sabato con i
tre campi; la domanda di domenica.

**Lunedì 18:00.** La seduta comincia da lì. Se Marco decide che la routine ha esaurito il
suo compito, la chiude lui. Nessuno l'ha chiusa al posto suo mercoledì.

---

## 7. Wireframe

Token da [theme.tsx](mobile/src/theme.tsx). Nessun esadecimale nei componenti.

### 7.1 Oggi — stato 3, azione con prove

```
┌──────────────────────────────────────┐
│  Oggi                           (G)  │
│                                      │
│  ╭────────────────────────────────╮  │
│  │ LA TUA ROUTINE · con Marco     │  │
│  │                                │  │
│  │ Prima della battuta,           │  │
│  │ tre respiri e una parola       │  │
│  │ sola: dove tiro.               │  │
│  │                                │  │
│  │ ✓ mer 10  Provata              │  │   la storia, non un solo esito
│  │ ⤫ sab 13  Non era adatta       │  │
│  │                                │  │
│  │ ┌──────────────────────────┐   │  │
│  │ │      Segna una prova     │   │  │   primaria, red, 48pt
│  │ └──────────────────────────┘   │  │
│  ╰────────────────────────────────╯  │
│                                      │
│  Le tue azioni (3)               ›   │   le altre restano raggiungibili
│                                      │
│  Prossima sessione                   │
│  ╭────────────────────────────────╮  │
│  │ ● lun 15 set · 18:00 · Marco   │  │
│  ╰────────────────────────────────╯  │
│                                      │
│  ╭────────────────────────────────╮  │
│  │  ✦  Segna un momento           │  │
│  ╰────────────────────────────────╯  │
├──────────────────────────────────────┤
│  Oggi   Percorso   Sessioni  Messaggi│
└──────────────────────────────────────┘
```

### 7.2 Oggi — stati 4, 5, 6

```
STATO 4                              STATO 5
╭─────────────────────────────╮      ╭─────────────────────────────╮
│ Hai chiesto una sessione a  │      │ Non c'è un'azione in corso. │
│ Marco.                      │      │                             │
│ Inviata martedì alle 9:40.  │      │ Le azioni nascono da una    │
│ Marco risponde entro giovedì│      │ seduta, quando ne concordate│
│ alle 9:40.                  │      │ una insieme.                │
╰─────────────────────────────╯      ╰─────────────────────────────╯

STATO 6
╭──────────────────────────────────────────╮
│ Il percorso con Marco è chiuso.          │
│ Chiuso da te il 2 settembre. Quello che  │
│ vi siete scritti resta qui.              │
│ [ Riapri il percorso ]  [ Trova un coach]│
╰──────────────────────────────────────────╯
```

### 7.3 Segna una prova

```
╭──────────────────────────────────────╮
│               ▁▁▁▁                   │
│  Segna una prova                     │
│  Prima della battuta, tre respiri…   │
│                                      │
│  Quando                              │
│  ( Oggi ) ( Ieri ) ( Un altro giorno)│   default: oggi
│                                      │
│  ╭────────────────────────────────╮  │
│  │  ✓  Provata                    │  │
│  ╰────────────────────────────────╯  │
│  ╭────────────────────────────────╮  │
│  │  ◷  Non ancora                 │  │
│  ╰────────────────────────────────╯  │
│  ╭────────────────────────────────╮  │
│  │  ⤫  Non era adatta al momento  │  │
│  ╰────────────────────────────────╯  │
│                                      │
│  Vuoi aggiungere qualcosa?           │   facoltativo su tutti e tre
│  ┌────────────────────────────────┐  │
│  └────────────────────────────────┘  │
│                                      │
│  Condiviso con Marco Rossi,          │
│  da riprendere nella prossima seduta.│
│  ┌────────────────────────────────┐  │
│  │            Salva               │  │
│  └────────────────────────────────┘  │
│                                      │
│  La routine resta aperta: puoi       │
│  riprovarla quando vuoi.             │
╰──────────────────────────────────────╯
```

L'ultima riga è il rimedio esplicito al difetto della revisione 1: dice a chi salva che
non sta chiudendo niente.

### 7.4 Segna un momento → Il mio Replay

Invariato rispetto alla revisione 1, tranne il destinatario e il testo di condivisione.

```
╭──────────────────────────────────────╮
│  Segna un momento                    │
│  ( È andata bene ) ( Difficoltà )    │
│  ( Ho una domanda )                  │
│                                      │
│  Cosa è successo            [obblig.]│
│  ┌────────────────────────────────┐  │
│  └────────────────────────────────┘  │
│                                      │
│  ── Il mio Replay ──  (facoltativo)  │
│  Come ho reagito                     │
│  ┌────────────────────────────────┐  │
│  └────────────────────────────────┘  │
│  Cosa voglio riprovare               │
│  ┌────────────────────────────────┐  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌ Con chi lo condividi ────────┐    │   più percorsi attivi: obbligatorio,
│  │ Marco Rossi               ▾  │    │   non precompilato
│  └──────────────────────────────┘    │
│  Condiviso con Marco Rossi,          │
│  da riprendere nella prossima seduta.│
│  ┌────────────────────────────────┐  │
│  │            Salva               │  │
│  └────────────────────────────────┘  │
╰──────────────────────────────────────╯
```

Il Replay non è una seconda schermata né un secondo dato: sono due campi sulla stessa
riga. Un momento con i tre campi si legge come Replay; con uno solo resta un momento.

### 7.5 Percorso

```
┌──────────────────────────────────────┐
│  Percorso · con Marco Rossi          │
│                                      │
│  IL VOSTRO OBIETTIVO                 │
│  Restare presente dopo un errore     │   shared_title
│  Quando sbagli, tornare al punto     │   shared_description
│  successivo senza rincorrere quello  │
│  di prima.                           │
│  Condiviso il 12 maggio              │
│                                      │
│  COSA HAI FATTO                      │
│  ✓ mer 10   Provata — «tre battute…» │
│  ⤫ sab 13   Non adatta — «ero già…»  │
│  ✦ sab 13   Difficoltà — «due bat…»  │
│  ✦ dom 14   Domanda — «come faccio…» │
│                        [ Vedi tutto ]│   paginato, 20 per volta
│                                      │
│  COSA TI HA RESTITUITO MARCO         │
│  ▸ Seduta dell'8 settembre           │
│  ▸ Seduta del 1 settembre            │
│                                      │
│  Gestisci il percorso            ›   │   revoca condivisione, chiusura
├──────────────────────────────────────┤
│  Oggi   Percorso   Sessioni  Messaggi│
└──────────────────────────────────────┘
```

### 7.6 Coach — «Dall'ultimo incontro»

Primo blocco di `SessionPrepSheet`, sopra «Da portare in questa seduta».

```
╭──────────────────────────────────────╮
│  DALL'ULTIMO INCONTRO                │
│                                      │
│  «Prima della battuta, tre respiri»  │
│    ✓ mer 10  Provata                 │
│      «ci ho provato in tre battute   │
│       su sei»                        │
│    ⤫ sab 13  Non era adatta          │
│      «ero già arrabbiata, non mi     │
│       sono ricordata di niente»      │
│                                      │
│  ✦ Difficoltà — sab 13               │
│    Cosa è successo: due battute in   │
│    rete sul 22 pari                  │
│    Come ha reagito: mi sono arrab…   │
│    Cosa vuole riprovare: i tre resp… │
│                                      │
│  ✦ Domanda — dom 14  ·  aggiornato   │
│    «come faccio a non pensare al     │
│     punto precedente?»               │
╰──────────────────────────────────────╯
```

«aggiornato» compare quando `updateddate > createddate`: è così che il coach riconosce un
contributo modificato dopo la scrittura. Vuoto: «Dall'ultima seduta non è arrivato
niente.» Mai un riempitivo, mai una riformulazione.

---

## 8. Contributi dell'atleta: modello e regole

### 8.1 `athlete_moments`

```sql
create table athlete_moments (
  id                 serial primary key,
  athlete_user_id    integer not null references users(id) on delete cascade,
  -- Il percorso, non il coach: un contributo appartiene alla relazione su cui
  -- è nato e non segue l'atleta se cambia coach.
  path_id            integer not null references coach_athlete_paths(id),
  kind               varchar(16) not null,   -- riuscito | difficolta | domanda
  what_happened      text not null,
  how_i_reacted      text,
  what_to_retry      text,
  -- L'azione da cui nasce, quando nasce da lì. Verificata dal server: stesso
  -- atleta e stesso percorso, o rifiutata.
  commitment_id      integer references session_ai_commitments(id) on delete set null,
  occurred_on        date,
  client_request_id  uuid not null,
  hidden_at          timestamptz,
  purge_after        timestamptz,
  createddate        timestamptz not null default now(),
  createdby          integer not null references users(id) on delete restrict,
  updateddate        timestamptz not null default now(),
  updatedby          integer references users(id) on delete set null,
  constraint athlete_moments_kind_check
    check (kind in ('riuscito','difficolta','domanda')),
  constraint athlete_moments_what_happened_check
    check (length(btrim(what_happened)) between 1 and 2000),
  constraint athlete_moments_idempotency unique (path_id, client_request_id)
);
create index athlete_moments_path_idx
  on athlete_moments (path_id, createddate desc) where hidden_at is null;
```

### 8.2 Destinatario, verificato dal server

Il destinatario è visibile prima di salvare, ed è **il percorso**, non un nome scelto
liberamente. Il server rifiuta la scrittura se:

- `path_id` non appartiene all'atleta autenticato;
- il percorso non è `active`;
- `contributions_revoked_at` è valorizzato;
- `commitment_id` è presente e il suo impegno **non** ha lo stesso `athlete_user_id` e lo
  stesso `coach_user_id` del percorso.

L'ultimo controllo è quello che nella revisione 1 mancava: un impegno di un altro coach,
allegato a un momento, avrebbe fatto arrivare al destinatario sbagliato il testo di
un'azione concordata con qualcun altro. Un caso di test dedicato, sull'isolamento fra
coach.

Con più percorsi attivi il selettore è **obbligatorio e non precompilato**. Con uno solo è
una riga di testo, non un menu da confermare.

### 8.3 Modifica: nessun limite di 24 ore

Il limite della revisione 1 era arbitrario e non aveva un motivo che reggesse: una persona
che si accorge dopo tre giorni di aver scritto male una cosa che la riguarda deve poterla
correggere. Regola: **un momento è modificabile finché il percorso è attivo e il contributo
non è nascosto.**

Il coach riconosce un contributo modificato da `updateddate > createddate`, che la riga
mostra come «aggiornato». In v1 non c'è cronologia delle versioni per i momenti: il coach
vede il testo corrente e sa che è cambiato, non cosa c'era prima. È una limitazione
dichiarata, non un difetto scoperto dopo. Le prove, che sono il dato su cui si ragiona
nella seduta, hanno invece la catena `supersedes_id` e conservano tutto.

### 8.4 Rimozione dalla vista, e cancellazione

Sono due cose, con due nomi e due testi diversi.

- **Rimuovi** (`hidden_at`): sparisce dall'app dell'atleta e dalla preparazione del coach.
  Il testo resta nel database. Il microcopy **non dice «eliminato»**.
- **Elimina definitivamente**: azzera i campi di testo e valorizza `purge_after`. Finché
  non esiste un lavoro di ritenzione che completi la cancellazione — sul modello di
  `ai-notes:retention`, che esiste per l'audio — questo bottone **non si pubblica**, e
  l'app offre solo «Rimuovi», con il suo testo esatto.

Promettere una cancellazione che il sistema non esegue è peggio che non offrirla.

### 8.5 Audit

Le scritture registrano `path_id`, id del contributo, tipo ed esito. **Mai il testo**,
mai un estratto: la regola già scritta in
[pipeline-log.ts](lib/core/ai-session-notes/pipeline-log.ts) e nel commento di
`admin_audit_events`.

---

## 9. Microcopy

**Oggi**
- Stato 1: `Puoi entrare.` / `Sessione con {coach} · {ora}` / `Entra`
- Stato 2: `Sessione fra {durata}.` / `La stanza apre 5 minuti prima.`
- Stato 3, senza prove: `LA TUA ROUTINE · con {coach}` / `Segna una prova`
- Stato 3, con prove: aggiunge `Ultima prova: {giorno}`
- Elenco: `Le tue azioni ({n})`
- Stato 4: `Hai chiesto una sessione a {coach}.` / `Inviata {giorno} alle {ora}. {coach} risponde entro {scadenza}.`
- Stato 5: `Non c'è un'azione in corso.` / `Le azioni nascono da una seduta, quando ne concordate una insieme.`
- Stato 6, chiuso: `Il percorso con {coach} è chiuso.` / `Chiuso da {te|{coach}} il {data}. Quello che vi siete scritti resta qui.` / `Riapri il percorso`
- Stato 7: `Non hai ancora un coach.` / `Scegli un coach e prenota la prima sessione: il percorso comincia da lì.` / `Trova un coach`
- Errore di rete: `Non riesco a caricare. Riprova.`

**Segna una prova**
- Titolo: `Segna una prova`
- Quando: `Oggi` · `Ieri` · `Un altro giorno`
- Esiti: `Provata` · `Non ancora` · `Non era adatta al momento`
- Nota: `Vuoi aggiungere qualcosa?` (segnaposto `Facoltativo`)
- Condivisione: `Condiviso con {coach}, da riprendere nella prossima seduta.`
- Conferma: `Salva` · Esito: `Segnato.`
- Continuità: `La routine resta aperta: puoi riprovarla quando vuoi.`
- Dopo: `Riprendi la routine` · `Segna un nuovo momento` · `Rivedi il tuo ultimo Replay`
- Correzione: `Correggi questa prova` · `La prova precedente resta nello storico.`
- Errore: `Non sono riuscito a salvare. Il testo è ancora qui: riprova.`
- Percorso chiuso: `Il percorso con {coach} è chiuso: non puoi aggiungere prove.`

**Chiusura di un'azione, gesto separato**
- `Non mi serve più`
- Conferma: `Chiudi questa routine? Non comparirà più fra le tue azioni. Le prove che hai segnato restano.`

**Segna un momento**
- Titolo: `Segna un momento` · Tipi: `È andata bene` · `Difficoltà` · `Ho una domanda`
- `Cosa è successo` (segnaposto `Dove eri, cosa stava succedendo`)
- `Aggiungi il tuo Replay` · `Come ho reagito` · `Cosa voglio riprovare`
- Destinatario, un percorso: `Condiviso con {coach}, da riprendere nella prossima seduta.`
- Destinatario, più percorsi: `Con chi lo condividi?` (nessuna preselezione)
- Modifica: `Modifica` — `{coach} vedrà che l'hai aggiornato.`
- Rimozione: `Rimuovi` — `Non comparirà più, né a te né a {coach}. Il testo resta nei nostri sistemi.`

**Percorso**
- Sezioni: `IL VOSTRO OBIETTIVO` · `COSA HAI FATTO` · `COSA TI HA RESTITUITO {COACH}`
- Obiettivo condiviso: `Condiviso il {data}` · aggiornato: `Aggiornato il {data}`
- Vuoto obiettivo: `{coach} non ha ancora condiviso un obiettivo con te.`
- Vuoto contributi: `Qui finisce quello che provi e quello che segni.`
- Vuoto restituzioni: `{coach} non ti ha ancora condiviso il riepilogo di una seduta.`
- Gestione: `Gestisci il percorso`
- Revoca: `Smetti di condividere i tuoi contributi` — `{coach} non vedrà più quello che hai scritto, né prima né dopo. Niente viene cancellato, e il percorso resta aperto.`
- Chiusura: `Chiudi il percorso` — `Non potrai più aggiungere prove o momenti con {coach}. Quello che vi siete scritti resta leggibile a entrambi.`
- Chiusura rifiutata: `C'è ancora una sessione in calendario il {data}. Annullala, oppure chiudi il percorso dopo.`
- Riapertura: `Riapri il percorso con {coach}`
- Riapertura non consentita: `Il percorso è chiuso da {coach}. Solo {coach} può riaprirlo.`

**Coach — Dall'ultimo incontro**
- Titolo: `DALL'ULTIMO INCONTRO`
- Esiti: `Provata` · `Non ancora` · `Non era adatta al momento`
- Tipi: `È andata bene` · `Difficoltà` · `Domanda`
- Replay: `Cosa è successo:` · `Come ha reagito:` · `Cosa vuole riprovare:`
- Modificato: `aggiornato`
- Vuoto: `Dall'ultima seduta non è arrivato niente.`

**Notifiche.** Nessun testo nuovo in v1 (§10.1).

---

## 10. Implementazione

### 10.1 Notifiche fuori dalla v1

Nessun evento nuovo nel catalogo, nessuna riga in `email_templates`, nessun promemoria
comportamentale. Le notifiche esistenti — richiesta, accettazione, promemoria a 24 e 1
ora, nuovo messaggio, riepilogo pronto — restano invariate.

Aggiungere una notifica «hai provato la tua routine?» significa mettere sul telefono di un
minore un sollecito su un contenuto personale, con il titolo dell'azione leggibile sul
blocco schermo da chiunque abbia il telefono in mano. Non si fa in prima versione.

Come evoluzione futura, e solo se richiesta: un promemoria **facoltativo**, disattivato di
default, con testo generico — «Hai qualcosa da segnare su KaiPai?» — senza titolo
dell'azione, senza nome del coach, senza contenuto personale.

### 10.2 La chat: cosa serve davvero

Il cambio da `getUser()` a `getApiUser(request)` è la parte piccola. Il lavoro reale,
verificato sul codice:

| # | Lavoro | Perché |
|---|---|---|
| 1 | **Rotta di elenco conversazioni** | Esiste solo `/dashboard/chat/[bookingId]`. Non c'è nulla che risponda «quali conversazioni ho» |
| 2 | **Autenticazione su quattro rotte** | `messages` GET e POST, `messages/[id]/attachment` GET, `messages/[id]/reaction` POST — tutte su `getUser()` |
| 3 | **Invio `multipart/form-data`** | `sendMessage` legge `req.formData()`. `request()` in [api.ts](mobile/src/lib/api.ts) impone `Content-Type: application/json`: serve un percorso separato nel client |
| 4 | **Allegati autenticati** | L'immagine è servita da una GET binaria protetta. Un `<Image source={{uri}}>` di React Native non manda il Bearer: serve un download esplicito con intestazione, o un URL firmato a scadenza |
| 5 | **Aggiornamento dei messaggi** | Il web usa un canale Supabase Realtime che spinge un refetch. `@supabase/supabase-js` è già nell'app per l'autenticazione, ma il canale va aperto, chiuso e riaperto al ritorno in primo piano |
| 6 | **Errori e stati** | Chat in sola lettura su prenotazione chiusa (`canViewBookingChatHistory`), messaggio troppo lungo, immagine oltre 4 MB, invio fallito con testo conservato |
| 7 | **Paginazione** | `getChat` carica **tutti** i messaggi della prenotazione, senza limite. Accettabile su una pagina web, non su un elenco mobile che si riapre a ogni avvio |

Per questo la chat è l'ultimo incremento, ed è a sé. Se non arriva in fondo, la scheda non
si pubblica e la navigazione resta a tre voci: nessuna scheda vuota per completare la
barra.

Una chat unificata coach-atleta, un thread che non nasce e non muore con una prenotazione,
richiede un'entità conversazione, la migrazione dei messaggi esistenti e una politica di
conservazione. **Progetto distinto, rinviato.**

### 10.3 Incrementi verticali

Ogni incremento consegna un pezzo di ciclo completo e coerente. Nessuno rilascia una
semantica destinata a essere corretta dopo: in particolare **non esiste una versione
intermedia in cui «Provata» chiude l'impegno.**

| # | Incremento | DB | Cosa funziona alla fine |
|---|---|---|---|
| 1 | **Permessi e modello minimo**: `coach_athlete_paths`, `coach_athlete_path_events`, backfill beta, attivazione su `accepted`, moduli puri `path-policy.ts` con test | **sì** | Esiste un percorso esplicito, attivato e chiudibile. Nessuna UI nuova |
| 2 | **Azione → prova → lettura del coach**: `commitment_attempts`, `athlete-today.ts`, rotte, scheda Oggi, «Segna una prova», blocco «Dall'ultimo incontro» su web e app | **sì** | Il ciclo minimo è chiuso: Marco assegna, Giulia prova più volte, Marco lo legge in preparazione |
| 3 | **Momento e Replay**: `athlete_moments`, rotte, foglio, destinatario verificato, righe nel blocco del coach | **sì** | Ciò che succede fra due sedute arriva alla seduta |
| 4 | **Percorso e riepilogo condiviso**: condivisione degli obiettivi, `athlete-journey.ts`, scheda Percorso, riepilogo condiviso su mobile, gestione del percorso | **sì** (colonne su `athlete_journey_goals`) | L'atleta vede obiettivo condiviso, ciò che ha fatto, ciò che il coach gli ha restituito, e può revocare o chiudere |
| 5 | **Chat mobile**, con tutto §10.2 | no | Se non è completo, non si pubblica |

La barra a schede entra con l'incremento 2, con due voci per l'atleta (Oggi, Sessioni) e
cresce con gli incrementi 4 e 5. `CallScreen` resta **fuori** dallo stack a schede: è un
overlay `absoluteFill` che deve sopravvivere al cambio di scheda, ed è il motivo per cui
la chiamata ridotta funziona oggi.

---

## 11. Criteri di accettazione e verifica

### 11.1 Modello e permessi

1. **Attivazione.** Una prenotazione che raggiunge `accepted` crea il percorso se non
   esiste. `requested`, `declined`, `expired`, `cancelled` e un preferito non lo creano.
2. **Isolamento fra coach.** Con due percorsi attivi, nessuna lettura del coach A
   restituisce contributi del percorso B. Verificato per prove, momenti, obiettivi
   condivisi e blocco di preparazione, ciascuno con il suo caso.
3. **Coerenza dell'impegno allegato.** Un momento con `commitment_id` appartenente a un
   altro percorso viene rifiutato dal server.
4. **Chiusura.** Su percorso chiuso, ogni scrittura è rifiutata; ogni lettura dello
   storico già condiviso continua a funzionare per entrambi.
5. **Chiusura con sessione futura.** La chiusura è rifiutata e il messaggio nomina la data.
6. **Riapertura.** Accettare una nuova prenotazione non riapre un percorso chiuso. Solo
   chi ha chiuso riapre.
7. **Revoca.** Con `contributions_revoked_at`, il coach non vede più i contributi
   dell'atleta, passati e futuri; il percorso resta attivo; nulla è cancellato.
8. **Nessuna modifica agli obiettivi.** Dopo qualunque prova o chiusura di un'azione,
   `athlete_journey_goals` è invariato — righe, stato e `updateddate`.
9. **Nessuna visibilità retroattiva.** Dopo la migrazione, nessun obiettivo esistente ha
   `shared_at` valorizzato, e la proiezione atleta è vuota.
10. **Moduli storici.** Per Mental Journey, segnalibri e Session Compass, un caso su
    percorso chiuso verifica che il comportamento sia **identico a quello di oggi**.

### 11.2 Comportamento

11. **Persistenza dopo riavvio.** Una prova salvata è ancora lì dopo la chiusura forzata e
    la riapertura dell'app, senza dipendere dalla cache in memoria.
12. **Idempotenza.** Due invii con lo stesso `client_request_id` producono una riga sola e
    la seconda risposta è un successo, non un errore.
13. **Testo preservato negli errori temporanei.** Timeout, `network_unreachable` e 5xx
    lasciano il testo nel campo e mostrano un messaggio che dice cosa fare. Non si perde
    quello che una persona ha scritto.
14. **Paginazione.** «Cosa hai fatto» e l'elenco delle conversazioni caricano a pagine, non
    tutto. Il test copre la seconda pagina e l'assenza di duplicati al confine.
15. **Nessuno storage locale non protetto.** Testi di prove e momenti non finiscono in
    `AsyncStorage`, in una cache su disco, né in un log. Le bozze non salvate restano in
    memoria e si perdono alla chiusura: è la scelta corretta per questi contenuti, ed è
    detta all'utente solo se rilevante.
16. **Continuità dopo un riscontro.** Dopo una prova, la schermata torna allo stato 3 con
    la prova nell'elenco, non a uno stato vuoto.
17. **Compatibilità con la versione precedente dell'app.** Le rotte esistenti non cambiano
    forma; le nuove sono additive. Una build vecchia che riceve campi nuovi li ignora, e
    non riceve mai un campo rimosso. Un caso di test costruisce le risposte attuali e
    verifica che restino valide.
18. **Nessuna regressione della chiamata.** Con la chiamata attiva, cambiare scheda,
    tornare, minimizzare ed espandere non riconnette la stanza e non interrompe l'audio.
    Verificabile **solo su dispositivo**.

### 11.3 Dove girano i test

- **Puri, locali, in `npm test`:** `path-policy`, `athlete-today`, `commitment-attempts`,
  `athlete-moments`, `athlete-journey`, più le estensioni di `session-commitments.test.ts`
  e `session-brief.test.ts`. Da aggiungere allo script `test`, come prescrive `CLAUDE.md`.
- **Permessi e RLS: mai sulla produzione.** Girano su un database isolato attraverso
  `requireTestDatabaseUrl` ([test-database.ts](lib/core/ai-session-notes/test-database.ts)),
  che esiste già e impone `TEST_DATABASE_URL` diverso da `POSTGRES_URL`. Oggi **nessuno
  script lo usa**: `ai-session-notes-rls.mjs`, `ai-session-notes-commitments-rls.mjs` e
  `database-function-security.mjs` leggono `POSTGRES_URL` direttamente. I nuovi test dei
  permessi nascono sul database isolato; portare anche i tre esistenti è un lavoro
  separato e va fatto.
- **Verifiche ancora bloccate, da dichiarare:** il database isolato non esiste ancora come
  ambiente. Finché non c'è, i criteri da 1 a 10 **non sono verificabili**, e nessuno di
  essi va provato in produzione per aggirare l'ostacolo. È la prima dipendenza da
  risolvere, prima dell'incremento 1.
- **Solo su dispositivo:** permessi, tastiera, fogli dal basso, ritorno in primo piano,
  rete assente, criterio 18. Il livello raggiunto va dichiarato ogni volta:
  `typecheck/test`, `emulator`, `Android fisico`, `iOS fisico`.

---

## 12. Evidenze

### 12.1 Numeri, con fonte e data

| Numero | Fonte | Data | Stato |
|---|---|---|---|
| 8 report Session Compass approvati, 6 in `ready_for_review`, in tutta la piattaforma | Interrogazione del database di produzione, annotata in una nota di sessione | 2026-08-20 | **Non ri-verificato oggi** |
| «Gli impegni aperti sono una decina in tutto, circa uno per atleta» | Commento in [session-brief.ts](lib/core/ai-session-notes/session-brief.ts), ultimo commit `e9d0dae` | 2026-08-26 | **Non verificato**: è un'affermazione nel codice, non una misura ripetuta |
| 58 tabelle nello schema | `grep -c "= pgTable("` su `lib/db/schema.ts`, e `meta/0066_snapshot.json` | 2026-09-09 | Verificato in questa sessione |
| 67 migrazioni, 31 snapshot | `lib/db/migrations` e `meta/_journal.json` | 2026-09-09 | Verificato in questa sessione |
| «Paga il coach, tramite abbonamento» | **Ritirato.** Il checkout Stripe in [checkout/route.ts](app/api/stripe/checkout/route.ts) opera su `teams` e non è ristretto per ruolo | 2026-09-09 | **Non determinabile dal repository** |

Ne segue che ogni «pagatore ipotizzato» in §13 è un'ipotesi doppia: su chi trarrebbe
valore, e su chi paga oggi. Nessuna disponibilità a pagare è validata.

### 12.2 `db:generate`: la causa, prima della cura

L'affermazione della revisione 1 — «`db:generate` ricrea tutto» — era una lettura sbagliata
di uno stato locale, presentata come proprietà dello strumento. Lo stato reale:

- 67 voci in `meta/_journal.json`, **31** file di snapshot;
- mancano gli snapshot da `0021` a `0056`: quelle migrazioni sono state scritte a mano
  senza rigenerare l'istantanea;
- **la testa della catena è però allineata**: `meta/0066_snapshot.json` contiene 58 tabelle,
  quante ne dichiara `lib/db/schema.ts` oggi.

`drizzle-kit generate` calcola la differenza fra lo schema e **l'ultimo snapshot**. Con la
testa allineata, oggi produce una differenza incrementale normale. Il comportamento di
ricreazione osservato in passato si spiega con una testa che, in quel momento, era
indietro rispetto alle migrazioni scritte a mano.

Regola operativa, senza correzioni manuali per superstizione:

1. prima di generare, confrontare le tabelle nell'ultimo snapshot con quelle di
   `schema.ts`; se il numero diverge, la testa è indietro e va sistemata **prima**;
2. leggere l'SQL prodotto per intero;
3. correggerlo a mano solo se contiene qualcosa che non si è chiesto, e **scrivendo nel
   file della migrazione perché**;
4. solo allora migrare.

I buchi da `0021` a `0056` restano un debito da sanare separatamente: non impediscono di
generare oggi, ma rendono impossibile ricostruire lo schema a una revisione intermedia.

### 12.3 Test: riclassificati su cosa eseguono

La revisione 1 classificava per prefisso del comando. Verificato file per file:

| Comando | Cosa fa davvero | Sicuro fuori produzione? |
|---|---|---|
| `npm test` | `tsx --test` su moduli puri, incluso un modulo mobile | **Sì**, nessuna rete, nessun database |
| `test:ai-notes:integration` | Percorso di trascrizione **simulato**: provider con `fetch` finto, timeline ricomposta in memoria. Nessuna rete verso Deepgram, LiveKit o lo storage | **Sì.** Era classificato male |
| `test:ai-notes:testability` | `tsx --test` su moduli con iniezione delle dipendenze, storage in memoria | **Sì.** Era classificato male |
| `test:ai-notes:flow` | Regole pure di consenso e macchina a stati, ma **apre una connessione** a `POSTGRES_URL` | No: punta al database configurato |
| `test:ai-notes:schema` | Interroga il catalogo di sistema. **Sola lettura**, nessuna DDL, nessuna scrittura | Legge la produzione, non la modifica |
| `test:ai-notes:rls`, `test:db:function-security` | Interrogano `POSTGRES_URL` per verificare politiche e funzioni | Leggono la produzione |
| `test:ai-notes:commitments-rls` | **Scrive** due percorsi di prova dentro una transazione sempre annullata | Non lascia dati, ma scrive sulla produzione |
| `test:ai-notes:recording`, `:processing`, `:admin`, `:control-room` | Toccano infrastruttura e dati reali | No |
| `e2e`, `e2e:mobile` | Percorso completo su ambiente reale | No |

Regola: i due riclassificati possono entrare in una verifica ordinaria; tutto ciò che
apre `POSTGRES_URL` no, nemmeno in sola lettura, finché non punta al database isolato.

---

## 13. Le funzioni, valutate

Pagatore **ipotizzato**, e vedi §12.1: chi paga oggi non è determinabile dal repository.
Nessuna disponibilità a pagare è validata.

### A · Azione del coach sul telefono

- **Problema:** l'azione concordata resta nel riepilogo, dove l'atleta non passa.
- **Beneficiario:** atleta; il coach di rimbalzo. **Pagatore ipotizzato:** coach, non
  validato e non determinabile.
- **KPI:** quota di azioni che ricevono almeno una prova prima della seduta successiva.
- **Validazione:** confronto prima e dopo su tre coach. Non un A/B: i volumi non lo
  reggono (§12.1).
- **Complessità:** bassa, il dominio esiste. **Priorità: 1.**
- **Attenzione ai dati:** la proiezione atleta non porta mai `sourceExcerpt`.

### B · Prove ripetute con esito e nota

- **Problema:** «fatto / non fatto» perde sia la sfumatura sia la ripetizione.
- **Beneficiario:** entrambi. **Pagatore ipotizzato:** coach.
- **KPI:** prove per azione (mediana); quota di azioni con più di una prova; quota di
  prove con nota.
- **Validazione:** leggere con due coach venti note reali e chiedere se cambiano la seduta.
- **Complessità:** media: tabella nuova, idempotenza, correzioni. **Priorità: 1.**
- **Attenzione:** l'atleta è l'unico autore. Le decisioni del coach restano
  sull'impegno. Nessun testo nell'audit.

### C · Segna un momento

- **Problema:** fra due sedute succede tutto, e non ne resta niente.
- **Beneficiario:** atleta che scrive, coach che legge. **Pagatore ipotizzato:** coach.
- **KPI:** quota di sedute che hanno almeno un momento nella preparazione. Il successo non
  è il numero di momenti: è che il coach li apra prima della seduta.
- **Validazione:** chiedere a tre coach se il blocco ha cambiato l'inizio della seduta.
- **Complessità:** media. **Priorità: 2.**
- **Attenzione:** contenuto sensibile, anche di minori. Destinatario verificato dal server,
  nessun accesso del tutore, nessun modello che lo legge, rimozione sempre possibile.

### D · Il mio Replay

- **Problema:** «cosa è successo» da solo non prepara niente.
- **Beneficiario:** atleta. **Pagatore ipotizzato:** coach.
- **KPI:** quota di momenti con tutti e tre i campi.
- **Validazione:** qualitativa. Sotto il venti per cento, i campi sono di troppo.
- **Complessità:** molto bassa: due campi sulla stessa riga. **Priorità: 2.**
- **Attenzione:** «come ho reagito» è il campo più intimo del prodotto. Nessuna analisi,
  nessuna citazione automatica, nessun riuso in un prompt.

### E · «Dall'ultimo incontro» per il coach

- **Problema:** il coach entra in seduta senza sapere cosa è successo nel mezzo.
- **Beneficiario:** coach. **Pagatore ipotizzato:** coach; è la funzione più vicina a una
  disponibilità a pagare, e resta non validata.
- **KPI:** aperture della preparazione nei dieci minuti prima della seduta.
- **Validazione:** tre coach, quattro settimane, una domanda sola.
- **Complessità:** bassa: `buildSessionBrief` è puro e testato. **Priorità: 1.**
- **Attenzione:** le parole dell'atleta si riportano, non si riassumono. Nessun modello.

### F · Percorso esplicito

- **Problema:** l'autorizzazione ai contributi è derivata da una prenotazione qualsiasi.
- **Beneficiario:** atleta, e chiunque debba rispondere di chi vede cosa.
- **Pagatore ipotizzato:** nessuno. È infrastruttura, e non si vende.
- **KPI:** nessuno di prodotto. Si misura in difetti evitati.
- **Validazione:** i criteri da 1 a 10 di §11.1, sul database isolato.
- **Complessità:** media. **Priorità: 1** — è la precondizione di tutto il resto.
- **Attenzione:** è il confine di sicurezza del progetto.

### G · Percorso, lato atleta

- **Problema:** l'atleta non vede il proprio percorso sul telefono.
- **Beneficiario:** atleta. **Pagatore ipotizzato:** nessuno individuato.
- **KPI:** aperture ripetute; aperture di un riepilogo condiviso.
- **Validazione:** con i volumi di §12.1 la scheda sarà a lungo quasi vuota. Non è un
  difetto, ed è per questo che i vuoti dicono perché.
- **Complessità:** media. **Priorità: 3.**
- **Attenzione:** proiezione costruita per aggiunta. Il Percorso Mentale del coach non
  passa da qui.

---

## 14. Decisioni residue

**Nessuna aperta.** Le due della revisione 2 sono state decise:

- **Chi chiude un'azione** — solo il coach, in v1. L'atleta mette in pausa (§2.5), che è
  reversibile e non gli chiede un giudizio di conclusione.
- **Cosa vede il coach di una prova corretta** — il contenuto corrente con l'indicazione
  «Modificato». Nessuna versione precedente, e nessun archivio che la conservi (§2.6).

Restano decise anche dalla revisione 2: gli obiettivi arrivano all'atleta solo se
condivisi (§3); la fine della relazione è una chiusura esplicita e tracciata, non una
soglia temporale (§4).

Le uniche scelte ancora da fare sono operative, non di prodotto, e sono elencate come
rischi residui in [docs/15_Incremento_1_Percorso_e_Prove.md](docs/15_Incremento_1_Percorso_e_Prove.md).

---

## 15. Cosa questo progetto non fa

Niente contenuti pubblici, classifiche, punteggi, confronti fra atleti. Nessuna serie da
non interrompere. Nessun like, nessuna reazione sui momenti, nessun feed infinito. Nessuna
analisi emotiva nuova, e nessun modello che legga i contributi. Nessuna notifica nuova.
Nessuna promessa di lettura o di risposta. Nessun accesso automatico dei genitori:
`athlete_guardians` autorizza la partecipazione, non la lettura, e nessuna rotta di questo
progetto accetta un token tutore.

Il successo di questa app non è il tempo che ci si passa dentro. È che lunedì alle 18 la
seduta cominci da qualcosa di vero.
