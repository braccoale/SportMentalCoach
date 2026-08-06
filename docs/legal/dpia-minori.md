# Valutazione d'impatto (DPIA) — trattamento di dati di atleti minorenni

**Bozza** redatta a partire dal codice e dallo schema. Va completata e validata
da un legale: una DPIA è un atto del titolare, non un documento tecnico.

**Ultimo aggiornamento:** 6 agosto 2026

---

## 1. Perché serve

L'art. 35 GDPR impone la valutazione quando il trattamento può presentare un
rischio elevato. L'elenco del Garante italiano dei trattamenti che richiedono
DPIA include i **trattamenti non occasionali di dati relativi a soggetti
vulnerabili**, categoria in cui rientrano espressamente i minori.

KaiPai tratta in modo strutturale dati di atleti fra i 15 e i 17 anni, e li fa
partecipare a videochiamate individuali con adulti. La DPIA è quindi da
considerarsi necessaria salvo diverso parere legale.

## 2. Descrizione del trattamento

Un atleta di 15-17 anni si registra autonomamente, indica la data di nascita e
può consultare la piattaforma. **Non può richiedere né ricevere sessioni**
finché chi esercita la responsabilità genitoriale non autorizza il percorso da
un link opaco, monouso e con scadenza di 72 ore ricevuto per email. Il tutore
firma digitando il nome, dichiara il titolo in base al quale agisce e riceve
copia del testo versionato e hashato. Autorizzato il percorso, l'atleta può
richiedere sessioni, che si svolgono in videochiamata individuale con un coach
approvato, con una chat testuale collegata.

**Dati trattati:** identificativi dell'atleta, data di nascita, sport, livello,
obiettivi dichiarati, messaggi di chat, orari di svolgimento delle sessioni;
nome, email e rapporto dichiarato del tutore, con IP e data/ora della conferma.

**Necessità e proporzionalità.** La data di nascita è l'unico dato aggiuntivo
richiesto ed è indispensabile: senza non si applicano né l'età minima né la
tutela. L'autorizzazione raccoglie il minimo utile a identificare il tutore e a
provare l'accettazione. Non si raccolgono ordinariamente documenti d'identità:
la verifica documentale resta una misura manuale per casi dubbi, tutela legale
o responsabilità esclusiva. SPID/CIE o firma qualificata aumenterebbero la
certezza dell'identità ma richiedono un prestatore fiduciario e un distinto
progetto di integrazione.

## 3. Rischi individuati e misure

### R1 — Un minore aggira l'autorizzazione indicando un'email che controlla lui
**Probabilità:** media. **Impatto:** alto — percorso avviato senza che la
famiglia lo sappia.
**Misure attuali:** email diversa da quella dell'atleta; link monouso di 72 ore
con token conservato solo come hash; firma digitata corrispondente al nominativo
dell'invito; dichiarazioni di maggiore età, responsabilità e titolo; testo
versionato/hashato e ricevuta completa; facoltà di richiedere documentazione.
**Rischio residuo:** medio. Non è tecnicamente eliminabile senza verifica
d'identità.
**Misura ulteriore da valutare:** richiesta di documento in caso di segnalazione
o di dichiarazione di esercizio esclusivo.

### R2 — Contenuti di natura clinica conferiti nei campi liberi
**Probabilità:** media — un adolescente che parla di ansia da prestazione può
scivolare su temi di salute. **Impatto:** alto: sarebbe un dato dell'art. 9
trattato senza base giuridica adeguata.
**Misure attuali:** dichiarazione esplicita nella Privacy che non chiediamo né
vogliamo dati sulla salute; divieto nei Termini di inserirli nei campi liberi;
obbligo per il coach di interrompere e indirizzare a un professionista
sanitario coinvolgendo la famiglia.
**Rischio residuo:** medio. **È il rischio principale di questo trattamento.**
**Misure ulteriori da valutare:** avviso contestuale accanto ai campi liberi;
formazione obbligatoria dei coach su come reindirizzare.

### R3 — Videochiamata individuale fra un adulto e un minore
**Probabilità:** bassa. **Impatto:** molto alto.
**Misure attuali:** coach approvati singolarmente; badge «Minorenne» visibile
al coach prima di accettare; finestra di accesso limitata all'appuntamento;
video mai registrato; audio soltanto con la catena di consensi Appunti AI;
revoca del tutore che chiude la stanza LiveKit; obbligo di svolgere la sessione in un luogo riservato;
obblighi di riservatezza e cautela nei Termini.
**Rischio residuo:** medio.
**Misure ulteriori da valutare:** richiesta del **certificato penale del
casellario giudiziale ex art. 25-bis DPR 313/2002** per chi ha contatti
regolari con minori; nomina di un responsabile safeguarding secondo il D.Lgs.
39/2021; canale di segnalazione dedicato.

### R4 — Accesso non autorizzato ai messaggi
**Probabilità:** bassa. **Impatto:** alto.
**Misure attuali:** accesso limitato ai due partecipanti verificato lato
server; HTTPS; cifratura a riposo; nessuna diffusione.
**Rischio residuo:** basso.

### R5 — Genitori separati: uno autorizza senza l'accordo dell'altro
**Probabilità:** media. **Impatto:** medio.
**Misure attuali:** scelta esplicita fra accordo con l'altro genitore,
responsabilità esclusiva o tutela legale; coerenza tecnica fra rapporto e
titolo; facoltà di richiedere documentazione; prova delle dichiarazioni.
**Rischio residuo:** medio.

### R6 — Conservazione oltre il necessario
**Probabilità:** bassa dopo le ultime modifiche. **Impatto:** medio.
**Misure attuali:** account cessato dopo 24 mesi di inattività; conservazione
36 mesi; log di navigazione max 12 mesi.
**Rischio residuo:** basso.
**Nota:** i termini sono dichiarati ma **non ancora applicati da una procedura
automatica di cancellazione**. Finché non esiste, il rischio resta.

### R7 — Furto o inoltro dei link del tutore
**Probabilità:** bassa. **Impatto:** alto per l'autorizzazione, medio per la
revoca. **Misure attuali:** token casuale a 256 bit, solo hash nel database,
invito monouso di 72 ore, invalidazione degli inviti precedenti, firma digitata,
nessuna indicizzazione e revoca limitata a un esito fail-safe. **Rischio
residuo:** basso/medio; un accesso compromesso alla casella email resta fuori
dal controllo diretto della piattaforma.

## 4. Diritti dell'interessato minorenne

Sopra i 14 anni il minore esercita da sé i diritti sui propri dati (soglia
italiana per il consenso digitale). Il tutore resta referente per il rapporto
contrattuale e può agire in sua vece. Le richieste si esercitano via email, con
risposta entro un mese; non esiste export self-service.

## 5. Conclusione provvisoria

Il livello di rischio residuo complessivo è **medio**, concentrato su R2 e R3.
Non emergono elementi che impongano la consultazione preventiva del Garante ex
art. 36, ma la conclusione va confermata dal legale.

**Azioni prioritarie:** validazione formale della DPIA da parte del titolare e
del legale; avviso contestuale sui campi liberi (R2); decisione su casellario e
safeguarding dei coach (R3); procedura automatica di cancellazione a scadenza
(R6); valutazione SPID/CIE al crescere del volume (R1).
