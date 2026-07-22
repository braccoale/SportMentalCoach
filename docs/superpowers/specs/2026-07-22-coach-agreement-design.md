# Contratto Coach e tutela dei minori — Design

Data: 22 luglio 2026
Stato: approvato in brainstorming, da implementare

## Problema

Due lacune con lo stesso punto di innesco — il momento in cui un coach entra in
piattaforma — e la stessa carenza di fondo: nessun consenso viene registrato.

1. **Disintermediazione.** Nulla impedisce a un coach di usare KaiPai per
   acquisire atleti e poi spostare la relazione fuori dalla piattaforma. Non
   esiste un contratto coach dedicato, la commissione non è dichiarata da
   nessuna parte, e i Termini generali sono gli stessi per tutti i ruoli.
2. **Minori.** Il bacino naturale del mental coaching sportivo sono i giovani
   atleti. Oggi la registrazione non chiede l'età: l'unico presidio è una frase
   passiva nel modal di signup ("Se hai meno di 18 anni, ti serve il consenso di
   un genitore o tutore") priva di valore probatorio.

### Stato attuale

- `components/landing/sign-up-modal.tsx` — registrazione unica per Atleta /
  Coach / Club, accettazione passiva dei Termini, nessuna traccia a DB.
- `app/(dashboard)/dashboard/coach/onboarding-progress.tsx` — l'onboarding
  coach copre profilo, servizi, disponibilità. Nessuno step contrattuale.
- `lib/payments/stripe.ts` — Stripe cablato ma `BILLING_ENABLED` non attivo: la
  piattaforma oggi non intermedia denaro.
- `lib/db/schema.ts` — `providerProfiles` ha `hourlyRate`/`currency` ma nessun
  campo commissione; `clientProfiles.birthDate` esiste ma è opzionale e
  raccolto dopo la registrazione, nel profilo.

## Decisioni

| Tema | Decisione |
|---|---|
| Modello economico | Commissione % su ogni sessione, incasso via piattaforma |
| Enforcement anti-fuga | Deterrenza + rilevamento (no censura in chat) |
| Punto del flusso | Step dedicato post-signup, bloccante |
| Scope fase A | Contratto + accettazione + gating |
| Account minori | Dell'atleta 15–17; il tutore autorizza da link firmato |
| Gate minori | Sulla prenotazione, non sulla registrazione |
| Età minima | 15 anni, blocco duro sotto |

> **Revisione 22/07, dopo ricognizione del working tree.** La decisione
> iniziale era "account intestato al genitore". In fase di pianificazione è
> emerso che `lib/core/guardians/` (non committato) implementa già il modello
> opposto, e migliore: l'atleta 15–17 possiede il proprio account, il tutore
> non ne ha alcuno e autorizza una volta da un link firmato. Adottato quello.
> Motivazione nel §2.2.

La commissione è dichiarata nel contratto ma non ancora trattenuta
automaticamente: Stripe Connect è fase successiva. Il contratto è scritto per
reggere entrambi gli stati.

## Parte 1 — Il contratto coach

Documento separato dai Termini generali: **Contratto di Adesione Coach
KaiPai**, accettato in aggiunta a Termini, Privacy e Cookie.

### 1.1 Natura del rapporto

KaiPai è intermediario tecnologico, non datore di lavoro. Il coach è
professionista autonomo: regime fiscale proprio, RC professionale a suo carico,
responsabile dei propri titoli. Serve a prevenire la riqualificazione del
rapporto, che è il rischio speculare di un contratto troppo stringente.

### 1.2 Commissione

- **20% del prezzo lordo** di ogni sessione prenotata tramite la piattaforma,
  trattenuta all'incasso; payout al coach entro N giorni dalla sessione
  completata (N da fissare con Stripe Connect, fase C).
- La commissione si applica **anche alle sessioni ripetute con lo stesso
  atleta**, finché il rapporto è nato su KaiPai.
- Modifiche della percentuale con **30 giorni di preavviso**, con diritto di
  recesso del coach entro la finestra. Senza questa clausola una modifica
  unilaterale è impugnabile.
- **Rate parity narrow**: il coach non pubblicizza sui propri canali diretti,
  verso clienti KaiPai, lo stesso servizio a prezzo inferiore. Volutamente
  ristretta: la parity ampia è stata sanzionata in UE.

### 1.3 Non-circumvention

- **Cliente KaiPai** = atleta con cui il coach è entrato in contatto per la
  prima volta tramite la piattaforma. Non l'intero portafoglio del coach.
- **Durata 18 mesi** dall'ultima sessione svolta in piattaforma. Una clausola
  perpetua è nulla per eccessiva compressione della libertà professionale.
- **Obbligo**: per tutta la durata, ogni sessione con quel cliente si prenota e
  si paga su KaiPai. Vietato proporre pagamento diretto, spostare la relazione
  fuori, o scambiare contatti prima della prima sessione pagata.
- **Penale forfettaria**: €500 per violazione accertata, o 12× la commissione
  media persa se maggiore, oltre a sospensione/rimozione e trattenuta dei
  payout pendenti. La forfettizzazione evita di dover provare il danno.
- **Buy-out**: il coach può liberare legittimamente un cliente pagando una fee
  una tantum pari a 3 mesi di commissione stimata. È ciò che rende la clausola
  commercialmente ragionevole invece che vessatoria, e la differenza fra
  reggere e non reggere in giudizio.

### 1.4 Segnalazione e contraddittorio

Sospensione cautelare su segnalazione dell'atleta o su pattern rilevati in
chat; il coach ha X giorni per rispondere prima della sanzione definitiva. Il
contraddittorio è parte di ciò che rende la clausola difendibile.

### 1.5 Qualità del servizio

No-show, cancellazioni tardive, rating minimo, obbligo di svolgere le sessioni
tramite il video della piattaforma — che è anche il modo tecnico per sapere che
la sessione è avvenuta.

### 1.6 Minori

Vedi Parte 2. È una sezione del contratto, non un documento separato.

### 1.7 Clausole vessatorie (art. 1341 c.c.)

Penale, recesso, foro competente, limitazione di responsabilità e
non-circumvention richiedono **approvazione specifica separata**: nel flusso,
una seconda checkbox che elenca gli articoli. Senza, quelle clausole sono
inefficaci — è l'errore più comune e il più costoso.

### Nota di realismo

La clausola rende l'uscita costosa e rischiosa, non impossibile. La ritenzione
reale è la somma di quattro pilastri: penale credibile, prova raccolta,
pagamenti/calendario/video che stanno solo qui, reputazione e flusso di lead.
Il contratto è il pilastro 1.

## Parte 2 — Minori

La piattaforma si rivolge **dai 15 anni in su**.

Sopra i 14 anni il minore può prestare da sé il consenso privacy per il
servizio (GDPR art. 8 + D.lgs 101/2018, soglia italiana a 14). Il genitore
serve per la **capacità contrattuale e il pagamento**, che restano a 18 anni.
Il contratto e la privacy vanno scritti in questi termini — "titolarità del
contratto e responsabilità genitoriale", non "consenso al trattamento del
minore".

### 2.1 Rami di registrazione

Data di nascita chiesta al signup per il ruolo Atleta (una data, non una
checkbox "sono maggiorenne": resta agli atti e discrimina i casi limite).

- **<15** → registrazione bloccata, messaggio esplicito.
- **15–17** → registrazione consentita. L'atleta ha il proprio account e può
  navigare, completare il profilo e scrivere ai coach; **non può prenotare**
  finché un genitore o tutore non ha autorizzato.
- **≥18** → flusso attuale invariato.

### 2.2 Perché l'account è dell'atleta e il gate sta sulla prenotazione

Un sedicenne userà il prodotto per conto suo: costringerlo dentro l'account del
padre è una finzione che si rompe al primo login condiviso, e produrrebbe dati
di contatto sbagliati (le notifiche di sessione arriverebbero al genitore, non
a chi deve presentarsi in call).

Sopra i 14 anni il minore consente da sé al trattamento dei propri dati, quindi
il genitore non serve per aprire l'account. Serve per la **capacità di
contrarre**, che sorge nel momento in cui si prenota una sessione — non al
sign-in. Il gate va quindi lì: `canBookSessions()`.

Il tutore non ha un account e non ne vuole uno. Conferma una volta sola da un
link firmato ricevuto via email, valido 14 giorni, e quella riga è la prova
dell'autorizzazione.

Conseguenza sul contratto coach: con atleti 15–17 **chat e videochiamata
coinvolgono direttamente il minore**, e valgono le regole di condotta della
sezione minori. Un contratto che finge il contrario non protegge nessuno.

### 2.3 Cosa esiste già (non committato)

`lib/core/guardians/` è scritto e va **committato con una migration**, non
riscritto:

- `age.ts` — `MIN_SIGNUP_AGE = 15`, `AGE_OF_MAJORITY = 18`,
  `ageFromBirthDate()`, `requiresGuardian()`, `isEligibleAge()`. Modulo puro
  (non `server-only`) così form e server action validano sulle stesse soglie.
- `index.ts` — `getGuardianStatus()` (`not_required` | `missing` | `pending` |
  `confirmed` | `unknown_age`), `canBookSessions()`, `inviteGuardian()`,
  `getInvitationByToken()`, `confirmGuardian()`. Token JWT `jose` firmati con
  `AUTH_SECRET`, TTL 14 giorni, scoped a un solo atleta.
- `athleteGuardians` in `lib/db/schema.ts` — una riga per atleta,
  `confirmedAt` null = invitato in attesa, `bothParentsDeclared` per l'art.
  316 c.c., `confirmedIp` come prova. **Manca la migration.**

Da costruire sopra: data di nascita al signup con blocco <15, UI di invito
nell'area atleta, pagina pubblica `/tutore/conferma`, chiamata a
`canBookSessions()` nel flusso di prenotazione, collegamento ad
`acceptsMinors` lato coach.

Nota: `getGuardianStatus` legge `clientProfiles.birthDate`, quindi la data di
nascita raccolta al signup deve finire lì, non solo su `users`.

### 2.4 Sezione minori del contratto coach

1. **Opt-in esplicito**: il coach dichiara se accetta atleti minorenni. Chi non
   opta non compare nelle ricerche per atleti minori e non può accettarne le
   prenotazioni.
2. **Requisiti**: dichiarazione di assenza di condanne o interdizioni ostative
   ex D.lgs 39/2014, impegno a esibire il certificato penale del casellario
   giudiziale su richiesta, RC professionale attiva.
3. **Condotta**: nessun contatto privato o fuori piattaforma con il minore — si
   salda con la clausola anti-disintermediazione, perché qui l'uscita dalla
   piattaforma non è solo danno economico ma rischio di tutela; comunicazioni
   rilevanti sempre anche al genitore; il genitore ha diritto di essere
   presente o raggiungibile durante la sessione.
4. **Limite di competenza**: il coaching non è psicoterapia né attività
   diagnostica. Obbligo di interrompere, indirizzare a un professionista
   sanitario e informare il genitore in presenza di segnali clinici (disturbi
   alimentari, autolesionismo, abuso).
5. **Sanzione**: violazione di questa sezione = rimozione immediata, senza i X
   giorni di contraddittorio previsti per le altre violazioni. Qui la
   sospensione cautelare deve essere istantanea.

## Architettura

### Il contratto come dato versionato

`lib/core/legal/coach-agreement.ts`, sul modello di
`lib/core/legal/processors.ts` (dati, non JSX, perché è la parte che va stale):

```ts
export const COACH_AGREEMENT = {
  version: '2026-07-1',
  effectiveDate: '...',
  commissionPercent: 20,
  nonCircumventionMonths: 18,
  penaltyAmountEur: 500,
  buyoutMonths: 3,
  sections: [ { id, title, body, vexatious: boolean }, ... ],
};
```

Una sola fonte alimenta tre consumatori:

- la pagina pubblica `/legal/coach-agreement` (riusa `legal-layout.tsx`);
- lo step di accettazione;
- l'elenco ex art. 1341, **generato** filtrando `vexatious: true`, così non può
  divergere dal corpo del contratto.

I numeri economici stanno in un posto solo e sono interpolati nel testo:
cambiare la commissione significa bumpare la versione, e tutto si aggiorna
insieme.

### Persistenza del consenso

Nuova tabella `agreementAcceptances` in `lib/db/schema.ts`, **append-only**:

```
id, userId,
agreementKey    -- 'coach' | 'guardian-consent'
version, acceptedTerms, acceptedVexatious,
signatureName, ipAddress, userAgent,
documentHash, acceptedAt
```

`documentHash` è lo SHA-256 del testo renderizzato al momento della firma: fra
due anni è ciò che dimostra *esattamente cosa* è stato accettato. Append-only
perché ogni nuova versione crea una riga nuova — la storia del consenso è la
prova. Nessun update, mai.

### Gate

Helper `hasAcceptedCoachAgreement(userId)` in `lib/core/legal/`, con
`CURRENT_COACH_AGREEMENT_VERSION`. Applicato in **due** punti:

1. `app/(dashboard)/dashboard/coach/layout.tsx` — redirect a
   `/onboarding/coach-agreement` se manca l'accettazione della versione
   corrente. Restano raggiungibili solo profilo in lettura e logout.
2. Server-side sulle azioni che contano — pubblicazione profilo
   (`profile-actions.ts`), accettazione prenotazione (`lib/core/bookings`).

Il primo è UX, il secondo è sicurezza: senza, basta una POST diretta.

### Pagina di accettazione

`app/(onboarding)/coach-agreement/page.tsx`:

- documento in riquadro scrollabile; il pulsante di firma resta disabilitato
  finché lo scroll non raggiunge il fondo, e il fatto viene registrato;
- checkbox 1 — accettazione generale;
- checkbox 2 — approvazione specifica delle clausole ex art. 1341, con gli
  articoli elencati;
- campo "Scrivi nome e cognome per firmare", che deve corrispondere al nome
  dell'account;
- server action che scrive la riga e reindirizza alla dashboard.

### Riaccettazione

Se la versione accettata ≠ corrente, il coach rivede il contratto con un banner
che evidenzia le modifiche. Coerente con il preavviso di 30 giorni: chi non
accetta entro la finestra passa in stato **sospeso**, non cancellato.

### Copia al coach

Email Resend alla firma con il documento e la data.

### Schema — minori

`athleteGuardians` (già in `lib/db/schema.ts`, migration da generare) è la
sede del consenso genitoriale: `confirmedAt`, `confirmedIp` e
`bothParentsDeclared` svolgono per il tutore la stessa funzione probatoria che
`agreementAcceptances` svolge per il coach. **Non** si duplica il consenso
genitoriale dentro `agreementAcceptances`: una sola sede per fatto.

`clientProfiles.birthDate` — già presente — diventa il campo che governa tutto,
valorizzato al signup e non più solo dal profilo. Nessun `isMinor` persistito:
l'età si deriva dalla data di nascita, perché un booleano salvato diventa falso
il giorno del diciottesimo compleanno e nessuno lo aggiorna.

`providerProfiles`:

```
acceptsMinors boolean not null default false
minorsClearanceVerified boolean not null default false
minorsClearanceReviewedAt timestamp
```

`acceptsMinors` si attiva solo firmando la sezione minori.
`minorsClearanceVerified` è admin-only (verifica del certificato penale) e
segue il pattern esistente di `identityVerified` / `certificationsVerified`.

**Gate prenotazioni**: una prenotazione per un atleta minore verso un coach con
`acceptsMinors = false` è rifiutata server-side in `lib/core/bookings`; quei
coach sono filtrati fuori dai risultati quando l'atleta selezionato è minore.
In fase A `minorsClearanceVerified` è un **badge di fiducia**, non un
requisito: renderlo bloccante prima di avere un presidio admin fermerebbe
l'onboarding. Diventa requisito quando i volumi lo giustificano.

### In sessione

Se l'atleta è minore, banner permanente nella pagina della videochiamata,
visibile a entrambi: "Sessione con atleta minorenne — il genitore ha diritto di
essere presente". Deterrenza a costo quasi nullo che resta agli atti.

Il tutore non ha un account, quindi riceve per email (a
`athleteGuardians.guardianEmail`) conferma e promemoria delle sessioni
prenotate. È l'unico canale che ha, ed è ciò che rende reale il "diritto di
essere presente".

## Fasi

- **A — Contratto coach**: documento versionato, pagina pubblica,
  `agreementAcceptances`, step bloccante, doppio gate, email di copia.
- **B — Minori**: commit di `lib/core/guardians/` con migration, data di
  nascita al signup con i tre rami (scritta su `clientProfiles.birthDate`), UI
  di invito del tutore nell'area atleta, pagina pubblica `/tutore/conferma`,
  `canBookSessions()` nel flusso di prenotazione, `acceptsMinors` lato coach
  con gate e filtro ricerca, banner in call, notifiche al tutore.
- **C — Fuori scope ora**: masking dei contatti e rilevamento pattern in chat
  con flag admin; Stripe Connect con `application_fee`; pannello admin delle
  segnalazioni.

A e B condividono `agreementAcceptances`, il pattern del documento versionato e
il gate: un unico spec, due fasi di implementazione.

## Da decidere prima dell'implementazione

- Giorni di payout dopo la sessione completata (dipende da Stripe Connect).
- Giorni di contraddittorio prima della sanzione definitiva.
- Revisione legale del testo da parte di un avvocato prima della messa online.
  Questo documento definisce struttura e clausole, non è testo legale
  definitivo.
