# Sistema notifiche email + in-app KaiPai — design

Data: 2026-08-04
Branch: `agent/worker-trigger-immediato` (da spostare su branch dedicato)

## 1. Principio guida

Il sottosistema in-app esistente (`notifications`, campanellina, `/api/notifications`,
`notify()`) **non viene riscritto**. Viene estesa la sola gamba email:

```
evento di dominio
      │
      ▼
   notify(eventKey, recipientUserId, ctx)          ← già esistente, esteso
      ├─ canale IN-APP  → createNotification()      ← invariato
      ├─ canale EMAIL   → NUOVO pipeline (sotto)
      └─ canale PUSH    → sendPushToUser()          ← invariato
```

Nuovo pipeline email:

```
catalogo eventi (codice)  ──┐
preferenze utente (DB)    ──┤
                            ├─► resolveEmailDecision() ─► send | skip
template attivo (DB)      ──┤
layout KaiPai (codice)    ──┘
                            │
                            ▼
             notification_email_deliveries  (idempotenza + log)
                            │
                            ▼
                    provider (Resend)
```

## 2. Separazione delle responsabilità

| Cosa | Dove vive | Perché |
|---|---|---|
| Quali eventi esistono, chi è il destinatario, regole di business | **codice** (`lib/core/notifications/catalog.ts`) | è logica di piattaforma |
| Obbligatorietà, default per canale, variabili ammesse | **codice** (catalogo) | è policy, non contenuto |
| Oggetto e corpo del messaggio, per lingua e versione | **DB** (`email_templates`) | contenuto editabile senza deploy |
| Logo, colori, intestazione, footer, firma | **codice** (`lib/core/email/layout.ts`) | è brand, non deve essere alterabile da DB |
| Esito di ogni invio, deduplica | **DB** (`notification_email_deliveries`) | serve persistenza e unicità |

Il DB non può mai eseguire logica: i template contengono solo testo con
segnaposto whitelistati.

## 3. Catalogo eventi (codice)

17 eventi = 13 già usati nel codice (invariati come stringhe, quindi zero rotture)
+ 4 nuovi canonici.

| key | categoria | esiste già | email obbligatoria |
|---|---|---|---|
| `booking_requested` | appointments | sì | no |
| `booking_created_by_coach` | appointments | sì | no |
| `booking_accepted` | appointments | sì | no |
| `booking_declined` | appointments | sì | no |
| `booking_cancelled` | appointments | sì | no |
| `booking_rescheduled` | appointments | sì | no |
| `booking_completed` | appointments | sì | no |
| `booking_reminder_24h` | appointments | **nuovo** | no |
| `booking_reminder_1h` | appointments | **nuovo** | no |
| `new_message` | messages | sì | no |
| `ai_report_ready` | ai_reports | **nuovo** | no |
| `coach_invitation` | account | **nuovo** | **sì** |
| `security_alert` | security | **nuovo** | **sì** |
| `provider_review_requested` | marketplace | sì | no |
| `provider_approved` | account | sì | no |
| `provider_rejected` | account | sì | no |
| `review_received` | marketplace | sì | no |

`NOTIFICATION_TYPES` e `NOTIFICATION_TYPE_LABELS` restano esportati e derivati dal
catalogo: i call-site esistenti continuano a compilare.

Ogni voce del catalogo dichiara le variabili ammesse nel template, es.
`booking_reminder_24h` → `recipient.firstName`, `booking.date`, `booking.time`,
`coach.name`, `actionUrl`.

## 4. Modello dati

### 4.1 `email_templates` (nuova)

```
id               uuid  PK default gen_random_uuid()
key              text  not null
category         text  not null
subject          text  not null
html_body        text  not null
text_body        text  null
variables        jsonb not null default '[]'
locale           text  not null default 'it-IT'
is_active        boolean not null default true
is_mandatory     boolean not null default false
version          integer not null default 1
created_by       integer null references users(id) on delete set null
created_at       timestamptz not null default now()
updated_at       timestamptz not null default now()

UNIQUE (key, locale, version)
UNIQUE INDEX ... ON (key, locale) WHERE is_active   -- una sola versione attiva
```

`is_mandatory` sul template è informativo/di visualizzazione: l'obbligatorietà
effettiva è decisa dal catalogo in codice (fonte di verità).

### 4.2 `notification_email_deliveries` (nuova)

```
id                  uuid PK default gen_random_uuid()
notification_id     integer null references notifications(id) on delete set null
recipient_user_id   integer null references users(id) on delete set null
recipient_email     text not null
template_key        text not null
template_version    integer null
idempotency_key     text not null UNIQUE
provider_message_id text null
status              text not null default 'queued'   -- queued|sent|failed|skipped
attempt_count       integer not null default 0
last_error          text null
sent_at             timestamptz null
created_at/updated_at timestamptz not null default now()
```

Indici: `(recipient_user_id, created_at desc)`, `(status, created_at)`.
`notification_id` è `integer` perché `notifications.id` è `serial`.

**Chiave di idempotenza** — deterministica sull'evento concreto:

```
v1:{eventKey}:email:{recipientUserId}:{scope}
```

dove `scope` è, in ordine di preferenza:
1. `n{notificationId}` quando esiste la notifica in-app (caso normale);
2. lo scope esplicito dell'evento senza notifica in-app
   (es. `b{bookingId}` per i reminder, `inv{invitationId}`, `r{reportId}`).

Due messaggi diversi → due notifiche in-app → due id → due email. Corretto.
Un retry dello stesso evento → stessa chiave → `ON CONFLICT DO NOTHING` →
0 righe inserite → invio saltato.

### 4.3 `notification_preferences` (estesa, non sostituita)

- resta `id serial`, `user_id integer`, `type varchar(50)`, `email_enabled boolean`;
- resta `UNIQUE(user_id, type)` con il nome esistente
  `notification_preferences_user_type_unique`;
- si aggiunge `in_app_enabled boolean not null default true` — serve alla UI, che
  mostra due colonne, ma il canale in-app resta di fatto sempre attivo per gli
  eventi obbligatori;
- trigger `create_default_notification_preferences` corretto per includere
  l'intero catalogo (oggi mancano `booking_created_by_coach` e
  `booking_rescheduled`);
- il resolver **non dipende** dalle righe: una preferenza mancante ricade sul
  default del catalogo.

### 4.4 RLS

`notifications` e `notification_preferences` oggi non hanno RLS: l'accesso passa
solo dal server Next.js via pooler. Le due nuove tabelle seguono la stessa
convenzione. `notification_email_deliveries` contiene indirizzi email, quindi
riceve `REVOKE ALL ... FROM anon, authenticated` esplicito per impedire che una
futura esposizione PostgREST la renda leggibile.

## 5. Rendering

`lib/core/email/render.ts`:

- sintassi ammessa: **solo** `{{path.to.value}}`;
- nessun blocco, condizione, ciclo, helper, espressione;
- il path deve essere nella whitelist dell'evento, altrimenti
  `TemplateVariableError`;
- valore mancante/undefined → `TemplateVariableError` → l'email **non parte**,
  la delivery va in `failed` con `last_error`, la notifica in-app resta valida;
- ogni valore è HTML-escaped nel ramo HTML, grezzo nel ramo testo;
- `text_body` nullo → derivato automaticamente dall'HTML (strip tag).

`lib/core/email/layout.ts` avvolge il contenuto: logo KaiPai, banda header
rossa `#e11d2a`, corpo, firma, footer con sito `kaipaicoach.com`,
`info@kaipaicoach.com`, link privacy e link alle preferenze notifiche.

## 6. Provider e mittente

Nuove env, con fallback alle esistenti per retrocompatibilità:

```
EMAIL_PROVIDER=resend
EMAIL_FROM_ADDRESS=info@kaipaicoach.com
EMAIL_FROM_NAME=KaiPai
EMAIL_REPLY_TO=info@kaipaicoach.com
```

`RESEND_FROM_EMAIL` resta valido come fallback di `EMAIL_FROM_ADDRESS`.
`isEmailEnabled()` resta il gate: nessun invio senza flag + chiave.

## 7. UI

- `components/user-menu.tsx`: nuova voce "Notifiche" (icona `Bell`) →
  `/dashboard/notifications/preferences`.
- `/dashboard/notifications/preferences`: raggruppata per categoria con etichette
  utente ("Appuntamenti", "Messaggi", "Report AI", "Account", "Sicurezza"),
  nessun nome tecnico esposto. Gli eventi obbligatori appaiono spuntati,
  disabilitati, con la motivazione.
- La campanellina e `/dashboard/notifications` restano invariate.

## 8. File coinvolti

**Nuovi**
```
lib/core/notifications/catalog.ts
lib/core/notifications/idempotency.ts
lib/core/email/layout.ts
lib/core/email/render.ts
lib/core/email/templates.ts          (lettura template attivo + cache + fallback)
lib/core/email/deliveries.ts         (claim idempotente + esito)
lib/core/email/default-templates.ts  (seed / fallback in codice)
lib/db/migrations/0038_email-notifications.sql
lib/db/migrations/0039_notification-preferences-defaults-v2.sql
scripts/seed-email-templates.ts
app/api/internal/notifications/reminders/route.ts
docs/notifications-email.md
```

**Modificati**
```
lib/db/schema.ts                       (+2 tabelle, +in_app_enabled)
lib/core/notifications/index.ts        (catalogo, mandatory, delivery, in_app_enabled)
lib/core/email/index.ts                (sendTemplatedEmail; le funzioni esistenti restano)
lib/core/flags.ts                      (nuove env con fallback)
components/user-menu.tsx               (voce "Notifiche")
app/(dashboard)/dashboard/notifications/preferences/page.tsx
app/(dashboard)/dashboard/notifications/actions.ts
vercel.json                            (cron reminder orario)
.env.example
```

## 9. Fasi

1. **DB** — schema Drizzle + migrazioni 0038/0039.
2. **Catalogo** — `catalog.ts`, `NOTIFICATION_TYPES` derivati, retrocompat.
3. **Email layer** — layout, renderer whitelisted, store template + fallback, seed.
4. **Integrazione** — `notify()` usa catalogo + template + deliveries idempotenti.
5. **Nuovi eventi** — `ai_report_ready`, `coach_invitation`, `security_alert`,
   reminder 24h/1h + cron.
6. **UI** — voce di menu + pagina preferenze per categoria con obbligatorie bloccate.
7. **Test e documentazione**.

## 10. Rischi noti

- Il DB di sviluppo coincide con quello di produzione: ogni `db:migrate` locale
  tocca la produzione. Le migrazioni sono quindi additive e idempotenti
  (`IF NOT EXISTS`, `CREATE OR REPLACE`), senza `DROP` distruttivi.
- I reminder introducono un cron nuovo: finché `EMAIL_NOTIFICATIONS_ENABLED` è
  falso producono solo notifiche in-app.
