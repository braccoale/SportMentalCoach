# Appunti AI della sessione — Fase 1

## Ambito

Questa fase introduce entitlement, consenso, macchina a stati, API e UI
preparatoria. Non registra né invia audio/video, non usa LiveKit Agent, non
trascrive e non genera report. Lo stato `active` indica soltanto che tutti i
partecipanti autenticati del booking hanno accettato la simulazione.

Gli appuntamenti del prodotto sono righe `bookings`; la stanza LiveKit viene
sempre derivata sul server come `booking-{booking_id}`.

## Entitlement

Feature code:

```text
AI_SESSION_NOTES
```

L'accesso è valutato esclusivamente sul server tramite:

```ts
getFeatureAccess(userId, FEATURE_CODES.AI_SESSION_NOTES)
hasFeatureEntitlement(userId, FEATURE_CODES.AI_SESSION_NOTES)
```

La valutazione considera stato, inizio, scadenza e limite utilizzi. Soltanto
`enabled` e `trial` possono concedere accesso. L'avvio blocca la riga con
`FOR UPDATE`, rivaluta l'accesso e incrementa `usage_count` nella stessa
transazione che crea sessione e consensi.

### Abilitazione amministrativa

Metodo raccomandato:

1. accedere con ruolo `admin`;
2. aprire `/dashboard/admin/ai-notes`;
3. scegliere **Abilita** oppure **Trial 30 gg** per l'utente desiderato.

Esempio SQL parametrico, da eseguire soltanto con credenziali amministrative:

```sql
INSERT INTO public.user_feature_entitlements (
  user_id,
  feature_code,
  status,
  source,
  starts_at,
  usage_limit,
  usage_count,
  metadata,
  createdby,
  updatedby
) VALUES (
  :user_id,
  'AI_SESSION_NOTES',
  'enabled',
  'admin',
  now(),
  NULL,
  0,
  '{}'::jsonb,
  :admin_user_id,
  :admin_user_id
)
ON CONFLICT (user_id, feature_code) DO UPDATE SET
  status = 'enabled',
  source = 'admin',
  starts_at = now(),
  expires_at = NULL,
  usage_limit = NULL,
  usage_count = 0,
  updatedby = :admin_user_id;
```

Revoca:

```sql
UPDATE public.user_feature_entitlements
SET status = 'disabled',
    updatedby = :admin_user_id
WHERE user_id = :user_id
  AND feature_code = 'AI_SESSION_NOTES';
```

Non inserire email o UUID nelle migrazioni. Risolvere gli ID applicativi nella
console admin o in una query amministrativa separata.

Per un trial usare **Trial 30 gg** nella stessa pagina. `starts_at`,
`expires_at`, stato, limite e conteggio utilizzi vengono valutati sul server a
ogni lettura e di nuovo, con lock, all'avvio. Un trial scaduto è quindi negato
anche se la pagina era già aperta. La revoca imposta immediatamente `disabled`;
il browser non può modificare direttamente la riga.

## Flusso e stati

Transizioni ammesse:

```text
waiting_for_consent -> active | consent_rejected | cancelled
active              -> processing | cancelled
processing          -> ready_for_review | transcription_failed | report_failed
ready_for_review    -> approved
approved            -> shared
```

Fase 1 usa soltanto i primi quattro stati. La transizione è centralizzata in
`lib/core/ai-session-notes`; le route non aggiornano direttamente `status`.

Avvio:

1. sessione Supabase Auth valida;
2. booking esistente e `accepted`;
3. richiedente uguale al coach del provider;
4. entitlement valido;
5. LiveKit configurato, stanza canonica e finestra di chiamata valida;
6. nessun'altra sessione AI non terminale;
7. creazione atomica di sessione, due consensi e audit;
8. incremento atomico dell'utilizzo.

Ogni utente decide soltanto il proprio consenso. L'API non accetta `user_id`.
Il primo `accepted` lascia la sessione in attesa; il secondo la porta ad
`active`. Un rifiuto produce `consent_rejected`. Una revoca durante `active`
produce `cancelled`.

## API

| Metodo | Route | Autorizzazione |
|---|---|---|
| `POST` | `/api/ai-session-notes/start` | coach partecipante + entitlement |
| `POST` | `/api/ai-session-notes/:id/consent` | partecipante, solo consenso proprio |
| `POST` | `/api/ai-session-notes/:id/cancel` | coach del booking |
| `GET` | `/api/ai-session-notes/:id` | partecipante |
| `GET` | `/api/appointments/:id/ai-session-notes` | partecipante |

Le risposte non includono transcript, report, note private, metadati IP/user
agent o hash del consenso.

## Database

Migrazione fondativa applicata:
`0029_ai-session-notes-phase-1.sql`.

Durante la validazione reale sono state applicate anche due correzioni
forward-only:

- `0030_ai-session-notes-rls-policy-helpers.sql`, per rendere le policy
  partecipante indipendenti dalle RLS già presenti su booking e profili;
- `0031_ai-session-notes-client-grants-hardening.sql`, per rimuovere da
  `anon` e `authenticated` anche `TRUNCATE`, `REFERENCES` e `TRIGGER`, non
  protetti dalla RLS.

Database validato: database `postgres` del progetto Supabase
`jrodecctnyfigmgussxg.supabase.co`, raggiunto tramite pooler europeo sulla
porta 6543. È stato trattato come ambiente remoto condiviso/production-like:
sono state eseguite soltanto migrazioni incrementali, senza reset o
cancellazioni dati.

Tabelle:

- `user_feature_entitlements`
- `session_ai_notes`
- `session_ai_consents`
- `session_transcript_segments`
- `session_ai_reports`
- `session_ai_audit_events`

I nuovi timestamp sono `timestamptz`. Tutte e soltanto le sei tabelle della
Fase 1 usano i nomi audit richiesti, senza underscore: `createddate`,
`createdby`, `updateddate`, `updatedby`. Il trigger `set_updateddate()` aggiorna
`updateddate`; gli eventi audit restano append-only a livello applicativo.

Il catalogo PostgreSQL è stato verificato direttamente dopo le migrazioni:
sei tabelle, colonne, foreign key, check/unique constraint, indici (incluso
l'unico open AI session per booking), RLS e sei trigger risultano presenti.

## RLS

RLS è abilitata su tutte le nuove tabelle.

- entitlement: SELECT proprio o admin;
- sessione AI: SELECT dei partecipanti al booking o admin;
- consenso: SELECT soltanto della propria riga o admin;
- report: SELECT diretto soltanto del coach del booking o admin;
- transcript e audit: nessuna policy client;
- INSERT/UPDATE/DELETE client revocati su tutte le tabelle sensibili.

Inoltre `anon` non ha accesso alle sei tabelle e nessun ruolo browser conserva
`INSERT`, `UPDATE`, `DELETE` o `TRUNCATE`. `service_role` mantiene i privilegi
backend previsti, inclusi segmenti e audit. L'admin autenticato può leggere
tramite RLS, ma abilita e revoca soltanto attraverso la server action, che
ricontrolla il ruolo e registra un evento audit.

Non esiste una policy UPDATE diretta neppure per il proprio consenso: la
scrittura passa dalla route server per mantenere atomici consenso, stato e
audit. L'atleta non riceve accesso diretto a `session_ai_reports`, perché la
riga contiene `private_coach_notes`; una futura condivisione userà una
proiezione server del solo `shared_report_json`.

Verifica su database migrato:

```powershell
npm.cmd run test:ai-notes:rls
```

Lo script crea fixture in una transazione destinata al rollback, impersona il
ruolo Supabase `anon`, `authenticated` e `service_role` e verifica coach,
atleta, outsider, admin, isolamento, IDOR, note private, divieti di scrittura
e assenza del privilegio `TRUNCATE`.

## Test

I test unitari coprono:

- tutti gli esiti dell'entitlement;
- autorizzazione all'avvio;
- transizioni valide e invalide;
- audit `updateddate` / `updatedby`;
- proprietà e idempotenza del consenso;
- attivazione solo dopo tutti i consensi;
- rifiuto e revoca sicuri.

Il test di integrazione usa le tabelle reali in una transazione con rollback e
copre:

```text
waiting_for_consent
→ consenso coach (atleta ancora pending)
→ waiting_for_consent
→ consenso atleta
→ active
→ revoca
→ cancelled
```

Copre inoltre `consent_rejected`, tentativo outsider e ripetizioni idempotenti.
Il verificatore admin esegue il percorso server reale per autorizzazione,
proiezione dati minima, enable, trial valido e scaduto, revoca e audit, quindi
rimuove puntualmente le sole righe di test.

Comandi:

```powershell
npm.cmd test
npm.cmd run test:ai-notes:rls
npm.cmd run test:ai-notes:flow
npm.cmd run test:ai-notes:admin
npx.cmd tsc --noEmit
npm.cmd run build
```

Risultati della validazione del 30 luglio 2026:

- suite repository: 78 test superati, 0 falliti;
- RLS reale: OK;
- flusso consenso DB: 42 asserzioni, tutte superate;
- admin server-side: OK;
- TypeScript: OK;
- build di produzione: OK.

La UI mantiene il backend come fonte dello stato: polling no-cache, recupero
della sessione esistente dopo refresh/riapertura, errori API visualizzati,
lock immediato anti-doppio clic, stato `aria-busy` e testi di caricamento.

## Privacy e rischi residui

- Nessun IP completo viene raccolto. `ip_metadata` registra soltanto che non è
  stato raccolto; lo user agent è limitato a 256 caratteri e non appare nelle
  API.
- Gli inviti LiveKit guest non corrispondono a un utente applicativo. Il link
  contiene un token applicativo firmato e temporaneo con `bookingId`,
  `inviterUserId` e `inviteId`; al join viene nuovamente verificato il booking
  e viene emesso un token LiveKit con identity casuale
  `guest-<random UUID>`, nome `Ospite` e nessun metadata o collegamento a una
  riga `users`.
- Regola vincolante per la Fase 2:

  > La trascrizione non può iniziare se nella stanza è presente un partecipante privo di identità applicativa e di consenso verificabile.

- Per l'MVP la strategia consigliata è impedire Appunti AI quando è presente un
  guest non autenticato. È l'opzione più semplice e sicura: prima di qualsiasi
  futura acquisizione, il backend dovrà censire i partecipanti LiveKit e
  bloccare sia l'avvio sia nuovi join guest mentre Appunti AI è attivo. Le
  alternative (identità guest temporanea o consenso monouso firmato) richiedono
  un modello legale e di revoca più complesso.
- Il polling ogni tre secondi è intenzionalmente semplice. Realtime potrà
  sostituirlo senza cambiare API o macchina a stati.
- Gli stati futuri sono predisposti ma nessun worker può ancora raggiungerli.

## Rollback

Il repository usa migrazioni forward-only. Un rollback manuale deve eliminare,
nell'ordine:

1. `session_ai_audit_events`;
2. `session_ai_reports`;
3. `session_transcript_segments`;
4. `session_ai_consents`;
5. `session_ai_notes`;
6. `user_feature_entitlements`;
7. `current_app_user_is_admin()`, `current_app_user_id()` e
   `set_updateddate()`;
8. `current_app_user_participates_in_booking(integer)` e
   `current_app_user_coaches_ai_session(integer)`.

Il rollback elimina dati di consenso e audit e deve quindi essere approvato
esplicitamente prima dell'esecuzione.

## Fase 2 consigliata

1. censimento server-side dei partecipanti LiveKit, inclusi guest;
2. gestione revoca immediata lato Agent;
3. servizio backend/Agent con credenziale dedicata e insert transcript negati
   a ogni client;
4. STT con retention e data processing agreement definiti;
5. generazione report strutturato senza diagnosi o inferenze cliniche;
6. revisione obbligatoria del coach e condivisione del solo JSON approvato;
7. quota atomica e riconciliazione con piano/add-on;
8. cancellazione/retention e strumenti per i diritti privacy.
