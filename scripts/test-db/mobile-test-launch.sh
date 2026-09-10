#!/usr/bin/env bash
# Avvia Metro per l'app mobile in modalità di test — mai `mobile/.env` né
# `mobile/.env.development.local`, che restano quelli di sempre.
#
# Ogni variabile `EXPO_PUBLIC_*` arriva da questo script tramite `env`, non da
# un file: è la stessa "modalità di caricamento configurazione esplicita" del
# server (`dev-server.sh`). Poiché queste variabili sono lette da Metro al
# bundling, non incorporate nell'APK nativo, **non serve una nuova build**:
# la stessa shell nativa già compilata per il collaudo precedente le riceve
# alla prossima connessione a Metro.
#
# `10.0.2.2` è l'alias con cui l'emulatore Android raggiunge il computer che
# lo ospita: è l'indirizzo giusto per l'emulatore, sbagliato per un telefono
# fisico sulla stessa rete, che deve usare l'indirizzo LAN del computer.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)/mobile"

TARGET="${1:-emulator}"
if [ "$TARGET" = "emulator" ]; then
  API_HOST="10.0.2.2"
elif [ "$TARGET" = "device" ]; then
  API_HOST="$(ipconfig 2>/dev/null | grep -A0 'IPv4' | tail -1 | sed -E 's/.*: //')"
  echo "Indirizzo LAN rilevato per il dispositivo fisico: $API_HOST — verificalo." >&2
else
  echo "Uso: $0 [emulator|device]" >&2
  exit 1
fi

echo "Ambiente di test mobile: EXPO_PUBLIC_ENV=test, API su http://$API_HOST:3000"
echo "Nessun file mobile/.env* viene letto o toccato da questo avvio."
echo ""

env \
  EXPO_PUBLIC_ENV=test \
  EXPO_PUBLIC_API_BASE_URL="http://$API_HOST:3000" \
  EXPO_PUBLIC_SUPABASE_URL="$LOCAL_SUPABASE_URL" \
  EXPO_PUBLIC_SUPABASE_ANON_KEY="$LOCAL_SUPABASE_ANON_KEY" \
  npx expo start --dev-client &

METRO_PID=$!
echo "$METRO_PID" > /tmp/kaipai-metro.pid
echo "Metro avviato, PID $METRO_PID (scritto in /tmp/kaipai-metro.pid)."
echo "Per fermarlo: kill \$(cat /tmp/kaipai-metro.pid)"

wait "$METRO_PID"
