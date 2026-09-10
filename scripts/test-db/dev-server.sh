#!/usr/bin/env bash
# Avvia `next dev` puntato sul Supabase locale e sul LiveKit locale di questo
# collaudo — mai su `.env`/`.env.local`, che restano quelli di sempre e non
# vengono né letti né spostati.
#
# **Modalità di caricamento configurazione esplicita.** Ogni variabile che il
# server usa arriva da questo script tramite `env`, non da un file. Next
# (come dotenv) non sovrascrive una variabile già presente in `process.env`
# quando avvia: con tutte le variabili già impostate qui, `.env.local` non ha
# più niente da aggiungere — e infatti non viene mai aperto per scriverci
# sopra o spostato. La prova che questo tiene è nel rapporto di collaudo: gli
# hash di `.env` e `.env.local` restano quelli di sempre per l'intera sessione.
#
# **Non registra il PID per terminarlo per nome.** Lo stampa, e basta:
# `kill <pid>` a fine sessione termina *questo* processo, non "tutti i node".
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

LOCAL_SUPABASE_DIR="scripts/test-db/local-supabase"
STATUS_JSON="$(cd "$LOCAL_SUPABASE_DIR" && npx supabase status -o json 2>/dev/null)"

if [ -z "$STATUS_JSON" ]; then
  echo "Supabase locale non risulta avviato. Esegui prima:" >&2
  echo "  (cd $LOCAL_SUPABASE_DIR && npx supabase start)" >&2
  exit 1
fi

API_URL="$(echo "$STATUS_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).API_URL)')"
DB_URL="$(echo "$STATUS_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).DB_URL)')"
ANON_KEY="$(echo "$STATUS_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).ANON_KEY)')"
SERVICE_ROLE_KEY="$(echo "$STATUS_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).SERVICE_ROLE_KEY)')"

if [ -z "$API_URL" ] || [ -z "$DB_URL" ]; then
  echo "Impossibile leggere API_URL/DB_URL da 'supabase status'." >&2
  exit 1
fi

echo "Supabase locale: $API_URL"
echo "Database:        ${DB_URL%%@*}@127.0.0.1:54322/postgres"
echo "LiveKit locale:  ws://127.0.0.1:7880 (devkey/secret)"
echo ""
echo "Nessun file .env / .env.local viene letto o toccato da questo avvio."
echo ""

env \
  NODE_ENV=development \
  POSTGRES_URL="$DB_URL" \
  NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  AUTH_SECRET="collaudo-locale-auth-secret-0000000000000000000000" \
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="collaudo-locale-actions-key-00000000000000000" \
  BASE_URL="http://127.0.0.1:3000" \
  NEXT_PUBLIC_LIVEKIT_URL="ws://127.0.0.1:7880" \
  LIVEKIT_API_KEY="devkey" \
  LIVEKIT_API_SECRET="secret" \
  RESEND_API_KEY="collaudo-locale-resend-key" \
  RESEND_FROM_EMAIL="collaudo@invalid.test" \
  EMAIL_NOTIFICATIONS_ENABLED="false" \
  NEXT_PUBLIC_VAPID_PUBLIC_KEY="collaudo-locale-vapid-public" \
  VAPID_PRIVATE_KEY="collaudo-locale-vapid-private" \
  VAPID_SUBJECT="mailto:collaudo@invalid.test" \
  OPENAI_API_KEY="collaudo-locale-openai-key" \
  DEEPGRAM_API_KEY="collaudo-locale-deepgram-key" \
  npx next dev &

SERVER_PID=$!
echo "$SERVER_PID" > /tmp/kaipai-dev-server.pid
echo ""
echo "Server avviato, PID $SERVER_PID (scritto anche in /tmp/kaipai-dev-server.pid)."
echo "Per fermarlo: kill \$(cat /tmp/kaipai-dev-server.pid)"
echo ""

wait "$SERVER_PID"
