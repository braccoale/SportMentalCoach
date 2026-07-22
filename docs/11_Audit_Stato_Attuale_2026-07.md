# KaiPai — Audit dello Stato Attuale (Luglio 2026)

> Documento di verifica prodotto/tecnica basato **esclusivamente** sul codice, sullo schema del database, sulle route, sulla configurazione ambiente, sulla documentazione e sui test presenti nel repository alla data del 15 luglio 2026.
> Nessuna modifica al codice è stata effettuata. Ogni affermazione è tracciabile a file specifici.
> Destinazione: KaiPai Master Roadmap · Business Plan · Product Blueprint · Checklist legale · documenti SAL.

**Legenda stati:**
- 🟢 **Implementato e funzionante** (codice presente e attivabile senza fix)
- 🟡 **Implementato ma non configurato** (codice presente, richiede env/servizio esterno)
- 🟠 **Parziale** (implementato in parte, con limiti noti)
- 🔵 **Solo marketing** (presente nella landing/copy, nessuna implementazione)
- 🔴 **Mancante**
- ⚪ **Deprecato / codice residuo del template**

---

## 1. EXECUTIVE STATUS

### Cos'è KaiPai oggi
KaiPai è un **marketplace verticale a due lati** per il mental coaching sportivo, costruito su un template Next.js SaaS (`nextjs/saas-starter`) e progressivamente trasformato in una struttura "core marketplace + verticale". Il codice è organizzato per essere riusabile su più verticali (`lib/core/` generico + `lib/verticals/sport-mental-coach/`), con un unico verticale attivo (SMC / KaiPai).

Tecnicamente il prodotto è già molto più avanzato di un semplice MVP "Fase 1": include profili coach, listing pubblico, richieste di prenotazione, chat, videochiamata, recensioni, notifiche, preferiti, disponibilità settimanale e coda di approvazione admin. Tutto **senza pagamenti**.

### Scope attuale del prodotto
- **B2C marketplace** funzionante lato software: atleta scopre coach → richiede sessione → coach accetta → chat/video → completamento → recensione.
- **Landing cinematografica** (brand "KaiPai", dark + rosso) che promette un ecosistema molto più ampio (Academy, Metodo "4 muscoli della mente", famiglie, società/club, Mappa Mentale, cultura).
- **B2B (club)**: promesso nella landing con pacchetti prezzati (1.500 €/mese → 75.000 €/anno) ma **nessuna funzionalità applicativa** dietro (la dashboard club è un placeholder; i CTA pacchetti sono `mailto:`).

### Livello di maturità
**Demo / prototipo pilota-ready sul flusso B2C.** Non è un prodotto production-ready:
- non esiste alcun sistema di pagamento attivo;
- la landing contiene **statistiche inventate** e claim in attesa di validazione (dichiarato esplicitamente in `docs/09` e nel codice);
- non c'è CI/CD, né test automatici oltre a un singolo script E2E Playwright;
- README ancora quello del template SaaS;
- verifiche legali (minori, consenso) sono solo testuali, non applicate nel flusso.

Con la configurazione dei servizi esterni (Supabase Auth/DB, LiveKit, Resend) il flusso end-to-end **è eseguibile per un pilota interno controllato**.

### Happy path realmente supportato oggi
Coach si registra → completa profilo (headline, bio, sport, specialità, servizio) → invia in revisione → **admin approva manualmente** → coach pubblico su `/coaches` → atleta si registra → trova il coach → invia richiesta (con data preferita opzionale) → coach accetta → entrambi vedono la sessione in "agenda" → chat testuale → videochiamata LiveKit → coach segna "completata" → atleta lascia recensione → coach risponde. Questo intero flusso è coperto dal test E2E `e2e/happy-path.mjs`.

### Ruoli con funzionalità realmente utilizzabili
| Ruolo | Stato |
|---|---|
| **Atleta** | 🟢 Funzionalità completa (scoperta, richiesta, chat, video, recensione, profilo) |
| **Coach** | 🟢 Funzionalità completa (onboarding, profilo, servizi, disponibilità, richieste, chat, video, recensioni/risposte) |
| **Admin** | 🟢 Coda approvazione + toggle verifiche identità/certificazioni |
| **Club** | 🔴 Solo placeholder ("Sezione in preparazione") |

### Cosa è promesso nella landing ma non implementato
- **KaiPai Academy** (percorso Selezione→Formazione→Certificazione→Supervisione→Crescita): 🔵 solo un flag booleano `is_kaipai_certified` sul coach.
- **Metodo "I 4 Muscoli della Mente" / Mappa Mentale**: 🔵 concetto narrativo, nessuna feature (nessuna misurazione, nessun assessment).
- **Pacchetti club prezzati**: 🔵 B2B, solo `mailto:`, nessun checkout né gestione.
- **Statistiche/risultati** ("+34%", "2.400+ sessioni", "18 regioni", "95% club Serie A"): 🔵 dichiaratamente inventate/illustrative.
- **Pagina Famiglie**: 🟠 pagina informativa reale (route `/famiglie`) ma senza flusso "consenso genitore" applicativo.
- **AI / matching**: 🔴 nessun codice (nessuna dipendenza OpenAI), nascosto dietro `SHOW_UPCOMING_FEATURES=false`.

---

## 2. MAPPA FUNZIONALE ATTUALE

### A. Prodotto pubblico

#### A1 · Landing page — 🟢 (con contenuti 🔵)
- **Route:** `/` → `app/(marketing)/page.tsx` (+ `layout.tsx`)
- **File:** `components/landing/*` (hero, method, ecosystem-athlete, reveal, count-up, site-nav, ecc.), `app/globals.css` (design system "Ink & Scarlatto")
- **Tabelle DB:** nessuna (contenuti hard-coded)
- **Dipendenze:** `motion`, `lenis` (smooth scroll)
- **Limiti:** tutte le statistiche sono inventate (nota esplicita in `Results()` e in `docs/09`); molti link del footer sono `<span>` non cliccabili; sezioni "Podcast/Guide/Ricerca" sono card statiche senza destinazione.
- **Produzione:** pronta come vetrina; **non** pubblicabile così com'è per via dei numeri inventati (rischio trust/legale, specie con minori).
- **Fase:** MVP marketing.

#### A2 · Marketplace / ricerca coach — 🟢
- **Route:** `/coaches`, `/coaches/[slug]`
- **File:** `app/(marketplace)/coaches/page.tsx`, `.../[slug]/page.tsx`, `components/coaches-filter-form.tsx`, `components/coach-card.tsx`, `lib/core/listings/index.ts`
- **Tabelle:** `provider_profiles`, `profiles`, `services`, `reviews`, `sports`, `specialties`
- **Ruoli:** pubblico (nessun login richiesto per navigare)
- **Filtri:** server-side per sport e specialità (array-contains). Solo coach `status='approved'` visibili.
- **Limiti:** nessuna geolocalizzazione reale, nessun matching, nessuna ricerca full-text.

#### A3 · Matching coach-atleta — 🔴 / 🔵
Nessun algoritmo. Solo filtri manuali per taxonomy. "AI matching" è nascosto dietro `SHOW_UPCOMING_FEATURES=false` (`lib/core/flags.ts`).

#### A4 · Preferiti (favorites) — 🟢
- **File:** `components/favorite-button.tsx`, `app/(marketplace)/coaches/favorite-actions.ts`, `lib/core/favorites/index.ts`
- **Tabella:** `favorites` (unique `user_id,provider_id`)
- **Ruoli:** utente autenticato. Filtro "Preferiti" nel listing.

#### A5 · Profilo pubblico coach — 🟢
- **Route:** `/coaches/[slug]`
- **Contenuti:** headline, bio, sport/specialità, lingue, certificazioni (testuali), anni esperienza (da `coach_since`), video di presentazione, disponibilità settimanale (read-only), recensioni + risposte, badge verifica.
- **Prezzo:** **nascosto** in pubblico (`SHOW_COACH_HOURLY_RATE=false`), pur essendo presente a DB.

#### A6 · Recensioni — 🟢
- **File:** `lib/core/reviews/index.ts`, `app/(dashboard)/dashboard/athlete/review-actions.ts`, `.../coach/review-reply-actions.ts`, `components/rating-stars.tsx`
- **Tabella:** `reviews` (rating 1–5 con CHECK, `booking_id` unique)
- **Verificata:** una recensione reale è legata a una prenotazione **completata** posseduta dall'autore (una per booking) → non falsificabile. Il coach può rispondere pubblicamente.

#### A7 · Segnali di fiducia / verifica — 🟠
- Badge `identityVerified`, `certificationsVerified`, `isKaipaiCertified` sul `provider_profiles`.
- Gestiti **manualmente** dall'admin (toggle nella dashboard admin). **Nessuna evidenza documentale caricata/archiviata**: i toggle sono booleani senza allegati né audit di prova.

#### A8 · Pagine legali — 🟠 (copy)
- **Route:** `/terms`, `/privacy`, `/cookie` → `app/(marketplace)/*` + `legal-layout.tsx`
- Testi presenti e ragionevoli (GDPR, minori, natura non-clinica, emergenza 112). Vedi §7 per lo stato di dettaglio. **Nel footer della landing i link Privacy/Termini/Cookie sono `<span>` non cliccabili** (le pagine esistono ma non sono linkate dalla landing principale).

#### A9 · Ingressi di autenticazione — 🟢
- **Route:** `/sign-in`, `/sign-up`, `/reset-password`, `/reset-password/update`, `/auth/callback`
- Auth su **Supabase Auth** (vedi §F).

### B. Esperienza Atleta

| Area | Stato | Note / file |
|---|---|---|
| Registrazione + scelta ruolo | 🟢 | `app/(login)/login.tsx`, `actions.ts` (radio athlete/coach/club) |
| Profilo atleta | 🟢 | `athlete-profile-editor.tsx`; campi: sport, livello, città, **data di nascita** (età calcolata), obiettivi |
| Scoperta coach | 🟢 | `/coaches` |
| Richiesta prenotazione | 🟢 | `booking-request.tsx`; servizio (opz.) + data/ora preferita (opz.) + nota |
| Stato prenotazione | 🟢 | Dashboard atleta: In attesa / Accettate / Storico |
| Calendario | 🟢 | `athlete/calendar/page.tsx` + `components/calendar/booking-calendar.tsx` — vista agenda delle sessioni accettate (**non** Cal.com) |
| Notifiche in-app | 🟢 | Campanella + `/dashboard/notifications` |
| Email | 🟡 | Resend, best-effort, OFF senza env (§F) |
| Chat | 🟢 | `/dashboard/chat/[bookingId]`, solo booking `accepted` |
| Videochiamata | 🟡 | LiveKit, solo booking `accepted`; richiede env |
| Annullamento sessione | 🟢 | Atleta può annullare `requested`/`accepted` |
| Completamento sessione | 🟢 (lato coach) | Solo il coach segna `completed` |
| Recensioni | 🟢 | Dopo `completed` |
| Reset password | 🟢 | Flusso Supabase completo |
| Campi profilo mancanti | 🟠 | Nessun campo "genitore/tutore", nessun consenso, nessun contatto emergenza |

#### Osservazione sul flusso di ritorno post-auth
Se un anonimo clicca "Richiedi sessione", viene portato a `/sign-in?redirect=/coaches/[slug]` e **riportato al profilo** dopo il login (`safeRedirectPath` in `actions.ts`) → il contesto di prenotazione non si perde. 🟢

### C. Esperienza Coach

| Area | Stato | Note / file |
|---|---|---|
| Registrazione | 🟢 | ruolo `coach` → crea `provider_profiles` status `draft` |
| Onboarding guidato | 🟢 | `onboarding-progress.tsx`, `lib/core/onboarding`; wizard 4 step derivato dai dati |
| Editing profilo | 🟢 | `profile-editor.tsx` (headline, bio, sport, specialità, lingue, certificazioni, coach_since, video) |
| Servizi | 🟢 | `services-editor.tsx`, CRUD ownership-checked; prezzo in € → salvato in cent |
| Campi prezzo | 🟠 | `services.price`, `provider_profiles.hourly_rate` esistono ma **prezzo pubblico nascosto** |
| Disponibilità | 🟢 | `availability-editor.tsx`; slot settimanali ricorrenti (weekday + minuti). **Non** integrato con calendario reale/conflitti |
| Workflow approvazione | 🟢 | `draft/rejected → pending` (coach) → `approved/rejected` (admin). Mai bypassabile |
| Gestione prenotazioni | 🟢 | Accetta/Rifiuta/Completa/Annulla |
| Calendario | 🟢 | `coach/calendar/page.tsx` (agenda) |
| Chat | 🟢 | vedi atleta |
| Video | 🟡 | vedi atleta |
| Notifiche | 🟢 | `booking_requested`, `provider_approved/rejected`, `new_message`, ecc. |
| Recensioni + risposte | 🟢 | Il coach risponde pubblicamente |
| Badge verifica | 🟠 | Gestiti da admin (senza prove archiviate) |
| Academy | 🔵 | Solo `is_kaipai_certified` booleano; nessun percorso formativo |
| Caricamento video/foto | 🟢/🟡 | Upload avatar/video; storage locale in dev, Supabase Storage in prod (§F) |
| Strumenti coach mancanti | 🟠 | Nessuna gestione pagamenti/incassi, nessun report atleta, nessuna nota di sessione, nessun pacchetto |

### D. Admin

| Area | Stato | Note |
|---|---|---|
| Approvazione coach | 🟢 | `/dashboard/admin`, coda draft/pending → approve/reject |
| Verifica identità | 🟠 | Toggle booleano, nessuna prova archiviata |
| Verifica certificazioni | 🟠 | Toggle booleano, nessun upload documenti |
| Gestione utenti | 🔴 | Nessuna lista utenti / ban / edit |
| Moderazione recensioni | 🔴 | Nessuna funzione di moderazione/rimozione |
| Supervisione prenotazioni | 🔴 | Nessuna vista admin sui booking |
| Certificazione Academy | 🔴 | Nessun workflow (solo flag) |
| Audit trail | 🟠 | `activity_logs` esiste ma registra solo eventi auth/team del template; `reviewed_by`/`reviewed_at` sul coach |
| **Realmente usabile oggi** | Solo **approvazione coach** + **toggle verifiche**. Tutto il resto è assente. |

L'admin non è auto-registrabile (lo schema rifiuta il ruolo admin al signup); si crea via seed (`admin@kaipai.com`).

### E. Club / B2B

| Area | Stato |
|---|---|
| Ruolo club | 🟠 Registrabile, ma senza funzioni |
| Dashboard club | 🔴 Placeholder ("Sezione in preparazione") — `dashboard/club/page.tsx` |
| Tabelle team/organizations | 🟠 `teams` (alias `organizations`), `team_members`, `invitations` — ereditate dal template, riusate concettualmente come "club" ma non collegate al flusso marketplace |
| Funzionalità club reali | 🔴 Nessuna (no roster atleti, no acquisto posti, no report) |
| `client_profiles.org_id` | 🟠 Colonna FK a `teams` presente, mai popolata dall'app |
| Promesse landing ai club | 🔵 3 pacchetti prezzati, "presenza settimanale", "workshop", "Mind Room Lab" — tutto solo copy + `mailto:` |

### F. Infrastruttura di piattaforma

| Componente | Stato | Dettaglio |
|---|---|---|
| Database | 🟢 | PostgreSQL su Supabase, Drizzle ORM, pooler; audit columns + trigger `set_updated_at` |
| Supabase Auth | 🟢/🟡 | Migrazione completata (auth_id, admin API al signup, email_confirm=true); richiede env |
| Supabase Storage | 🟡 | `lib/core/storage.ts`; fallback su `public/uploads/` in dev |
| Supabase Realtime | 🟡 | Broadcast content-free per nudge chat; degrada a refresh manuale |
| Resend (email) | 🟡 | OFF di default; best-effort; mirror delle notifiche |
| LiveKit (video) | 🟡 | Token server-side; OFF senza le 3 env |
| Vercel | 🔴 | Nessun `vercel.json`, nessuna evidenza di deploy config |
| Stripe | ⚪/🟡 | Codice del template isolato dietro `BILLING_ENABLED=false`; API route ritornano 404; **modello marketplace non implementato** (vedi §5) |
| Feature flags | 🟢 | `lib/core/flags.ts`: BILLING_ENABLED, SHOW_COACH_HOURLY_RATE, SHOW_UPCOMING_FEATURES, isVideoConfigured, isRealtimeConfigured, isEmailEnabled |
| Migrazioni | 🟢 | Drizzle, additive-only, 0000→0011 (audit) |
| Seed / demo | 🟢 | `lib/db/seed.ts`: 4 coach demo (3 approved, 1 pending), admin, recensioni, disponibilità |
| CI/CD | 🔴 | Nessun `.github/workflows` |
| Test automatici | 🟠 | Solo 1 script E2E Playwright (`e2e/happy-path.mjs`); nessun unit/integration test |
| Monitoring/logging | 🔴 | Solo `console.log/error`; nessun Sentry |
| Controlli di sicurezza | 🟠 | requireRole, ownership check, guardie server-side, no-enumeration su reset; **nessun rate limiting**, nessun captcha |

---

## 3. HAPPY PATH END-TO-END

### Coach
| # | Step | Stato |
|---|---|---|
| 1 | Registrazione | 🟢 |
| 2 | Completamento profilo | 🟢 |
| 3 | Creazione servizio | 🟢 |
| 4 | Disponibilità | 🟢 (settimanale, non calendario reale) |
| 5 | **Approvazione admin** | 🟢 ma **manuale** (intervento umano richiesto) |
| 6 | Ricezione richiesta | 🟢 |
| 7 | Accettazione | 🟢 |
| 8 | Calendario | 🟢 (vista agenda) |
| 9 | Chat | 🟢 (richiede solo booking accepted) |
| 10 | Videochiamata | 🟡 richiede env LiveKit |
| 11 | Completamento | 🟢 |
| 12 | Risposta a recensione | 🟢 |

### Atleta
| # | Step | Stato |
|---|---|---|
| 1 | Registrazione | 🟢 |
| 2 | Completamento profilo | 🟢 (opzionale, non forzato) |
| 3 | Scoperta coach | 🟢 |
| 4 | Profilo coach | 🟢 |
| 5 | Richiesta prenotazione | 🟢 |
| 6 | Ritorno post-auth | 🟢 (`redirect` preservato) |
| 7 | Conferma | 🟢 (dipende da accettazione coach) |
| 8 | Notifica | 🟢 in-app / 🟡 email |
| 9 | Calendario | 🟢 |
| 10 | Chat | 🟢 |
| 11 | Video | 🟡 (env) |
| 12 | Recensione | 🟢 |

### Interventi manuali richiesti da Alessandro / Francesco
1. **Approvazione di ogni coach** dalla dashboard admin (nessuna automazione).
2. **Verifica identità/certificazioni**: valutazione manuale + toggle (le prove vanno raccolte fuori piattaforma: non esiste upload documenti).
3. **Creazione account admin** via seed/DB.
4. **Configurazione servizi esterni** (Supabase, LiveKit, Resend, Storage) prima del pilota.
5. **Gestione richieste club**: rispondere alle email `info@kaipai.com` (nessun flusso applicativo).
6. **Sostituzione dei numeri inventati** nella landing prima di qualsiasi pubblicazione.

---

## 4. PROMESSA vs PRODOTTO REALE

| Promessa / concetto | Dove appare | Implementazione reale | Gap | Rischio |
|---|---|---|---|---|
| **KaiPai Academy** (formazione coach) | Landing §Academy, `is_kaipai_certified` | Solo flag booleano | Nessun percorso, contenuto, certificazione reale | Alto (claim di qualità non sostanziato) |
| **Coach verificati e formati** | Landing, Famiglie, coach card | Toggle admin booleani, senza prove archiviate | Nessuna evidenza documentale né processo | Alto (fiducia/minori) |
| **Famiglie** | `/famiglie`, landing | Pagina informativa reale; nessun flusso consenso | Nessun account genitore, nessun gating minori | Alto (legale) |
| **Club / academy calcio** | Landing §Pacchetti, §Società | Dashboard placeholder; `mailto:` | Nessuna feature B2B | Medio (aspettativa commerciale) |
| **Ecosistema integrato** | Landing §Ecosistema | Atleta+Coach reali; Famiglia/Società assenti | 2 dei 4 nodi non esistono | Medio |
| **Multi-sport** | Taxonomies (`sports`) | Supportato a DB, ma copy è football-first | Coerenza narrativa | Basso |
| **Pacchetti** | Landing (1.5k–75k €) | Nessun pacchetto/checkout | Modello di ricavo non implementato | Alto (business) |
| **Prezzi** | Pacchetti B2B; prezzo coach a DB | Prezzo coach **nascosto**; pacchetti solo mailto | Ambiguità totale (§5) | Alto |
| **Disponibilità reale** | Landing "Prossima disponibilità" | Slot settimanali statici, no booking su slot | Non è un calendario prenotabile | Medio |
| **Videochiamate** | Landing, Famiglie | LiveKit reale (se configurato) | Richiede env; nessuna registrazione | Basso |
| **Recensioni** | Landing, profilo | Reali e verificate (booking completato) | — | Basso ✅ |
| **Tutela minori** | Landing, Famiglie, Privacy/Terms | Solo testo; nessun consenso applicativo | Nessun gating, nessun consenso genitore | **Molto alto** (legale) |
| **GDPR / privacy** | Privacy, Cookie | Testi presenti; soft-delete account; no export dati | Manca export dati, DPA fornitori | Alto |
| **Mental coaching ≠ psicoterapia** | Terms, Famiglie, Results footnote | Disclaimer presente | — | Basso ✅ |
| **Claim risultati** (+34%, ecc.) | Landing §Results, §WhyNow | **Inventati** (dichiarato) | Da sostituire con dati reali | **Molto alto** |
| **AI / matching** | Nascosto (`SHOW_UPCOMING_FEATURES`) | Nessun codice | Feature futura | Basso |
| **Pagamenti** | Pacchetti | Stripe disabilitato/residuo | Nessun incasso | Alto (business) |

---

## 5. MODELLO DI BUSINESS IMPLICITO NEL CODICE

Analisi di **cosa l'applicazione supporta oggi**, non delle intenzioni.

| Domanda | Risposta dal codice |
|---|---|
| Prezzo per sessione singola? | 🟠 A DB sì (`services.price` in cent), ma **non mostrato** in pubblico (`SHOW_COACH_HOURLY_RATE=false`) e **non incassato** |
| Ogni coach definisce il proprio prezzo? | 🟢 Sì, per servizio e come `hourly_rate` |
| Coach può creare più servizi/prezzi? | 🟢 Sì (CRUD servizi) |
| Prezzi visibili pubblicamente? | 🔴 No (flag off) |
| Pacchetti definiti dalla piattaforma? | 🔵 Solo nella landing (B2B), nessuna entità DB |
| Pacchetti landing B2C o B2B? | **B2B** (club Serie A/B/C, academy) — CTA `mailto:` |
| Checkout / raccolta pagamenti? | 🔴 No (né B2C né B2B) |
| Stripe disabilitato / scaffold / usabile? | ⚪ **Scaffold residuo del template** (abbonamento team SaaS), isolato dietro `BILLING_ENABLED=false`; API 404 |
| Logica commissione / take-rate? | 🔴 Nessuna |
| Modello payout coach? | 🔴 Nessuno (nessun Stripe Connect) |
| Logica abbonamento? | ⚪ Solo residuo template (`teams.stripe_*`, `/pricing` nascosto) |
| Protezione dalla disintermediazione? | 🔴 Nessuna (chat/video liberi post-accettazione; nessun vincolo economico) |
| Modello che l'architettura supporta naturalmente | **Marketplace di lead/scoperta senza transazione**: la piattaforma facilita l'incontro ma non media denaro. Struttura pronta per aggiungere Stripe Connect (schema `bookings` privo di campi pagamento — Fase 2 prevista) |

### "Pricing and Business Model Ambiguities"
1. **Prezzo coach esiste ma è nascosto.** Il DB e la UI lo gestiscono, un flag lo occulta "mentre il modello è basato su pacchetti club" (commento in `flags.ts`). → Contraddizione tra impianto B2C (prezzo per servizio) e narrativa B2B (pacchetti).
2. **Pacchetti landing (B2B) vs servizi coach (B2C):** due modelli commerciali diversi coesistono senza integrazione. I pacchetti non esistono come entità; i servizi coach non sono venduti.
3. **Nessun incasso in nessun punto del flusso.** La `Vision.md` cita "commissione + abbonamento coach + pacchetti premium + servizi AI", ma **niente di ciò è implementato**.
4. **Stripe presente ma per il modello sbagliato** (abbonamento team del template SaaS, non marketplace/Connect).
5. **`docs/01_Vision`** promette pagamenti nell'MVP; **`docs/02_Roadmap`** li rinvia esplicitamente alla Fase 2 → doc interni non allineati.
6. **`IpotesiDiPacchetti.txt`** (B2B, ROI, biofeedback/Mind Room Lab) descrive un servizio di consulenza on-site, non un marketplace software → **due business diversi** nello stesso repo.
7. **Nessuna protezione dalla disintermediazione:** una volta accettata la richiesta, atleta e coach hanno chat + video + (potenzialmente) contatti; nulla trattiene la relazione sulla piattaforma.

---

## 6. VALORE PER UTENTE (solo funzionalità reali)

- **Atleta:** scoperta di coach verificati (manualmente), profilo strutturato, richiesta sessione, chat, video, recensioni verificate. Valore reale ma **senza pagamento/garanzia**.
- **Genitore:** pagina informativa `/famiglie` di qualità; **nessuno strumento** (no account, no consenso, no report). Valore = solo contenuto.
- **Coach:** vetrina professionale + gestione richieste + chat/video + recensioni. Valore reale come "mini-sito + agenda leggera".
- **Club:** **nessun valore applicativo** oggi (placeholder).
- **Admin / operatore KaiPai:** coda di approvazione + toggle verifiche. Valore operativo minimo.

### Focus Coach — perché registrarsi oggi?
- **Cosa offre KaiPai oltre a WhatsApp+Meet+Calendar+Instagram:** un **profilo pubblico verificato con recensioni non falsificabili** (legate a sessioni completate) e un **badge di fiducia/Academy** → credibilità di terza parte. Questo è l'unico vantaggio realmente differenziante oggi.
- **Benefici già reali:** profilo/SEO, recensioni verificate, chat+video integrati, notifiche, gestione richieste.
- **Benefici solo promessi:** Academy/formazione, pagamenti/incassi, matching, Mappa Mentale, clientela dai club.
- **Benefici mancanti necessari per giustificare commissione/abbonamento:** raccolta pagamenti + payout, generazione di **domanda** (lead veri), strumenti che aumentano il fatturato del coach (pacchetti, upsell), report che aumentano retention atleta.
- **Rischi di disintermediazione:** dopo il primo incontro, nulla vincola economicamente la relazione → il coach può spostare l'atleta fuori piattaforma senza costi. **Questo è il rischio strategico n.1 del modello attuale.**

---

## 7. STATO LEGALE E COMPLIANCE (checklist per avvocato)

| Elemento | Stato | Nota |
|---|---|---|
| Termini e Condizioni | copy only | `/terms`, ragionevoli; da revisione legale |
| Privacy Policy | copy only | `/privacy`; cita GDPR, titolare "KaiPai" (entità legale non specificata) |
| Cookie Policy | copy only | `/cookie` (presente) |
| Consenso / cookie banner | **mancante** | Nessun banner cookie/consenso nel codice |
| Registrazione minori | **mancante** (applicativo) | Nessun controllo età al signup; data di nascita solo opzionale post-registrazione |
| Consenso genitore/tutore | **mancante** (applicativo) | Descritto in copy (Famiglie/Terms/Privacy) ma **non raccolto né verificato** dall'app |
| Contratto coach | mancante | Nessun contratto/accettazione termini coach dedicato |
| Evidenze verifica coach | **mancante** | Toggle booleani senza upload/archiviazione documenti |
| Confini professionali | copy only | Disclaimer "non è terapia" presente |
| Disclaimer non-psicoterapia | implementato (copy) | Terms §5, Famiglie FAQ, Results footnote ✅ |
| Disclaimer emergenza/crisi | implementato (copy) | Terms §5 (112) ✅ |
| Riservatezza | copy only | Privacy §4; nessuna cifratura end-to-end delle chat |
| Conservazione dati | **da definire** | Nessuna retention policy tecnica |
| Export dati (portabilità) | **mancante** | Solo soft-delete account; nessun export |
| Cancellazione dati | parziale | Soft-delete utente + rimozione identità Supabase; dati collegati (booking/messaggi/recensioni) restano |
| Moderazione recensioni | **mancante** | Nessuno strumento |
| Registrazione videochiamate | non presente (dichiarato) | Privacy: "le videochiamate non vengono registrate" ✅ coerente col codice |
| Claim di marketing | **rischio** | Statistiche inventate ancora presenti (da rimuovere) |
| Ruoli GDPR (titolare/responsabile/professionista indipendente) | **da definire** | Nessun DPA con fornitori; rapporto coach (titolare autonomo vs responsabile) non chiarito |
| Altri rischi | — | Nessun rate limiting (rischio abuso/spam); email marcata `email_confirm=true` senza double opt-in |

---

## 8. INVENTARIO SERVIZI E COSTI

| Servizio | Scopo | Stato attuale | Necessario per pilota? | Free tier | Cost driver | Env vars | Note |
|---|---|---|---|---|---|---|---|
| Dominio (kaipai.com) | Brand/email | Riferito in copy (`info@kaipai.com`) | Sì | No | fisso annuo | — | Da verificare esternamente se già registrato |
| Vercel | Hosting Next.js | Non configurato | Sì | Sì (Hobby) | build/bandwidth | `BASE_URL` | Nessun `vercel.json` |
| Supabase Postgres | DB | Configurato in codice | Sì | Sì | righe/compute | `POSTGRES_URL` | Pooler |
| Supabase Auth | Identità | Implementato | Sì | Sì | MAU | `NEXT_PUBLIC_SUPABASE_URL`, `..._ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | — |
| Supabase Storage | Video/foto coach | Opzionale | Consigliato (serverless) | Sì | GB storage/egress | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Fallback locale in dev |
| Supabase Realtime | Nudge chat live | Opzionale | No | Sì | connessioni | `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` | Degrada a refresh |
| Resend | Email notifiche | Opzionale, OFF | No (ma consigliato) | Sì (limitato) | email inviate | `EMAIL_NOTIFICATIONS_ENABLED`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Richiede dominio email verificato |
| LiveKit | Video | Opzionale | Sì (per pilota video) | Sì (cloud) | minuti partecipante | `LIVEKIT_API_KEY/SECRET`, `NEXT_PUBLIC_LIVEKIT_URL` | Token server-side |
| Stripe | Pagamenti | Disabilitato/residuo | No | — | % transazione | `BILLING_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Modello marketplace non implementato |
| OpenAI / AI | Matching/AI | **Assente** | No | — | token | — | Nessuna dipendenza nel `package.json` |
| Cal.com | Calendario | **Assente** | No | — | — | — | Citato nello stack ma non integrato |
| Analytics | Metriche | Assente | No | — | — | — | Nessuno |
| Monitoring/Sentry | Error tracking | Assente | Consigliato | Sì | eventi | — | Solo console |
| Cookie consent | Consenso | Assente | Sì (legale) | — | — | — | Da aggiungere |
| Backup | DR | Gestito da Supabase | Sì | dipende piano | — | — | Da verificare piano |

*Prezzi non indicati nel repository → "to verify externally".*

---

## 9. DATABASE E DATA MODEL

Schema: `lib/db/schema.ts`. Tutte le tabelle hanno audit columns (`created_by`, `updated_by`, `updated_at` via trigger).

| Tabella | Scopo | Relazioni | Stato | Ruolo nel prodotto |
|---|---|---|---|---|
| `users` | Root identità (profilo app, `auth_id`→Supabase) | 1-N ovunque | 🟢 attiva | Centrale; `role` legacy deprecato, `password_hash` legacy |
| `profiles` | Profilo comune (display_name, avatar, bio, locale) | 1-1 users | 🟢 attiva | Nome/avatar pubblici |
| `roles` | Catalogo ruoli (athlete/coach/club/admin) | N-N via user_roles | 🟢 attiva | Seed |
| `user_roles` | Ruoli utente (M-N) | users↔roles | 🟢 attiva | Autorizzazione |
| `provider_profiles` | Lato coach (slug, headline, specialità, tariffa, status, verifiche, video, coach_since…) | 1-1 users | 🟢 attiva | Cuore marketplace |
| `client_profiles` | Lato atleta (sport, livello, città, **birth_date**, obiettivi, org_id) | 1-1 users; org_id→teams | 🟢 attiva (org_id inutilizzato) | Profilo atleta |
| `services` | Offerte coach (titolo, durata, prezzo cent) | N-1 provider | 🟢 attiva | Prezzo non incassato |
| `bookings` | Richiesta+lifecycle (status, scheduled_for, session_started/ended_at) | client→users, provider, service | 🟢 attiva | **Nessun campo pagamento** |
| `coach_availability` | Slot settimanali | N-1 provider | 🟢 attiva | Non integrato Cal.com |
| `messages` | Chat per booking | booking, sender | 🟢 attiva | Solo booking accepted |
| `reviews` | Recensioni verificate + reply coach | provider, booking(unique), author | 🟢 attiva | Anti-fake |
| `notifications` | Notifiche in-app generiche | N-1 users | 🟢 attiva | + mirror email |
| `notification_preferences` | Preferenze email per tipo | N-1 users | 🟢 attiva | Sparse |
| `favorites` | Coach salvati | user↔provider (unique) | 🟢 attiva | — |
| `sports` / `specialties` | Tassonomie (anagrafiche con `active`) | — | 🟢 attive | Filtri |
| `teams` (alias `organizations`) | Ex-template, "club" | 1-N team_members | 🟠 semi-legacy | Contiene `stripe_*` non usati |
| `team_members` | Membership | users↔teams | 🟠 legacy | Ogni utente ha un "team" personale creato al signup |
| `invitations` | Inviti team | teams | 🟠 legacy | Email invito TODO non implementata |
| `activity_logs` | Log eventi auth/team | teams, users | 🟠 parziale | Solo eventi template |

### Problemi di data-model aperti
1. **Doppio sistema "team"**: ogni signup crea un `teams` personale + `team_members` (residuo template), concettualmente in conflitto con "team = club".
2. **`client_profiles.org_id`** mai popolato → nessun collegamento atleta↔club.
3. **`bookings` senza campi economici** (per design Fase 1) → aggiungere per pagamenti.
4. **`users.role` + `password_hash`** legacy da rimuovere post-migrazione.
5. **`teams.stripe_*`** presenti ma inutilizzati (modello sbagliato).
6. **Nessuna tabella** per consenso minori / documenti verifica / pacchetti / pagamenti.
7. **`activity_logs`** non copre le azioni marketplace (approvazioni tracciate solo su `provider_profiles`).

---

## 10. PRONTEZZA TECNICA

| Aspetto | Stato |
|---|---|
| TypeScript | 🟢 `strict: true` |
| Build produzione | 🟠 Non verificabile in questo audit; Next `15.6.0-canary.59` (**versione canary, instabile**) |
| Test automatici | 🟠 Solo `e2e/happy-path.mjs` (Playwright), nessun unit test |
| Copertura E2E happy-path | 🟢 14 step (registrazione→recensione→risposta) |
| Test falliti noti | ❓ Non eseguiti qui; dipendono da server+seed+env |
| Deployment readiness | 🔴 Nessuna config Vercel/CI |
| Env vars | 🟢 Documentate in `.env.example` |
| Strategia pool DB | 🟢 `postgres` (Supabase pooler) |
| Persistenza storage | 🟡 Locale in dev, Supabase in prod (serverless-safe solo se configurato) |
| Rischi sicurezza | 🟠 No rate limiting, no captcha, no cookie consent |
| Rate limiting | 🔴 Assente |
| Verifica email | 🟠 `email_confirm=true` al signup (no double opt-in) |
| Reset password | 🟢 Flusso completo Supabase, no-enumeration |
| Monitoring | 🔴 Assente |
| Logging | 🟠 Solo console |
| Error handling | 🟢 `ActionState`/`ActionForm`, best-effort su email/notifiche, tamper-safe session |
| Stabilità Next.js | 🔴 **Canary** → rischio in produzione |
| Rischi performance | 🟠 Landing pesante (motion/immagini); già ottimizzazioni recenti (commit "Perf:") |
| Mobile / a11y | 🟠 Design responsive dichiarato; a11y non verificata (nessun test) |

---

## 11. MVP MINIMO PER PILOTA REALE (Francesco coach · Alessandro atleta)

Flusso target: registrazione → profilo coach → approvazione → scoperta → richiesta → accettazione → calendario → notifica → chat → videochiamata → completamento → recensione.

### A. Già pronto
- Registrazione multi-ruolo, profilo coach/atleta, servizi, disponibilità, approvazione admin, richiesta, accettazione, calendario/agenda, chat, completamento, recensioni + risposte, notifiche in-app.

### B. Richiede configurazione (no codice)
- **Supabase** (DB + Auth + service role) — obbligatorio.
- **LiveKit** (3 env) — per la videochiamata.
- **Supabase Storage** — se il coach carica video/foto in ambiente non-locale.
- **Resend** (opzionale) — per notifiche email.
- **Seed admin** + eventuale account admin per Alessandro/operatore.

### C. Richiede fix di codice
- Nessun fix bloccante noto per il flusso pilota (l'E2E copre tutto). **Da valutare**: bloccare/pinnare la versione **canary di Next.js** su una release stabile prima del pilota.

### D. Richiede contenuti
- Ritratto/foto reale founder, immagini landing (attualmente slot), **sostituzione statistiche inventate** (se la landing è mostrata ai tester).

### E. Richiede chiarimento legale
- Consenso minori (se Alessandro/atleta test è maggiorenne, non bloccante per il pilota tecnico, ma bloccante per un pilota con minori reali).

### F. Non necessario per il pilota
- Stripe/pagamenti, dashboard club, Academy, matching/AI, Cal.com, moderazione recensioni, export dati.

**Conclusione:** il pilota Francesco↔Alessandro è **eseguibile con sola configurazione** (categoria B), senza sviluppo, assumendo tester maggiorenni.

---

## 12. PUNTI APERTI PER IL PROSSIMO SAL

Per ciascuno: domanda · perché conta · opzioni · impatto prodotto · impatto business · timing · evidenza mancante.

1. **Marketplace vs ecosistema** — La landing vende un OS della performance mentale; il codice è un marketplace di scoperta. *Opzioni:* focalizzare sul marketplace / costruire l'ecosistema. *Timing:* subito. *Manca:* decisione di posizionamento.
2. **B2C vs B2B vs ibrido** — App è B2C, landing/pacchetti sono B2B. *Impatto:* determina l'intero roadmap. *Timing:* subito.
3. **Sessioni singole vs percorsi/pacchetti** — DB supporta servizi singoli; landing vende pacchetti mensili. *Manca:* modello a catalogo pacchetti.
4. **Chi determina il prezzo** — Coach (DB) vs piattaforma (pacchetti). *Contraddizione* attiva (flag prezzo off).
5. **Libertà di prezzo del coach** — oggi totale ma nascosta. *Decidere se* mostrare i prezzi.
6. **Commissione KaiPai** — nessuna logica. *Bloccante* per monetizzazione B2C.
7. **Abbonamento coach** — citato in Vision, non implementato. *Richiede* Stripe.
8. **Pacchetti club** — solo mailto. *Decidere* se prodotto software o consulenza (vedi IpotesiDiPacchetti.txt).
9. **Ruolo dell'Academy** — flag booleano vs prodotto formativo reale. *Impatto* enorme su trust e supply.
10. **Perché il coach resta sulla piattaforma** — nessun lock-in. *Rischio strategico n.1*.
11. **Disintermediazione** — nessuna protezione. *Legare* alla decisione pagamenti.
12. **Famiglie e minori** — pagina informativa senza flusso consenso. *Bloccante legale* per pilota con minori.
13. **Football-first vs multi-sport** — DB multi-sport, narrativa calcio. *Coerenza* brand.
14. **Ortografia brand "KaiPai"** — nel codice "KaiPai" (un token); docs e memoria citano anche "Kai Pai". *Standardizzare*.
15. **Identità visiva rosso vs giallo** — attuale = dark+rosso ("Ink & Scarlatto"); da confermare come identità definitiva (nota in `docs/09` §6).
16. **Lunghezza/messaggio landing** — molto lunga, 14+ sezioni, numeri inventati. *Decidere* taglio e claim.
17. **Quali claim si possono fare** — statistiche inventate = rischio legale. *Bloccante* pre-pubblico.
18. **Criteri di verifica coach** — oggi toggle senza prove. *Definire* processo e archiviazione documenti.
19. **Timing pagamento e policy cancellazione** — Terms rimanda "alla policy sul profilo" che non esiste. *Definire*.
20. **Priorità Fase 2** — pagamenti? Academy? Club? Consenso minori? *Ordinare*.

---

## 13. ROADMAP CONSIGLIATA (Luglio → Dicembre 2026)

> Coerente con lo stato reale: la base software B2C è pronta; le decisioni di business e la compliance sono il collo di bottiglia. Owner: **A** = Alessandro, **F** = Francesco, **L** = Legale, **S** = Specialista esterno.

### Luglio 2026 — Validazione interna & decisioni fondanti
- **Obiettivo:** eseguire il pilota tecnico Francesco↔Alessandro e sciogliere le ambiguità di modello.
- **Attività:** configurare Supabase/LiveKit; eseguire E2E; SAL sui 20 punti aperti (§12).
- **Decisioni:** B2C vs B2B; prezzo visibile o no; brand spelling; identità colore.
- **Target:** happy-path completo superato in ambiente reale.
- **Deliverable:** verbale decisioni + questo audit aggiornato. **Owner: A+F**

### Agosto 2026 — Contenuti & revisione landing
- **Obiettivo:** landing pubblicabile senza rischi.
- **Attività:** rimuovere/sostituire statistiche inventate; foto reali founder/atleti; linkare pagine legali; standardizzare brand.
- **Decisioni:** claim ammessi.
- **Target:** 0 numeri non-sourced; Lighthouse ≥90.
- **Deliverable:** landing v1 pubblica. **Owner: A + S(design)**

### Settembre 2026 — Modello di business & pricing architecture
- **Obiettivo:** definire come KaiPai guadagna.
- **Attività:** progettare (non ancora costruire) pacchetti/commissione/abbonamento; spec Stripe Connect; anti-disintermediazione.
- **Target:** documento pricing approvato + spec tecnica pagamenti.
- **Deliverable:** Business Model Blueprint. **Owner: A+F**

### Ottobre 2026 — Lavoro legale & hardening tecnico
- **Attività (L):** revisione Terms/Privacy/Cookie; **flusso consenso minori**; contratto coach; DPA fornitori; entità legale titolare.
- **Attività (A/S):** cookie banner, rate limiting, Sentry, **pin Next.js a release stabile**, export dati GDPR, CI base.
- **Target:** checklist legale chiusa; build stabile deployata su Vercel.
- **Deliverable:** compliance pack + ambiente prod. **Owner: L + A**

### Novembre 2026 — Test esterni coach & atleti/genitori + interviste club
- **Attività:** onboarding di 3–5 coach reali (F); test con atleti/genitori reali; 3–5 interviste a club sui pacchetti.
- **Target:** ≥3 coach approvati con profilo reale; ≥10 sessioni reali completate; feedback strutturato.
- **Deliverable:** report validazione mercato. **Owner: F + A**

### Dicembre 2026 — Pilota reale & decisione go/no-go
- **Attività:** pilota controllato end-to-end con utenti reali (se legale su minori è chiuso); consolidamento metriche.
- **Decisioni:** go/no-go; se go, priorità 2027 (pagamenti vs Academy vs club).
- **Target:** KPI pilota definiti e misurati.
- **Deliverable:** decisione documentata + **roadmap 2027**. **Owner: A+F**

---

## 14. SEZIONI FINALI DI SINTESI

### A. Cosa è KaiPai oggi
Un **marketplace B2C di scoperta e relazione** coach↔atleta, tecnicamente completo sul flusso "trova → richiedi → parla → video → recensisci", con approvazione admin manuale, **senza alcun pagamento**. Una landing cinematografica di alto livello che racconta un ecosistema molto più grande di quanto esista nel software.

### B. Cosa KaiPai NON è ancora
- Non ha pagamenti, commissioni, payout, abbonamenti.
- Non ha Academy reale, matching/AI, Mappa Mentale, Cal.com.
- Non ha funzionalità club (placeholder) né flusso famiglie/minori applicativo.
- Non ha CI/CD, monitoring, test oltre 1 E2E, cookie consent, rate limiting.
- Non è su una versione stabile di Next.js.
- Non è production-ready né legalmente pronto per minori reali.

### C. Cosa va deciso prima di sviluppare oltre
1. B2C vs B2B vs ibrido. 2. Modello di ricavo (commissione/abbonamento/pacchetti). 3. Prezzo visibile o nascosto. 4. Ruolo reale dell'Academy. 5. Strategia anti-disintermediazione. 6. Perimetro minori/famiglie. (Dettaglio in §12.)

### D. Cosa completare prima del pilota Francesco–Alessandro
Solo **configurazione** (Supabase, LiveKit, opz. Resend/Storage) + eventuale **pin di Next.js**. Nessuno sviluppo funzionale bloccante. Se il pilota coinvolge minori reali: prima il flusso consenso (categoria E).

### E. Cosa NON costruire ancora
Pagamenti/Stripe Connect, dashboard club, Academy come prodotto, matching/AI, Mappa Mentale, Cal.com — **finché** non sono sciolte le decisioni di business (§C). Costruirli ora significa rischiare rework sul modello sbagliato.

### F. Top 10 decisioni per il prossimo SAL
1. B2C, B2B o ibrido?
2. KaiPai incassa (commissione/abbonamento) o resta lead-gen gratuito?
3. Prezzi coach visibili in pubblico o no?
4. Pacchetti club = software o consulenza on-site?
5. Academy: flag di marketing o prodotto formativo reale?
6. Come si evita la disintermediazione?
7. Pilota con minori sì/no (e quindi consenso genitore ora)?
8. Quali claim/numeri possiamo pubblicare?
9. Brand: "KaiPai" o "Kai Pai" + identità rosso definitiva?
10. Priorità Fase 2: pagamenti, club o Academy?

---

*Fine audit. Basato su commit più recente su `main` (4d7e731) e sui file citati. Nessuna modifica al codice è stata effettuata.*
