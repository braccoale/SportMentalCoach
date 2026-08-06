# Videochiamata su telefono

Come si comporta la stanza video quando è aperta da un telefono, e perché.
Riguarda sia la stanza autenticata (`/dashboard/video/[bookingId]`) sia quella
ospite (`/video/join`): condividono lo stesso motore.

## Il problema di fondo

Un browser mobile non è un browser desktop più piccolo: sospende la cattura
video appena la pagina esce di scena, spegne lo schermo da solo dopo un minuto
di inattività, e quando l'utente arriva dal link di un'app social non è nemmeno
il browser di sistema a eseguire la pagina. Nessuno di questi comportamenti è
aggirabile — sono scelte di privacy e di batteria dei sistemi operativi. Quello
che si può fare è prevenirli dove il sistema lo consente, dichiararli quando
accadono e non lasciare mai l'utente davanti a un'immagine ferma senza
spiegazione.

## Cosa cambia rispetto al desktop

| Aspetto | Desktop | Telefono |
|---|---|---|
| Cattura video | 720p, 2 livelli simulcast | 360p, 1 livello simulcast |
| Comandi in barra | schermo intero, PiP | uscita esplicita, inverti fotocamera, PiP |
| Pre-join | layout a colonne con anteprima | anteprima a pieno schermo |
| Istruzione schermo/app | assente | mostrata prima di entrare e all'ingresso |

Il rilevamento è di **layout e capability**, non di sistema operativo:
`COMPACT_MEDIA_QUERY` (`max-width: 767px` oppure `pointer: coarse`) in
[`lib/core/video/capabilities.ts`](../lib/core/video/capabilities.ts). Un tablet
con touch riceve lo stesso trattamento di un telefono, che è quello che serve.

## Risoluzione e banda

[`videoPublishSettings(compact)`](../lib/core/video/call-settings.ts) decide
cosa catturare e cosa pubblicare. Su compatto si scende a 360p e a un solo
livello simulcast: la finestra in cui l'altra persona appare su un telefono è
alta poche centinaia di pixel, e codificare più flussi scalda il dispositivo —
un telefono caldo abbassa da solo il framerate, e l'utente vede scatti senza
capirne il motivo.

La scelta è fatta **alla creazione della `Room`**, leggendo `readIsCompact()`
fuori da React: la configurazione di una stanza non è modificabile dopo, e
attendere il primo effetto significherebbe ricrearla a chiamata avviata.

## Ciclo di vita della pagina

Gestito in
[`useLiveKitRoomResilience`](../components/livekit-room-resilience.tsx):

| Evento | Cosa succede |
|---|---|
| `visibilitychange` → nascosta | la camera va in muto (l'altro vede il segnaposto, non un fotogramma congelato) |
| `pagehide` | idem — su Safari è questo, non `visibilitychange`, a segnalare il blocco schermo |
| `visibilitychange` → visibile | controllo e ripristino delle tracce locali |
| `pageshow` | idem, per il ritorno dal bfcache di iOS |
| `offline` | avviso "Sei offline" |
| `online` | ripristino tracce, l'avviso sparisce |
| `Reconnecting` / `Reconnected` | banner di riconnessione, poi ripristino tracce |

Il ripristino non riaccende mai un dispositivo che l'utente ha spento a mano:
le preferenze sono seguite tramite `TrackMuted`/`TrackUnmuted`.

## Quando il ripristino non basta

`restoreLocalMediaIfNeeded` può fallire in silenzio — permesso revocato,
telecamera occupata da un'altra app. Per questo l'esito si misura sullo stato
reale (`isCameraLive`) e non sul tentativo: se la camera doveva essere accesa e
non lo è, compare **"Riattiva videocamera"** con il pulsante che riprova.
È l'unico stato in cui l'utente deve fare qualcosa.

## Schermo bloccato e cambio applicazione

Due rimedi che convivono perché coprono casi diversi:

- [`useWakeLock`](../lib/hooks/use-wake-lock.ts) chiede al sistema di non
  spegnere lo schermo. Va riagganciato a ogni rientro: il browser rilascia il
  lock ogni volta che la pagina passa in secondo piano. Dove l'API non esiste
  (Safari iOS < 16.4) non fa nulla.
- L'istruzione testuale — "non bloccare lo schermo e non cambiare
  applicazione" — sopra il pulsante d'ingresso nel pre-join compatto, e per
  pochi secondi all'ingresso in stanza. Nessuna API può impedire il cambio di
  applicazione: lì l'unico strumento è dirlo prima.

## Browser interni delle app social

Aprire un link da Instagram o Facebook non apre Safari o Chrome: apre un
WebView dell'app, che su iOS non ha accesso a camera e microfono.
`detectInAppBrowser(userAgent)` li riconosce e
[`InAppBrowserNotice`](../components/in-app-browser-notice.tsx) lo spiega nel
pre-join.

Su iOS l'avviso è rosso e non si chiude — proseguire non porta da nessuna
parte. Su Android è giallo e ignorabile: lì quei WebView a volte funzionano, e
sbarrare la strada a chi sarebbe potuto entrare è un danno peggiore di un
avviso ignorato. È l'unico punto, con `detectIosSafari`, in cui lo user-agent è
ammesso: nessuna feature detection distingue un WebView prima di aver già
chiesto camera e microfono, cioè troppo tardi per avvisare.

## Test

- Unitari (`npm test`): scelta dei comandi per capability, preset video,
  riconoscimento dei browser interni, ripristino e pausa delle tracce.
- Su device emulati (`npm run e2e:mobile`): stesso copione su WebKit
  (iPhone 13) e Chromium (Pixel 7) — pre-join compatto senza scorrimento
  orizzontale, istruzione visibile, avviso del browser interno con la gravità
  giusta per piattaforma, e su Chromium il ciclo `pagehide`/`pageshow` in
  stanza.

`npm run e2e:mobile` registra un coach e un atleta nuovi a ogni esecuzione.
Con `E2E_COACH_EMAIL` e `E2E_COACH_PASSWORD` riusa un account esistente e non
crea nulla — obbligatorio quando il database di sviluppo è quello di
produzione.
