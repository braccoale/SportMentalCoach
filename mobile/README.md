# KaiPai mobile

La companion app delle sessioni. Non è la dashboard in tasca: esiste per
essere **in chiamata dal telefono** e per tenere il filo fra una seduta e la
successiva. Tutto ciò che si amministra con calma — profilo, disponibilità,
analisi, pagamenti — resta sul web, dove c'è lo spazio per farlo.

Una app sola per coach e atleta: l'interfaccia cambia dopo il login in base al
ruolo. Due app significherebbero due pubblicazioni, due collaudi e due
rilasci, senza un vantaggio che oggi si veda.

## Stato

Fatto:

- accesso con email e password, e **rientro con Face ID / impronta**;
- elenco delle prossime sessioni;
- schermata chiamata LiveKit nativa con microfono, video, **condivisione
  schermo** e uscita;
- **notifiche native**: permesso, canale `calls` a importanza massima,
  registrazione del dispositivo, e il tocco sulla notifica che porta dentro
  la stanza.

Da fare (in ordine di priorità):

1. Cambio fotocamera e scelta altoparlante/Bluetooth.
2. Chat coach ↔ atleta (il web ha già il modello dati e il realtime).
3. Task ed esercizi assegnati.
4. Segnalibro «segna questo momento» e nota vocale durante la chiamata:
   esistono già lato server, e sul telefono funzionano meglio che al computer.
5. Scheda rapida dell'atleta prima della chiamata (solo coach).
6. Report AI in sola consultazione. La **revisione** resta sul web: approvare
   un riepilogo clinico da uno schermo piccolo invita ad approvare distratti.

## Come funzionano le notifiche

Il web usa Web Push con chiavi VAPID, che un'app nativa non può ricevere:
Android passa da FCM, iOS da APNs. Il canale nativo è separato
(`lib/core/push/native.ts`, tabella `device_push_tokens`) e passa dal servizio
push di Expo, che tiene entrambe le piattaforme dietro un unico indirizzo.

I due trasporti stanno dietro la **stessa** funzione `sendPushToUser`: tutto
ciò che già avvisa qualcuno sul web raggiunge l'app senza modifiche. Chi ha
app e browser riceve da entrambi; chi ne ha uno solo non dipende dall'altro.

Il pezzo che decide se una chiamata **suona** è il canale Android `calls`,
creato dall'app con importanza massima. Un canale a importanza normale non si
sente, qualunque priorità metta il server: è il punto in cui tutta la catena
funziona e nessuno se ne accorge.

## Primo avvio

```bash
cd mobile
cp .env.example .env      # e riempi i due valori Supabase
npm install
npx expo install --fix    # allinea le versioni native a quelle di Expo
```

LiveKit ha moduli nativi, quindi **Expo Go non basta**: serve una build vera.

### Con Android Studio (emulatore)

È la via più corta se l'SDK Android è già installato: compila in locale e
installa sull'emulatore acceso, senza passare dal cloud.

```bash
npx expo run:android
```

Il primo giro genera la cartella `android/` e impiega qualche minuto; dal
secondo in poi basta `npm start`.

Tre cose che sull'emulatore vanno preparate, altrimenti sembrano difetti
dell'app:

- **Immagine con Google Play.** Le notifiche passano da FCM, che vive nei
  servizi Google: un'immagine di sistema senza Play Store **non le riceve
  mai**, in silenzio. Nel gestore dispositivi va scelta una voce con
  «Google Play» o «Google APIs».
- **Impronta registrata.** `expo-local-authentication` chiede una biometria
  già configurata. Va registrata in Impostazioni → Sicurezza usando il
  sensore simulato (Extended controls → Fingerprint → Touch sensor), che è
  anche il modo per rispondere alla richiesta di sblocco.
- **Indirizzo del server.** Dall'emulatore `localhost` è l'emulatore stesso.
  Per puntare al progetto web in esecuzione sul tuo computer serve
  `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000`; per puntare alla
  produzione va bene l'indirizzo normale.

Per provare una chiamata a due basta l'emulatore da una parte e il sito
aperto nel browser del computer dall'altra.

### APK per un dispositivo vero

```bash
npm run build:android:preview
```

Il file si scarica dal link che EAS restituisce e si installa direttamente:
per Android non serve pubblicare sullo store.

## Perché il token della stanza lo dà il server

L'app non costruisce mai il token LiveKit. Lo chiede a
`POST /api/video/[bookingId]/token`, che usa la stessa funzione della pagina
web e quindi gli stessi controlli: partecipazione, stato della prenotazione,
tutela dei minori, finestra oraria. Un client non deve poter decidere da solo
di entrare in una stanza.

L'autenticazione verso l'API viaggia con `Authorization: Bearer <token>`
invece che con i cookie: se ne occupa `lib/auth/api-user.ts` sul progetto web,
che accetta entrambi e lascia le rotte identiche per i due client.
