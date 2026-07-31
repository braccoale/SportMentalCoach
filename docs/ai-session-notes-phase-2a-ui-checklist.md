# Checklist UI manuale — AI Session Notes Fase 2A

Stato: **non eseguita**. Questa checklist va svolta in un browser normale
contro un ambiente di test isolato, dopo aver configurato storage e webhook.
Usare esclusivamente utenti e audio sintetici.

## Preparazione

- [ ] Confermare piano LiveKit, minuti disponibili e limite di 2 Egress concorrenti.
- [ ] Configurare un bucket audio di test dedicato e privato.
- [ ] Configurare il webhook globale su `/api/livekit/webhook`.
- [ ] Creare booking di test con coach e atleta sintetici, entrambi entitled.
- [ ] Confermare che non esistano guest o appuntamenti reali nella room.

## Flusso principale

- [ ] Il coach vede “Attiva appunti AI”.
- [ ] L’atleta non può avviare direttamente la funzione.
- [ ] Il coach avvia e entrambi vedono la richiesta di consenso.
- [ ] Dopo un solo consenso la registrazione non parte.
- [ ] Dopo il secondo consenso compare “Avvio registrazione audio…”.
- [ ] Quando entrambi gli Egress sono attivi compare “Registrazione audio attiva”.
- [ ] L’interfaccia indica esplicitamente “coach e atleta”.
- [ ] Un refresh conserva stato, ruoli e possibilità di revoca.

## Guest e autorizzazioni

- [ ] Un link guest aperto durante la richiesta/sessione AI viene bloccato.
- [ ] Un guest già nella room causa `UNVERIFIED_PARTICIPANT_PRESENT`.
- [ ] Un outsider non può leggere né mutare la sessione via ID.
- [ ] Una richiesta start con `roomName`, `trackSid`, `userId`, bucket o key riceve 400.

## Mute, device e riconnessione

- [ ] Il mute senza unpublish non crea un secondo file.
- [ ] Il cambio microfono/unpublish porta la traccia precedente a stopping/recorded.
- [ ] La nuova pubblicazione crea una nuova riga/file senza duplicare il vecchio Track SID.
- [ ] La reconnessione definitiva crea una nuova correlazione mantenendo lo storico.

## Stop ed errori

- [ ] La revoca mostra subito “Arresto registrazione audio…” senza attendere polling.
- [ ] La revoca ripetuta non causa errori o nuovi Egress.
- [ ] Completare/cancellare l’appuntamento richiede lo stop.
- [ ] La chiusura della room richiede lo stop di entrambe le tracce.
- [ ] Un errore Egress simulato mostra “Errore registrazione audio”.
- [ ] Se una traccia riesce e una fallisce, lo stato aggregato resta “Errore”.
- [ ] Nessun elemento UI contiene URL, object key, Track SID o Egress ID.

## Verifica storage finale

- [ ] Esistono due file Ogg separati per una chiamata senza ripubblicazioni.
- [ ] Il bucket risulta privato e non genera URL pubblico.
- [ ] Una richiesta browser anon/authenticated non può elencare o scaricare.
- [ ] Il job retention dry-run individua solo record sintetici scaduti.
- [ ] Con approvazione, `--apply` elimina e verifica soltanto i file sintetici.

