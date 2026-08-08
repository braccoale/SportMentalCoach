# Registro delle attività di trattamento (art. 30 GDPR)

**Titolare:** KaiPai — *DA COMPLETARE: ragione sociale, sede legale, P.IVA/C.F., PEC*
**Contatto per il trattamento dei dati:** privacy@kaipaicoaching.com
**DPO:** non nominato. Valutazione: non risulta obbligatorio ex art. 37 finché
non si trattano categorie particolari su larga scala né si effettua
monitoraggio sistematico. *Da riconfermare se cambia il perimetro.*

**Versione:** allineata a `LEGAL_VERSION` in `lib/core/legal/processors.ts`
**Ultimo aggiornamento:** 6 agosto 2026

> Questo registro è una bozza redatta a partire dal codice sorgente e dallo
> schema del database. Va verificato da un legale prima di essere considerato
> l'adempimento formale dell'art. 30.

---

## 1. Registrazione e gestione degli account

| | |
|---|---|
| **Finalità** | Creare e gestire l'account, autenticare l'utente, applicare i limiti d'età |
| **Interessati** | Atleti (dai 15 anni), Coach, referenti di Club, amministratori |
| **Categorie di dati** | Nome, cognome, email, password (cifrata), ruolo, data di nascita (atleti) |
| **Base giuridica** | Art. 6.1.b — esecuzione del contratto |
| **Conservazione** | Durata dell'account + 36 mesi dalla cessazione; account cessato dopo 24 mesi di inattività |
| **Responsabili** | Supabase (database e autenticazione), Vercel (hosting) |
| **Trasferimenti extra-UE** | No per Supabase (AWS Francoforte); Vercel società USA con SCC |
| **Misure** | HTTPS, cifratura a riposo, password in hash gestite da Supabase Auth, accesso limitato |

## 2. Prova dell'accettazione dei documenti legali

| | |
|---|---|
| **Finalità** | Dimostrare quale versione di Termini, Privacy e Cookie l'utente ha accettato |
| **Interessati** | Tutti gli utenti registrati e i genitori/tutori firmatari |
| **Categorie di dati** | ID utente o soggetto minorenne, email del firmatario esterno, firma digitata, testo/versione/hash del documento, dichiarazioni rese, data/ora, indirizzo IP, user agent |
| **Base giuridica** | Art. 6.1.c — obbligo di legge (accountability, art. 5.2); art. 6.1.f — difesa in giudizio |
| **Conservazione** | Come l'account, poi per il termine di prescrizione applicabile. **Tabella append-only: nessun aggiornamento né cancellazione** |
| **Responsabili** | Supabase |
| **Riferimento tecnico** | Tabella `agreement_acceptances`; `lib/core/legal/acceptance.ts` |

## 3. Profilo pubblico del Coach

| | |
|---|---|
| **Finalità** | Pubblicare il profilo professionale perché gli atleti possano scegliere |
| **Interessati** | Coach approvati |
| **Categorie di dati** | Nome, foto, biografia, specializzazioni, certificazioni, video, indicatori di esperienza aggregati |
| **Base giuridica** | Art. 6.1.b — esecuzione del contratto con il Coach |
| **Conservazione** | Finché il profilo è pubblicato; recensioni oltre la chiusura |
| **Particolarità** | Dati **diffusi**: accessibili senza registrazione e indicizzabili |

## 4. Richieste di sessione e appuntamenti

| | |
|---|---|
| **Finalità** | Gestire richieste, accettazioni, calendario, completamento e archivio |
| **Interessati** | Atleti e Coach |
| **Categorie di dati** | Riferimenti alle parti, servizio, orario, nota della richiesta, stato, orari reali di inizio/fine |
| **Base giuridica** | Art. 6.1.b |
| **Conservazione** | 36 mesi dalla cessazione dell'account; oltre, se pende un contenzioso |
| **Comunicazione a terzi** | Al Coach interessato, che agisce come **titolare autonomo** |

## 5. Messaggistica

| | |
|---|---|
| **Finalità** | Consentire la comunicazione fra atleta e coach legata a una sessione |
| **Categorie di dati** | Testo dei messaggi, mittente, data/ora, stato di lettura |
| **Base giuridica** | Art. 6.1.b |
| **Conservazione** | Finché è attivo l'account di almeno un partecipante, poi 36 mesi |
| **Nota di rischio** | Campo libero: nonostante il divieto nei Termini, può accogliere dati di salute non richiesti. Vedi DPIA §Rischi |

## 6. Videochiamate

| | |
|---|---|
| **Finalità** | Svolgere la sessione |
| **Categorie di dati** | Audio/video in transito; il video non è registrato. Con Appunti AI e tutti i consensi richiesti, la sola traccia audio viene registrata e trascritta |
| **Base giuridica** | Art. 6.1.b per la chiamata; artt. 6.1.a e 9.2.a per Appunti AI |
| **Conservazione** | Video non conservato; audio AI 7 giorni; trascrizione/report seguono lo storico della sessione |
| **Responsabili** | LiveKit Cloud; per Appunti AI anche Deepgram e OpenAI |
| **Modalità di trasmissione a Deepgram** | L'audio non viene trasmesso dai nostri server: Deepgram lo scarica dallo storage Supabase tramite un collegamento firmato, valido 15 minuti e rigenerato a ogni tentativo. Il bucket resta privato e il collegamento non è mai esposto al browser. Destinatario e categorie di dati non cambiano rispetto all'invio diretto |

## 7. Autorizzazione del genitore o tutore

| | |
|---|---|
| **Finalità** | Raccogliere e provare l'autorizzazione al percorso di un atleta di 15-17 anni |
| **Interessati** | Genitori/tutori (adulti) e atleti minorenni |
| **Categorie di dati** | Nome, email, rapporto e titolo dichiarati; firma digitata; dichiarazioni di maggiore età e responsabilità; opzione Appunti AI; testo/versione/hash del documento; data/ora, IP, user agent; eventi di invito, ricevuta e revoca. I token sono conservati solo come SHA-256 |
| **Base giuridica** | Art. 6.1.b — conclusione del contratto da parte del legittimato; art. 6.1.f — prevenire rapporti invalidi |
| **Conservazione** | Finché l'atleta ha un account attivo, poi 36 mesi |
| **Responsabili** | Supabase (dati e audit), Resend (email, ricevuta e link) |
| **Misure** | Link opaco monouso, token solo in hash, email diversa dall'atleta, firma corrispondente all'invito, documento versionato e hashato, log append-only, RLS e nessun privilegio Data API, revoca self-service che annulla sessioni e trattamenti AI aperti |
| **Riferimento tecnico** | Tabelle `athlete_guardians`, `guardian_invitations`, `agreement_acceptances`, `guardian_authorization_events`; `lib/core/guardians/` |

## 8. Notifiche in piattaforma, email e push

| | |
|---|---|
| **Finalità** | Avvisare di fatti che riguardano l'utente (richieste, conferme, messaggi) |
| **Categorie di dati** | Email; per le push, endpoint del dispositivo e chiavi crittografiche |
| **Base giuridica** | Art. 6.1.b per le email di servizio; **consenso** (art. 6.1.a) per le push, revocabile |
| **Conservazione** | Iscrizione push fino a revoca o a segnalazione di endpoint non più valido |
| **Responsabili** | Resend (USA, SCC); servizi push di Google/Apple/Mozilla |
| **Nota** | Nessuna finalità di marketing |

## 9. Recensioni

| | |
|---|---|
| **Finalità** | Reputazione verificata dei Coach |
| **Categorie di dati** | Voto, testo, autore, eventuale replica del Coach |
| **Base giuridica** | Art. 6.1.b; art. 6.1.f per la permanenza dopo la chiusura dell'account |
| **Conservazione** | Permanente, anche dopo la chiusura dell'account dell'autore |

## 10. Navigazione del sito pubblico e sicurezza

| | |
|---|---|
| **Finalità** | Servire le pagine, diagnosticare guasti, difendere da abusi |
| **Interessati** | Qualsiasi visitatore, anche non registrato |
| **Categorie di dati** | IP, user agent, pagina richiesta, data/ora |
| **Base giuridica** | Art. 6.1.f — legittimo interesse |
| **Conservazione** | Massimo 12 mesi |
| **Nota** | Google Analytics si carica soltanto dopo consenso cookie; nessun nome/email viene inviato |

## 11. Video di presentazione ospitati da terzi

| | |
|---|---|
| **Finalità** | Riprodurre il video di un Coach ospitato su YouTube o Vimeo |
| **Categorie di dati** | IP e dati del browser, trasmessi **solo dopo clic esplicito** dell'utente |
| **Base giuridica** | Art. 6.1.a — consenso espresso dal clic (caricamento non automatico) |
| **Riferimento tecnico** | `components/video-embed.tsx` |

---

## Categorie particolari (art. 9)

Il servizio non è sanitario e non richiede dati clinici. I campi liberi possono
comunque riceverne incidentalmente; inoltre una sessione con Appunti AI può
rivelare dati dell'art. 9. In quel caso il trattamento è separato, facoltativo,
richiede consenso esplicito di entrambi e, per il minore, anche autorizzazione
del tutore ancora valida. Il rischio residuo è valutato nella DPIA.

## Trasferimenti extra-UE

| Fornitore | Paese | Garanzia |
|---|---|---|
| Supabase (AWS) | UE — Francoforte | Nessun trasferimento |
| Vercel | UE con società USA | SCC art. 46 |
| LiveKit Cloud | USA | SCC art. 46 |
| Deepgram | USA | SCC art. 46 |
| OpenAI | USA | SCC art. 46 |
| Resend | USA | SCC art. 46 |
| Google Analytics | USA / UE | DPF e SCC dichiarate |
| Servizi push browser | USA / UE | SCC art. 46 |
| YouTube / Vimeo | USA | SCC art. 46 — solo su clic |
