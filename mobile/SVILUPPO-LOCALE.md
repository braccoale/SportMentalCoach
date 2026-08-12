# Sviluppo mobile in locale

Ciclo di lavoro quotidiano. Le modifiche JavaScript si vedono
sull'emulatore in un paio di secondi, senza build ne' deploy.

## Una volta per sessione di lavoro

1. Avvia l'emulatore (Android Studio, oppure):
   %LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -avd Pixel_7

2. Avvia Metro dalla cartella mobile/:
   npx expo start --dev-client

3. Collega l'emulatore a Metro (una volta per avvio dell'emulatore):
   %LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe reverse tcp:8081 tcp:8081

4. Apri l'app: si aggancia da sola. Se resta sul menu di sviluppo:
   adb shell am start -a android.intent.action.VIEW -d "kaipai://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"

Da qui in avanti: salvi un file, l'app si aggiorna.

## Ricompilare il nativo (raro)

Serve solo dopo aver aggiunto un modulo nativo o cambiato permessi,
plugin o configurazione in app.json.

  cd mobile
  npx expo prebuild --platform android --clean
  cd android
  ./gradlew assembleDebug --project-cache-dir=C:/tmp/gcache

Poi:
  adb install -r app/build/outputs/apk/debug/app-debug.apk

### Due condizioni obbligatorie su questa macchina

JAVA_HOME deve puntare al Java di Android Studio (21), non a quello
del PATH, che e' la 8 e non compila:

  export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
  export ANDROID_HOME="/c/Users/bracc/AppData/Local/Android/Sdk"

Il `--project-cache-dir` fuori dal progetto e' obbligatorio: dentro
`mobile/android/.gradle` Windows non riesce a spostare i file e la
build fallisce con «Could not move temporary workspace». E' il motivo
per cui la compilazione locale sembrava impossibile.

## Quando usare EAS

Solo per l'APK firmato da consegnare. Non per vedere se una schermata
e' giusta.

  eas build --platform android --profile preview
