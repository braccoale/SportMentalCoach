# call-foreground

Il foreground service che tiene viva la fotocamera durante una sessione, su
Android.

## Perche' esiste

Da Android 9 la fotocamera e' negata alle app che non sono in primo piano. Da
Android 14 l'unica eccezione e' un foreground service che dichiara il tipo
`camera` e chiede il permesso corrispondente: e' quello che fa Google Meet, ed
e' la ragione della notifica persistente che si vede durante una sua chiamata.

Senza questo modulo l'app puo' solo spegnere la telecamera quando esce di
scena, che e' quello che ha sempre fatto.

## Perche' e' nostro invece che un pacchetto

I pacchetti disponibili per questo compito o non dichiarano il tipo `camera`,
o non dicono quali versioni di Expo supportano. Questo modulo ha una sola
responsabilita', sessanta righe di Kotlin e nessuna dipendenza oltre
`androidx.core`: sul percorso piu' critico del prodotto vale piu' di una
dipendenza non documentata.

## Uso

```ts
import { callForeground } from '../../modules/call-foreground';

if (callForeground.isAvailable) {
  await callForeground.start('Sessione in corso', 'La videochiamata continua.');
  // ...
  await callForeground.stop();
}
```

`isAvailable` e' falso su iOS e su qualunque build in cui il modulo non e'
stato compilato: e' la stessa condizione che `background-camera.ts` usa per
decidere se la fotocamera puo' restare accesa. Non va mai dato per vero.

## Verifica

Richiede una build nativa (`npx expo prebuild` + `eas build`, oppure
`npx expo run:android`): non viaggia con un aggiornamento OTA. Va provato su un
telefono Android vero — che la notifica compaia, che uscendo dall'app l'altra
persona continui a vedere il video, e che chiudendo la chiamata la notifica
sparisca.
