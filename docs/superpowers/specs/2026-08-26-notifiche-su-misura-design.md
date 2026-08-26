# Notifiche su misura: la voce cambia con chi legge

**Data:** 2026-08-26
**Stato:** disegno approvato, da implementare
**Dipendenze:** nessuna. La voce del coach non dipende dall'età, quindi qui
serve solo la data di nascita dell'atleta, che esiste già. Quando arriverà
`birthDateOf()` della specifica `2026-08-26-eta-coach-registrazione-design.md`,
questa lettura passerà da lì invece che da `client_profiles` diretto.

## Il problema

Ogni notifica ha oggi un solo testo, identico per tutti. Il promemoria che
arriva a un sedicenne al primo anno di percorso e quello che arriva a un coach
professionista con quaranta atleti sono la stessa frase:

> Ciao Marco, domani hai una sessione con Giulia. Giorno e orario esatti sono
> nel riquadro qui sotto.

Corretta, e impersonale. Su una piattaforma di coaching mentale sportivo il
tono non è decorazione: è parte di ciò che si vende.

## Decisioni prese (2026-08-26, Alessandro)

| domanda | scelta |
|---|---|
| chi scrive il testo su misura | **noi**, varianti scritte a mano, scelte a runtime. Niente riscrittura AI al momento dell'invio |
| quante voci | **tre**: `athlete_young`, `athlete_adult`, `coach` |
| dove si ferma | ovunque **tranne** gli avvisi di sicurezza e le mail legali |
| canali | mail, centro notifiche e push **nello stesso rilascio** |
| preferenza utente | **no**: la voce la decide l'età |
| multilingua | predisposto da subito, agganciandosi a `lib/i18n` |

### Perché non l'AI al momento dell'invio

Scartata con motivo, non per prudenza generica: la mail dipenderebbe da una
chiamata esterna per partire, nessuno rileggerebbe cosa arriva davvero
all'atleta, i fatti (data, ora, nome) sarebbero alterabili dal modello, e
nessun test potrebbe fissare il risultato. `sendEmail` non lancia mai proprio
perché una notifica non deve poter rompere l'azione che l'ha generata:
aggiungere una dipendenza di rete alla *composizione* del testo va contro
quella proprietà.

Resta possibile usare il modello **fuori linea**, in uno script, per abbozzare
le varianti che un umano approva prima che finiscano in `email_templates`.
Non è in questa specifica.

## L'impegno che vale per tutto il resto

**Cambia il registro, mai i fatti.** Data, ora, nome del coach, link e
pulsante sono identici in ogni variante. La voce veste il messaggio; non lo
riscrive, non aggiunge promesse, non toglie istruzioni. È questo a rendere la
funzionalità verificabile: la card dei dettagli è costruita dal codice
(`booking-context.ts`) e non passa dalle varianti.

## Le tre voci

```ts
// lib/core/notifications/voice.ts  — modulo puro, NON server-only
export const VOICES = ['athlete_young', 'athlete_adult', 'coach'] as const;
export type Voice = (typeof VOICES)[number];
export const YOUNG_VOICE_MAX_AGE = 20;

export function resolveVoice(input: {
  roleKeys: readonly string[];
  birthDate: string | Date | null;
  at?: Date;
}): Voice;
```

| chi | voce |
|---|---|
| ruolo `coach`, `club` o `admin` | `coach` |
| atleta, età ≤ 20 | `athlete_young` |
| atleta, età ≥ 21 | `athlete_adult` |
| atleta senza data di nascita | `athlete_adult` |

L'età la calcola `ageFromBirthDate` di `lib/core/guardians/age.ts`: la regola
sull'età è già scritta una volta e non ne nasce una seconda che un giorno dirà
qualcos'altro. Ricalcolata a ogni invio, quindi il ventunesimo compleanno
cambia voce da solo — la stessa proprietà del gate del tutore.

L'età non compare mai nel testo, non viene mostrata al coach e non lascia il
server: sceglie un file, non diventa un contenuto.

### Il confine dei 20 anni

Arbitrario, e va detto. Non è una soglia di legge come 15 e 18: è una scelta
di prodotto, isolata in `YOUNG_VOICE_MAX_AGE` perché spostarla sia una riga.

## Il registro è una proprietà dell'evento

Campo nuovo nel catalogo, accanto a `mandatoryEmail`:

```ts
register: 'free' | 'careful' | 'plain';
```

| valore | eventi | cosa concede |
|---|---|---|
| `free` | conferme, promemoria, chiamata avviata, nuovo messaggio, report pronto, sessione completata, recensione, profilo approvato | personalità piena, emoji ammesse |
| `careful` | richiesta rifiutata o scaduta, sessione annullata, profilo coach da rivedere | la voce c'è, ma incoraggiante e asciutta: niente battute, niente emoji |
| `plain` | avviso di sicurezza | un solo testo sobrio per tutti, nessuna variante |

Alessandro ha scelto la voce anche sulle brutte notizie. `careful` è il modo
di rispettarlo senza che un rifiuto suoni come una presa in giro, ed è una
**regola verificabile**: un test rifiuta un'emoji in una variante `careful`.

## Il destinatario si risolve una volta sola

Oggi `notify()` interroga `users` **due volte** — `resolveInAppFirstName` per
il saluto e `resolveEmailRecipient` per la mail — e costruisce il testo
*prima* di sapere chi lo riceverà. È il motivo per cui il tono non può
esistere.

Diventa:

```ts
// una sola select, left join su user_roles, client_profiles e profiles
resolveRecipientProfile(userId) → {
  email, firstName, fullName, voice, locale
}
```

Poi si costruisce il contenuto, e lo stesso contenuto alimenta centro
notifiche, push e mail. Il controllo della preferenza email resta separato,
perché dipende dall'evento e non dalla persona.

Una query in meno, non una in più.

## Le parole delle mail: nessuna migrazione

`resolveTemplate(eventKey, locale, voice)` cerca in cascata:

```
booking_accepted.young   ← variante per la voce
      ↓ se manca
booking_accepted         ← il testo di oggi
      ↓ se manca
il valore di default-templates.ts, nel codice
```

La variante è **una riga con la chiave suffissata**: niente `ALTER TABLE` su
un database di produzione, nessun indice da rifare, la cache e il registro
delle consegne continuano a funzionare com'erano. Scriviamo solo le varianti
che cambiano davvero, e un evento senza variante continua a partire con il
testo attuale — additivo, come tutto il resto in questo repository.

## Le parole dell'app: completare un lavoro già cominciato

`buildNotificationContent` è uno `switch` di 22 rami dentro un file da 950
righe, e fa due mestieri: decide i dati (link, `bookingId`) e scrive le
parole. Sei eventi sono però **già** stati estratti in
`lib/core/notifications/appointment-content.ts` — funzioni pure, con il loro
test già dentro `npm test`.

Quel pattern non va inventato: va completato.

- `lib/core/notifications/in-app-copy.ts` — per ogni evento, un record
  `voce → costruttore(ctx) → { title, body }`, con `base` come ripiego e la
  stessa cascata delle mail. `appointment-content.ts` ci confluisce.
- Nell'`index.ts` resta `buildNotificationData(type, ctx)`, che decide link e
  identificatori e non scrive più prosa.
- `withPersonalGreeting` diventa parte dello strato delle parole: il saluto è
  registro, e oggi è una funzione a sé che antepone «Ciao X,» a qualunque cosa.

Senza questo pezzo la voce vivrebbe solo nelle mail, e l'app continuerebbe a
dare del lei.

## Multilingua: agganciarsi, non costruire

`lib/i18n/` **esiste già**: `PLANNED_LOCALES = ['it','en','es','fr']`,
`ENABLED_LOCALES = ['it']`, `resolveLocale()` con preferenza di profilo,
cookie e `Accept-Language`, i cataloghi in `messages/`, e la colonna
`profiles.locale`. Le notifiche non ci sono mai state collegate.

Quindi:

1. `resolveRecipientProfile` restituisce anche la `locale`, presa da
   `profiles.locale` e normalizzata con `normalizeLocale`.
2. La chiave di ricerca del testo diventa `(evento, locale, voce)`, sia per le
   mail sia per l'app.
3. **Un disallineamento da chiudere.** `lib/core/email/templates.ts` ha un suo
   `DEFAULT_LOCALE = 'it-IT'`, mentre il codice canonico è `'it'` — `'it-IT'`
   è il `formatLocale`. Si aggiunge un adattatore di una riga,
   `templateLocaleFor(locale)` → `LOCALE_DEFINITIONS[locale].formatLocale`,
   così le righe già in produzione restano valide e l'ingresso è ovunque il
   codice canonico. Nessuna migrazione di dati.

**Non è in questa specifica tradurre alcunché.** Nessun testo inglese,
spagnolo o francese viene scritto ora: si predispone la giuntura, che costa
poco adesso e molto dopo. Con `ENABLED_LOCALES = ['it']` il comportamento
osservabile non cambia di una virgola.

## Cosa lo tiene in piedi

| test | cosa fissa |
|---|---|
| `voice.test.ts` | fasce, confine dei 20 anni, età ignota, compleanno, ruoli |
| `in-app-copy.test.ts` | ogni evento risolve per ogni voce; nessuna emoji nelle varianti `careful`; nessun testo vuoto |
| contratto template | per ogni evento e ogni voce, i segnaposto stanno nella whitelist dell'evento — altrimenti la mail non parte, come già oggi |
| catalogo | ogni evento ha un `register` |

Tutti agganciati a `npm test`. `npm run test:inventory` dirà se qualcosa è
rimasto fuori.

## Il seed è una scrittura in produzione

Le varianti nuove arrivano nel database con `npm run email:seed-templates`,
che scrive sul progetto Supabase di produzione. È additiva — chiavi nuove, le
righe esistenti non vengono toccate — ma va annunciata prima di eseguirla.

Rilasciare senza seed non è un guasto: la cascata ripiega sul codice, e
partono i testi di oggi.

## Rischi, detti prima

- **La voce sulle brutte notizie.** Scelta esplicita di Alessandro contro la
  mia raccomandazione. `careful` e il test sulle emoji sono la mitigazione; se
  un rifiuto letto in produzione suonerà comunque sbagliato, la leva è il
  registro dell'evento — una riga nel catalogo.
- **Fra i 15 e i 17 anni la mail la legge spesso anche un genitore.** Il
  registro giovane deve essere confidenziale, mai complice contro l'adulto:
  niente ironia sui tutori, niente allusioni a cose «fra noi».
- **Il volume di scrittura.** 22 eventi per un massimo di tre voci. Si scrive
  solo ciò che cambia; la cascata copre il resto.

## Cosa resta fuori

- Traduzioni vere in altre lingue.
- Un interruttore che permetta all'utente di scegliersi il tono.
- Qualunque chiamata al modello al momento dell'invio.
