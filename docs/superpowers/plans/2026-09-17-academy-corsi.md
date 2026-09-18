# KaiPai Academy — Piano di implementazione revisionato

Versione: 17 settembre 2026.

Questo documento sostituisce il piano precedente. Include le modifiche concordate: formazione erogata attraverso sessioni KaiPai marcate «Corso Academy», sessioni individuali e di gruppo, materiali scaricabili, struttura del corso bloccata dopo la prima assegnazione, controlli sul server, completamenti affidabili e gestione amministrativa completa delle bozze.

Le regole su revoche, cancellazioni e visibilità dei badge rimangono da definire. Non trasformare queste decisioni aperte in comportamenti automatici.

Il piano è basato sul documento fornito, non su un'ispezione del repository. Percorsi già citati nel piano originale sono punti di integrazione da verificare; nuovi file, campi e tabelle sono proposte di implementazione. Non usare numeri di riga o di migrazione presunti.

## 1. Obiettivo e perimetro

L'Academy consente all'admin di creare corsi composti da moduli, nominare i coach docenti, assegnare i corsi ai coach partecipanti e validare i completamenti. Il docente eroga la formazione creando normali sessioni della piattaforma con una classificazione Academy e un collegamento al modulo. Il partecipante consulta programma e progressi, accede alle sessioni autorizzate e scarica i materiali.

La prima versione comprende:

- Corsi ed edizioni, moduli, durata prevista e ordinamento.
- Gestione delle bozze e blocco della struttura alla prima assegnazione.
- Docenti autorizzati per ciascun corso.
- Assegnazioni individuali dei coach partecipanti.
- Sessioni Academy individuali e di gruppo.
- Materiali per modulo: documenti, slide, file video e altri formati consentiti.
- Avanzamento personale, validazione admin e correzione dei completamenti errati con audit.
- Preparazione del badge di completamento; attivazione pubblica subordinata alle decisioni della sezione 10.

Pagamenti dei corsi, quiz, esami, certificati PDF e un nuovo sistema di videoconferenza non fanno parte di questa versione. Non introdurre la registrazione automatica delle sessioni: utilizzare una registrazione esistente soltanto quando disponibile e pubblicata esplicitamente tra i materiali.

## 2. Ruoli e autorizzazioni

| Operazione | Admin | Coach docente del corso | Coach partecipante |
|---|---|---|---|
| Creare e modificare una bozza | Sì | No | No |
| Attivare corso, nominare docenti, assegnare partecipanti | Sì | No | No |
| Creare una sessione Academy | Sì, selezionando il docente | Sì, per i propri corsi | No |
| Gestire una sessione | Sì | Solo se docente della sessione | No |
| Entrare nella sessione | Secondo i permessi amministrativi esistenti | Se docente della sessione | Solo se invitato alla sessione e assegnato al corso |
| Caricare e pubblicare materiali | Sì | Sì, per i propri corsi | No |
| Consultare/scaricare materiali pubblicati | Sì | Per i propri corsi | Per i propri corsi accessibili |
| Consultare progressi | Tutti | Solo quanto necessario per i propri corsi/sessioni | Solo i propri |
| Validare o correggere completamenti | Sì | No | No |

La nomina del docente è una relazione con il corso, non un nuovo ruolo globale dell'utente. Non rende tutti i coach docenti e non iscrive automaticamente il docente come partecipante. Un coach può insegnare in un corso e partecipare a un altro.

Per la prima versione, l'admin mantiene la validazione dei completamenti come nel piano originale. L'eventuale delega al docente richiede una decisione successiva.

## 3. Esperienza del prodotto

### Admin

In `/dashboard/admin/academy` vede l'elenco dei corsi e può creare una bozza. Nel dettaglio di un corso trova programma, docenti, partecipanti, sessioni, materiali e monitoraggio.

Prima della prima assegnazione può modificare titolo e descrizione del corso, aggiungere/modificare/eliminare moduli e riordinarli. Può attivare soltanto un corso con almeno un modulo valido. La cancellazione dei moduli è consentita soltanto quando non sono referenziati da sessioni o altri dati da conservare.

Dopo la prima assegnazione, programma, titoli, descrizioni didattiche, ore e ordine dei moduli diventano non modificabili. La pagina mostra «Programma bloccato: crea una nuova edizione per modificarlo».

Restano gestibili le attività operative: docenti, nuove assegnazioni, sessioni, materiali integrativi e completamenti. Le variazioni operative non cambiano requisiti né ore del corso già assegnato.

### Coach docente

Nella propria Academy distingue «Corsi che seguo» e «Corsi che tengo». Dal corso che tiene o dal flusso esistente «Nuova sessione» può creare una sessione con:

- Tipo «Corso Academy».
- Corso e modulo, scelti esclusivamente tra quelli che può insegnare.
- Modalità individuale oppure di gruppo.
- Data, orario, durata e le altre impostazioni supportate dalle sessioni esistenti.
- Uno o più partecipanti, selezionati tra i coach assegnati al corso.

La modalità individuale richiede esattamente un partecipante; quella di gruppo ne richiede almeno due e rispetta i limiti reali della piattaforma. Una sessione fa riferimento a un solo modulo nella prima versione; un modulo può avere più sessioni, per repliche o lezioni successive.

La fine della sessione non completa automaticamente il modulo. È un evento utile al monitoraggio; la validazione dell'apprendimento rimane separata.

### Coach partecipante

Vede titolo ed edizione del corso, descrizione, ore totali, moduli e avanzamento. Nel dettaglio di un modulo trova materiali pubblicati e le sessioni a cui è stato invitato. Le sessioni individuali degli altri partecipanti non devono essere visibili.

Può entrare in una sessione autorizzata e scaricare i materiali. Non può autoassegnarsi corsi, modificare progressi o segnarsi completato. Gli stati vuoti distinguono «nessun corso assegnato», «nessuna sessione programmata» e «nessun materiale pubblicato».

## 4. Modello dati proposto

Mantenere le convenzioni del repository per audit, timestamp, chiavi esterne e stati vincolati nel database. Verificare gli schemi esistenti prima di produrre SQL.

| Entità | Contenuto e vincoli essenziali |
|---|---|
| `academy_courses` | Titolo, descrizione, stato, edizione, collegamento opzionale all'edizione precedente, `structure_locked_at`, audit. Il blocco è persistente, non dipende dal numero attuale di assegnazioni. |
| `academy_course_modules` | Corso, titolo, descrizione, ore previste, ordinamento, audit. Durate finite e non negative; ordine deterministico. |
| `academy_course_instructors` | Relazione univoca corso/docente con informazioni di nomina e audit. |
| `academy_course_assignments` | Relazione univoca corso/coach, stato di avanzamento, data e autore dell'assegnazione, data di completamento. |
| `academy_module_completions` | Assegnazione, modulo e corso, data e autore della validazione, eventuale sessione di riferimento. Un solo completamento corrente per assegnazione/modulo. |
| `academy_module_attachments` | Modulo, titolo, tipo, chiave privata di storage, nome originale, MIME, dimensioni, stato di pubblicazione, autore e audit. Può rappresentare anche video. |
| Collegamento sessione/Academy | Relazione con la sessione esistente, corso e modulo. Una sessione Academy deve avere un collegamento valido; non basta un'etichetta grafica. |
| Partecipanti alla sessione Academy | Collegamento tra sessione e assegnazioni dei partecipanti, riusando il modello esistente se compatibile con coach partecipanti e sessioni di gruppo. |

Non creare una seconda tabella di sessioni, un calendario parallelo o stanze video separate se i servizi esistenti possono essere estesi correttamente.

Per impedire completamenti associati al corso sbagliato, usare controlli applicativi e vincoli referenziali coerenti. Una soluzione è riportare `course_id` nei completamenti e usare chiavi esterne composte verso `(assignment_id, course_id)` e `(module_id, course_id)`, con i corrispondenti vincoli univoci sulle tabelle referenziate. Applicare lo stesso principio ai collegamenti delle sessioni e dei partecipanti.

Le ore totali derivano dai moduli, senza un totale modificabile separatamente. Se si mantiene `real` come nel piano originale, validare valori finiti e una granularità esplicita; normalizzare il calcolo per evitare decimali di visualizzazione incoerenti. Le ore effettive delle sessioni non cambiano automaticamente le ore previste del corso.

Non copiare le cancellazioni a cascata del piano precedente su assegnazioni e completamenti senza avere definito lo storico. Distinguere l'eventuale cancellazione dell'account, regolata dalle procedure della piattaforma, dalla revoca di un corso.

## 5. Blocco del programma e nuove edizioni

La prima assegnazione deve bloccare la struttura nello stesso salvataggio atomico che crea l'assegnazione. Una modifica concorrente non deve poter aggiungere un modulo mentre un altro amministratore assegna il corso.

Il blocco non viene rimosso riportando il corso in bozza o eliminando partecipanti. Per modificare il programma si usa «Crea nuova edizione»:

1. Copiare programma e informazioni del corso in una nuova bozza.
2. Registrare il collegamento all'edizione precedente.
3. Non copiare assegnazioni, progressi, completamenti, sessioni o badge.
4. Rendere esplicita l'eventuale copia dei materiali, evitando riferimenti condivisi che una modifica possa alterare per entrambe le edizioni.
5. Consentire modifiche alla nuova bozza prima delle nuove assegnazioni.

Un'edizione nuova non riapre i completamenti della precedente. Per preservare un eventuale riconoscimento pubblico, conservarne titolo, edizione, ore e data al momento dell'emissione, senza dipendere da dati editoriali modificabili.

## 6. Materiali e video

Implementare caricamento, pubblicazione, elenco, visualizzazione quando supportata e download. I materiali in bozza sono visibili ad admin e docenti autorizzati; quelli pubblicati sono disponibili ai partecipanti autorizzati.

Usare storage privato. Il server deve verificare utente, corso, modulo e diritto di accesso prima di concedere upload, download o un URL temporaneo. I bucket privati Supabase supportano accesso autenticato o URL firmati a scadenza: [documentazione Supabase](https://supabase.com/docs/guides/storage/serving/downloads).

Verificare tipo e dimensione dei file e limitare le chiavi di upload all'area autorizzata. Non fidarsi di una chiave storage arbitraria inviata dal client. Prevedere finalizzazione dell'upload, gestione dei caricamenti falliti e pulizia dei file rimasti senza un riferimento valido.

Per i video usare un percorso compatibile con le dimensioni previste, con avanzamento e gestione degli errori; evitare di far transitare obbligatoriamente tutto il file attraverso un piccolo form del server. Verificare sullo storage reale il comportamento di riproduzione e download. Un link esterno resta un collegamento, non viene presentato come file scaricabile ospitato su KaiPai.

La pubblicazione di una registrazione è esplicita. Riutilizzare le autorizzazioni e i consensi della piattaforma; non distribuire automaticamente registrazioni o note private della sessione.

I materiali integrativi aggiunti dopo il blocco del programma non introducono nuovi requisiti obbligatori e non annullano completamenti acquisiti.

## 7. Integrità, completamenti e concorrenza

Ogni operazione ricava l'attore dalla sessione autenticata, valida gli input sul server e ricarica le relazioni reali. I campi nascosti dei form non sono una fonte attendibile per permessi, appartenenza al corso o audit.

### Assegnazione

- Controllare che il destinatario esista, sia un coach idoneo secondo i criteri correnti del progetto, non sia cancellato e non sia un account demo nel contesto reale.
- Controllare che il corso sia attivo e abbia moduli validi.
- Bloccare la riga del corso; ricontrollare stato e struttura; creare l'assegnazione e valorizzare il blocco permanente del programma nella stessa transazione.
- Gestire la ripetizione della richiesta senza creare duplicati.

### Creazione e modifica di sessioni Academy

- Controllare che il docente sia nominato per il corso e possa gestire quella sessione.
- Controllare che modulo e partecipanti appartengano al corso selezionato.
- Rifiutare assegnazioni estranee, duplicati e inviti al docente stesso come partecipante nella propria sessione.
- Applicare i limiti della modalità individuale o di gruppo anche sul server.
- Conservare lo storico delle sessioni concluse; evitare conversioni di tipo o sostituzioni di corso/modulo che cambino retroattivamente la loro natura.
- Verificare accesso a sessione, sala video, registrazioni e materiali anche tramite URL diretto.

### Completamento del modulo

1. Autorizzare l'admin e ricavare il corso dall'assegnazione nel database.
2. Acquisire i lock concordati e ricaricare assegnazione, modulo ed eventuale sessione di riferimento.
3. Verificare che modulo e assegnazione appartengano allo stesso corso. Se è indicata una sessione, controllare anche collegamento al modulo e partecipazione del coach.
4. Inserire il completamento soltanto se non esiste già, senza riscriverne data o autore in caso di doppio invio.
5. Ricalcolare esclusivamente lo stato dell'assegnazione interessata.
6. Impostare la data di completamento del corso soltanto nel passaggio da non completato a completato. Non modificarla se il corso era già completato.
7. Registrare la modifica nell'audit e aggiornare le viste interessate.

Adottare un ordine coerente dei lock, per esempio corso, assegnazione e poi righe dipendenti. Applicare il protocollo a tutte le scritture che possono interagire; coprire i casi concorrenti con test reali. I lock di riga PostgreSQL possono serializzare modifiche concorrenti alle righe interessate: [documentazione PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html).

### Correzione di un errore

L'admin può annullare un completamento registrato per errore con motivo obbligatorio e audit del valore precedente, dell'autore e della data. Ricalcolare solo quell'assegnazione; se non è più completa, azzerare la data corrente di completamento conservando la storia nell'audit. Un eventuale completamento successivo acquisisce una nuova data, senza riscrivere la storia.

L'effetto della correzione su un badge già pubblicato deve essere deciso prima di attivare i badge pubblici, come indicato nella sezione 10.

Audit e mutazione devono riuscire insieme per le operazioni critiche. Se il servizio audit esistente non supporta la stessa transazione, adeguarlo o adottare un meccanismo transazionale equivalente. Non mostrare «operazione fallita» per un errore di audit dopo un salvataggio già completato, inducendo l'utente a ripeterlo.

## 8. Integrazione con le sessioni esistenti

Prima di modificare il flusso, verificare schema, partecipanti, permessi, calendario, notifiche, stanze video e chiusura delle sessioni. Individuare ogni assunzione secondo cui il partecipante debba essere un atleta.

Controllare in particolare:

- Supporto reale a un docente e più coach partecipanti, sia nei dati sia nella videoconferenza.
- Possibilità di entrare e visualizzare la sessione come coach partecipante senza ottenere permessi da docente.
- Promemoria e inviti indirizzati ai partecipanti corretti.
- Note, registrazioni, trascrizioni e riepiloghi: nessuna esposizione accidentale dei dati di altri partecipanti o dei normali percorsi atleta.
- Effetti su crediti, pacchetti, addebiti, statistiche delle prestazioni e report delle sessioni ordinarie.

Poiché la monetizzazione dell'Academy è fuori perimetro, non agganciare automaticamente alle nuove sessioni gli addebiti o il consumo crediti delle sessioni coach-atleta. Verificare che la classificazione Academy consenta di distinguere questi percorsi senza modificare il comportamento delle sessioni esistenti.

Se la piattaforma non supporta ancora sessioni di gruppo, aggiungere al piano tecnico l'estensione necessaria prima di dichiarare completata la funzione; un'etichetta «gruppo» nell'interfaccia non è sufficiente.

## 9. Organizzazione del codice

Conservare la separazione fra logica pura, accesso ai dati e interfaccia proposta nel piano originale.

Moduli proposti in `lib/core/academy/`:

- `course-hours.ts`: calcolo e presentazione coerente della durata prevista.
- `assignment-progress.ts`: stato derivato dai moduli e dai completamenti correnti.
- `courses.ts`: bozze, attivazione, blocco della struttura, nuove edizioni.
- `assignments.ts`: idoneità, assegnazioni, validazioni e correzioni.
- `instructors.ts`: nomina dei docenti e autorizzazioni per corso.
- `sessions.ts`: integrazione Academy con il servizio sessioni già esistente.
- `materials.ts`: upload, pubblicazione e accesso ai materiali.
- `badges.ts`: preparazione dei riconoscimenti e futura politica di visibilità.

Le funzioni destinate al coach partecipante ricavano l'identità autenticata o richiedono un contesto autorizzato esplicito. Le funzioni pubbliche espongono soltanto i dati approvati per il badge. Una funzione riutilizzabile che accetta un `userId` non deve diventare un modo per leggere progressi altrui.

Aggiornare le viste admin, docente, partecipante e, quando abilitato, profilo pubblico dopo le mutazioni. Verificare la strategia di cache esistente prima di scegliere tra invalidazione per percorsi e per tag.

## 10. Decisioni aperte: revoche, cancellazioni e badge

Questa sezione è volutamente non approvata. Le seguenti domande richiedono una scelta di prodotto:

| Tema | Decisione da prendere |
|---|---|
| Revoca dell'assegnazione | Toglie accesso a sessioni e materiali? Conserva progressi e storico? |
| Nuova assegnazione dopo revoca | Riprende i progressi precedenti o avvia un nuovo tentativo? |
| Corso annullato o archiviato | Impedisce nuove assegnazioni? Cosa vedono gli iscritti e chi ha già completato? |
| Badge di corso concluso | Rimane visibile quando il corso non viene più erogato? |
| Correzione del completamento | Nasconde subito il badge oppure richiede una revoca esplicita? |
| Revoca del riconoscimento | Chi la esegue, per quale motivo e con quale storico? |

Indicazione tecnica per il lavoro nel frattempo: evitare cancellazioni definitive di assegnazioni e completamenti, non esporre comandi di revoca o annullamento con effetti non decisi e mantenere disabilitata la pubblicazione dei badge finché la politica non viene definita e testata.

Questa dipendenza non impedisce di implementare corsi, docenti, assegnazioni, sessioni, materiali e progressi. Impedisce di dichiarare complete le funzioni di revoca e il rilascio dei badge pubblici.

## 11. Sequenza di implementazione

### Task 0 — Verifica del repository e specifica aggiornata

- [ ] Leggere istruzioni del progetto, specifica esistente e schema reale.
- [ ] Mappare autenticazione, sessioni, partecipanti, calendario, video, storage, audit e migrazioni.
- [ ] Verificare il supporto a coach partecipanti e gruppi; documentare le estensioni necessarie.
- [ ] Aggiornare la specifica con questo perimetro e con le decisioni ancora aperte.
- [ ] Confermare il database di sviluppo/test realmente separato dalla produzione.

Risultato: mappa dei file effettivi da modificare e dei punti di integrazione, senza nomi di API inventati.

### Task 1 — Schema e migrazioni

- [ ] Implementare entità, relazioni, indici, vincoli di appartenenza e audit.
- [ ] Estendere le sessioni esistenti e i partecipanti secondo l'esito del Task 0.
- [ ] Introdurre il blocco persistente del programma e il collegamento tra edizioni.
- [ ] Estendere le azioni audit anche per docenti, sessioni Academy, materiali e correzioni.
- [ ] Generare e leggere tutto il SQL; includere nel commit gli snapshot e i metadati prodotti dal generatore.
- [ ] Applicare permessi e RLS coerenti con il reale percorso di accesso server; non concedere accesso generico alle nuove tabelle ai client.
- [ ] Separare modifiche Academy da eventuale deriva preesistente dello schema.

Non eseguire ancora la migrazione sulla produzione.

### Task 2 — Logica dei corsi e delle edizioni

- [ ] Creare e modificare corsi in bozza.
- [ ] Aggiungere, modificare, riordinare ed eliminare moduli non referenziati prima del blocco.
- [ ] Validare attivazione, titoli, durate e ordinamento.
- [ ] Bloccare le modifiche didattiche dopo la prima assegnazione, anche tramite chiamata diretta.
- [ ] Implementare «Crea nuova edizione» senza trasferire progressi e assegnazioni.

### Task 3 — Docenti e assegnazioni

- [ ] Nominare docenti idonei e applicare i permessi per corso.
- [ ] Validare il destinatario dell'assegnazione sul server.
- [ ] Creare assegnazione e blocco strutturale nella stessa transazione.
- [ ] Gestire duplicati e richieste concorrenti.
- [ ] Non implementare la revoca distruttiva del piano precedente.

### Task 4 — Sessioni Academy individuali e di gruppo

- [ ] Aggiungere il tipo «Corso Academy» nel flusso di creazione esistente.
- [ ] Collegare corso, modulo, docente e partecipanti autorizzati.
- [ ] Integrare calendario, dettagli, ingresso, videoconferenza e notifiche esistenti.
- [ ] Applicare controlli per modalità individuale e gruppo.
- [ ] Proteggere le sessioni individuali dalla visibilità degli altri iscritti.
- [ ] Verificare che creazione e chiusura non producano effetti impropri su crediti, addebiti o percorsi atleta.

### Task 5 — Materiali e video

- [ ] Implementare upload privato e finalizzazione verificata.
- [ ] Aggiungere gestione admin/docente di bozza e pubblicazione.
- [ ] Implementare elenco e download per i partecipanti autorizzati.
- [ ] Verificare video di dimensioni rappresentative, riproduzione quando supportata e download.
- [ ] Gestire errori, file mancanti e upload incompleti.

### Task 6 — Completamenti e correzioni

- [ ] Implementare validazione admin con controllo corso/modulo/assegnazione.
- [ ] Ricalcolare soltanto l'assegnazione interessata.
- [ ] Preservare date e autore nei doppi invii.
- [ ] Implementare correzione motivata con storico audit.
- [ ] Adottare un protocollo comune di transazioni e lock; verificare aggiornamenti simultanei.

### Task 7 — Interfaccia admin

- [ ] Elenco corsi e creazione bozza.
- [ ] Dettaglio con programma, docenti, partecipanti, sessioni, materiali e monitoraggio.
- [ ] Modifica e riordino dei moduli finché consentito.
- [ ] Indicazione chiara del blocco e azione per creare un'edizione.
- [ ] Controlli di completamento e correzione, messaggi d'errore comprensibili e protezione dai doppi invii.

### Task 8 — Interfaccia coach

- [ ] Aggiungere Academy alla navigazione.
- [ ] Distinguere corsi frequentati e corsi tenuti.
- [ ] Mostrare programma, ore, avanzamento, sessioni personali e materiali pubblicati.
- [ ] Consentire al docente di creare/gestire le proprie sessioni e pubblicare materiali.
- [ ] Verificare accessibilità dei form, etichette, tastiera e layout mobile.

### Task 9 — Badge e decisioni di prodotto

- [ ] Definire le regole aperte della sezione 10.
- [ ] Stabilire i dati da conservare al conseguimento e le condizioni di visibilità.
- [ ] Implementare le regole approvate senza derivare la perdita del badge da una nuova edizione.
- [ ] Distinguere nell'interfaccia il corso completato dall'eventuale certificazione professionale già presente sul profilo.
- [ ] Abilitare la visualizzazione pubblica soltanto dopo i test della politica approvata.

Se le decisioni non sono disponibili, segnare questo task come in attesa e mantenere la funzione pubblica disattivata.

### Task 10 — Verifiche automatiche e funzionali

- [ ] Eseguire i test di logica pura.
- [ ] Eseguire test di integrazione su un database isolato, con migrazioni e storage di test.
- [ ] Eseguire test end-to-end con admin, docente, partecipante e coach estraneo.
- [ ] Eseguire typecheck, suite esistente e build.
- [ ] Verificare le schermate reali; usare i dati finti soltanto come supporto visivo.

### Task 11 — Rilascio controllato

- [ ] Provare la migrazione sul database isolato e verificare tabelle, vincoli, permessi e operazioni reali.
- [ ] Preparare l'ordine di rilascio: schema compatibile prima dell'attivazione delle nuove letture e scritture.
- [ ] Prevedere un interruttore di attivazione dell'Academy e uno separato per i badge; disabilitare la funzione in caso di problemi senza eliminare i dati.
- [ ] Presentare il SQL definitivo, l'ambiente di destinazione verificato e l'esito delle prove prima della migrazione di produzione, nel rispetto delle autorizzazioni del progetto.
- [ ] Applicare la migrazione autorizzata e fare verifiche reali sul database; `tsc --noEmit` non verifica lo schema live.
- [ ] Eseguire un percorso controllato di creazione corso, assegnazione, sessione, materiale e completamento.
- [ ] Riportare distintamente ciò che è implementato, ciò che è stato testato e ciò che resta in attesa delle decisioni sui badge.

## 12. Criteri di accettazione

Il nucleo Academy è pronto quando tutte queste prove riescono:

1. L'admin crea una bozza, corregge un titolo, modifica ore e ordine dei moduli.
2. La prima assegnazione blocca il programma; una modifica concorrente non aggira il blocco.
3. Un corso vuoto non può essere attivato o assegnato.
4. L'assegnazione a un atleta, un account non idoneo o un identificativo inesistente viene rifiutata sul server.
5. Il docente nominato crea sia una sessione individuale sia una di gruppo; un altro coach non può farlo per quel corso.
6. Un modulo di un altro corso o un partecipante non assegnato vengono rifiutati anche manipolando la richiesta.
7. I partecipanti autorizzati entrano effettivamente nella sessione di gruppo e nella propria sessione individuale.
8. Un partecipante non può vedere o aprire la sessione individuale di un altro coach.
9. Materiali pubblicati e video si scaricano; materiali in bozza e file di corsi altrui non sono accessibili.
10. Chiudere una sessione non completa automaticamente il modulo.
11. Completare un modulo aggiorna solo il coach interessato e non riscrive le date degli altri.
12. Due completamenti simultanei dell'ultimo gruppo di moduli producono uno stato finale corretto.
13. Ripetere lo stesso completamento non cambia data e autore e non duplica i dati.
14. La correzione motivata ripristina l'avanzamento corretto e conserva l'audit.
15. Una nuova edizione non modifica assegnazioni, date o completamenti dell'edizione precedente.
16. Le sessioni ordinarie coach-atleta continuano a funzionare, compresi i flussi economici già previsti.
17. Migrazioni, permessi e operazioni sono verificati su un database isolato, non soltanto con la compilazione.

Il rilascio dei badge pubblici e delle revoche richiede inoltre decisioni esplicite e test dedicati per tutti i casi della sezione 10.
