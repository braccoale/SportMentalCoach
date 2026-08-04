# Notifiche: in-app, email e push

Tre canali indipendenti per lo stesso evento di dominio. L'in-app resta la
fonte di verità: se un'email non parte, la notifica nella campanellina c'è
comunque.

```
evento di dominio
      │
      ▼
   notify(eventKey, recipientUserId, ctx)
      ├─ in-app  → notifications                  (sempre, se l'evento ne prevede una)
      ├─ email   → email_templates + layout       (se abilitata e non disattivata)
      └─ push    → push_subscriptions             (se ci sono VAPID key)
```

## Dov'è cosa

| Cosa | File | Modificabile a runtime |
|---|---|---|
| Catalogo eventi, destinatari, obbligatorietà, variabili ammesse | `lib/core/notifications/catalog.ts` | no (è logica) |
| Copy in-app | `lib/core/notifications/index.ts` (`buildContent`) | no |
| Eyebrow, oggetto, titolo, corpo, chiusura delle email | tabella `email_templates` | **sì** |
| Copy email di fallback | `lib/core/email/default-templates.ts` | no |
| Layout, logo, colori, firma, footer | `lib/core/email/layout.ts` | no |
| Righe della card dei dettagli | `lib/core/email/booking-context.ts` | no |
| Date e orari (Europe/Rome, italiano) | `lib/core/email/format.ts` | no |
| Rendering e whitelist segnaposto | `lib/core/email/render.ts` | no |
| Chiavi di deduplica | `lib/core/notifications/idempotency.ts` | no |
| Log invii | tabella `notification_email_deliveries` | — |

## Anatomia di un'email

```
┌──────────────────────────────────┐
│ logo KaiPai su antracite         │  layout (codice)
├──────────────────────────────────┤  banda rossa
│ EYEBROW                          │  DB
│ Titolo                           │  DB
│ Paragrafi del corpo              │  DB (prosa, niente markup)
│ ┌ card dei dettagli ───────────┐ │  codice, righe vuote omesse
│ │ Etichetta      valore        │ │
│ └──────────────────────────────┘ │
│ [ CTA antracite ]                │  etichetta in codice
│ URL in chiaro                    │  fallback obbligatorio
│ Chiusura                         │  DB
│ Firma + footer                   │  layout (codice)
└──────────────────────────────────┘
```

Il pulsante è antracite, non rosso: un pill rosso isolato su bianco si legge
come allarme, e lo stesso pulsante deve reggere sia "Sessione confermata" sia
"Sessione annullata". Il rosso resta accento — banda, eyebrow, bordo della card.

### Prosa o card?

La regola che decide dove mettere un dato:

- **prosa** (segnaposto nel template) solo per valori **sempre presenti**. Il
  renderer è fail-closed: un valore mancante blocca l'invio;
- **card** (codice) per tutto ciò che è opzionale — orario proposto, sport,
  obiettivo, nota. Le righe senza valore spariscono in silenzio.

Da qui la scelta di `session.label`, che è una locuzione completa ("una sessione
Conoscitiva" oppure "una sessione") e non il solo titolo: interpolare un titolo
mancante dentro "una sessione {{titolo}}" produrrebbe "una sessione sessione".

I dati degli appuntamenti non passano dai call-site: li carica
`loadBookingEmailData(bookingId)` con una query sola, dentro `after()`.

## Anteprime

```bash
pnpm email:preview      # renderizza i 17 eventi in tmp/email-preview/ (html + txt)
pnpm email:shoot        # screenshot PNG delle anteprime
pnpm email:build-logo   # rigenera public/email/kaipai-logo.png
```

L'anteprima include il caso limite `_edge-minimal`: richiesta senza orario
proposto, senza servizio, senza sport e senza nota — la card deve restare
sensata e non mostrare "undefined".

## Aggiungere un evento

1. aggiungilo a `NotificationEventKey` e a `NOTIFICATION_EVENTS` in
   `catalog.ts` (categoria, label, obbligatorietà, variabili ammesse);
2. aggiungi il `case` in `buildContent` per la copy in-app;
3. aggiungi la copy email in `default-templates.ts`;
4. se serve, aggiungilo alla lista della funzione SQL
   `notification_preference_default_types()` con una nuova migrazione;
5. `pnpm test` — i test verificano che i segnaposto usati siano whitelistati;
6. `pnpm email:seed-templates` per scrivere il template a database.

Non serve toccare la pagina delle preferenze: si costruisce dal catalogo.

## Template a database

- chiave logica: `(key, locale, version)`, con vincolo univoco;
- **una sola versione attiva** per `(key, locale)`, garantita da un indice
  unico parziale su `is_active`;
- pubblicare copy nuova significa inserire `version + 1` e spostare
  `is_active`, non modificare la riga esistente;
- tabella vuota = comportamento invariato: il codice usa i default.

```bash
pnpm email:seed-templates            # inserisce solo le chiavi mancanti
pnpm email:seed-templates --publish  # pubblica v+1 e archivia la precedente
```

Il `--publish` lavora in transazione per chiave: disattiva l'attuale e inserisce
la nuova, perché l'indice parziale ammette una sola riga attiva. Lo storico non
viene mai cancellato — per tornare indietro basta rimettere `is_active` sulla
versione voluta.

## Email di autenticazione

Verifica indirizzo, recupero password, magic link e cambio email **non passano
da questa pipeline**: le manda Supabase Auth con i propri template.

```bash
pnpm email:supabase-auth
```

genera in `tmp/supabase-auth-emails/` l'HTML con la grafica KaiPai e i
segnaposto di Supabase (`{{ .ConfirmationURL }}`), da incollare una volta in
Supabase → Authentication → Emails. Il nome del template e l'oggetto da
impostare sono stampati dallo script.

Perché il logo si veda, `public/email/kaipai-logo.png` deve essere raggiungibile
in produzione.

### Segnaposto

Unica sintassi ammessa: `{{percorso.del.valore}}`. Niente condizioni, cicli,
helper o espressioni — per progetto, non per mancanza di tempo: il contenuto
dei template è dato editabile e non deve poter eseguire nulla.

Un segnaposto fuori whitelist, o con valore mancante, **blocca l'invio**: la
delivery va in `failed` con il motivo, e non parte un'email con i buchi.

`recipient.firstName` e `actionUrl` sono sempre disponibili.

## Deduplica

La chiave è deterministica sull'evento concreto:

```
v1:{eventKey}:email:{u<userId>|e<email>}:{n<notificationId>|<scope>}
```

Non è mai una finestra temporale: due messaggi in chat sono due eventi
distinti e devono generare due email. Quando esiste la notifica in-app il suo
id entra nella chiave; per gli eventi schedulati o senza in-app si usa uno
scope esplicito (`b<bookingId>`, `inv<id>`, `rep<id>`).

L'arbitro è il database: `INSERT ... ON CONFLICT DO NOTHING` sull'unique di
`idempotency_key`. Due processi concorrenti non possono vincere entrambi.

## Preferenze

- tabella `notification_preferences (user_id, type)`, colonne `email_enabled`
  e `in_app_enabled`;
- una riga mancante non è un errore: vale il default del catalogo;
- gli eventi obbligatori (`security_alert`, `coach_invitation`) ignorano la
  riga, appaiono bloccati nella UI e vengono scartati lato server anche se
  qualcuno forgia la POST;
- pagina: `/dashboard/notifications/preferences`, raggiungibile dal menu
  profilo (voce "Notifiche"). Non esiste `/profile/notifications`.

## Configurazione

```
EMAIL_NOTIFICATIONS_ENABLED=true
RESEND_API_KEY=...
EMAIL_PROVIDER=resend
EMAIL_FROM_ADDRESS=info@kaipaicoach.com
EMAIL_FROM_NAME=KaiPai
EMAIL_REPLY_TO=info@kaipaicoach.com
```

Senza queste variabili l'app funziona identica, con gli invii saltati e
registrati a log. `RESEND_FROM_EMAIL` resta accettata come fallback.

## Promemoria appuntamenti

`/api/internal/notifications/reminders`, protetta da `CRON_SECRET`, cron
orario in `vercel.json`. Ogni corsa guarda una finestra di ±35 minuti attorno
a −24h e −1h dall'appuntamento: la finestra è più larga dell'intervallo del
cron perché saltare un promemoria è peggio che selezionarlo due volte, e il
ledger toglie i doppioni.

> **Piano Vercel**: il cron orario richiede un piano a pagamento. Sul piano
> Hobby i cron scattano una volta al giorno, quindi il promemoria a 1 ora non
> funziona finché il piano non viene aggiornato.

## Eventi con API pronta ma non ancora collegata

`lib/core/notifications/events.ts` espone le tre chiamate i cui flussi
sorgente non esistono ancora nel prodotto:

| Evento | Chiamata | Manca |
|---|---|---|
| `ai_report_ready` | `notifyAiReportReady()` | la condivisione del report con l'atleta |
| `coach_invitation` | `sendCoachInvitationEmail()` | l'invito inviato dalla piattaforma (oggi è un `mailto:` del browser) |
| `security_alert` | `notifySecurityAlert()` | gli hook sugli eventi di autenticazione |

Quando quei flussi arrivano, collegarli è una riga: canale, preferenza,
template e deduplica sono già a posto.
