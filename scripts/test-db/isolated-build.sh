#!/usr/bin/env bash
# Esegue `next build` con un ambiente isolato dalla produzione, in modo che
# `.env` e `.env.local` — che contengono l'URL Postgres della produzione,
# secondo CLAUDE.md — non possano essere letti da Next per nessuna via.
#
# Il metodo e' lo spostamento fisico dei due file fuori dalla cartella durante
# la build, non un tentativo di "vincere" la precedenza delle variabili
# d'ambiente: se un domani un file `.env.production` comparisse, o Next
# cambiasse le sue regole di precedenza, un trucco basato sulle variabili
# smetterebbe di proteggere senza dirlo. Un file che non esiste non puo'
# essere letto, in nessuna versione di Next.
#
# I file originali vengono sempre ripristinati, anche se la build fallisce:
# il trap EXIT gira in ogni caso, e lo script verifica con uno hash che il
# contenuto sia tornato esattamente identico.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

ENV_BAK="$(mktemp -d)"
RESTORE_DONE=0

restore() {
  if [ "$RESTORE_DONE" = "1" ]; then return; fi
  RESTORE_DONE=1
  if [ -f "$ENV_BAK/env" ]; then mv -f "$ENV_BAK/env" .env; fi
  if [ -f "$ENV_BAK/env.local" ]; then mv -f "$ENV_BAK/env.local" .env.local; fi
  rm -rf "$ENV_BAK"
}
trap restore EXIT

HASH_ENV_BEFORE=""
HASH_ENV_LOCAL_BEFORE=""
[ -f .env ] && HASH_ENV_BEFORE="$(sha256sum .env | cut -d' ' -f1)"
[ -f .env.local ] && HASH_ENV_LOCAL_BEFORE="$(sha256sum .env.local | cut -d' ' -f1)"

# Spostati, non copiati: durante la build questi due file non esistono più
# nella cartella, in nessuna forma.
[ -f .env ] && mv .env "$ENV_BAK/env"
[ -f .env.local ] && mv .env.local "$ENV_BAK/env.local"

if [ -z "${TEST_DATABASE_URL:-}" ]; then
  if [ -f .env.test.local ]; then
    TEST_DATABASE_URL="$(grep -E '^TEST_DATABASE_URL=' .env.test.local | head -1 | cut -d= -f2-)"
  fi
fi
if [ -z "${TEST_DATABASE_URL:-}" ]; then
  echo "TEST_DATABASE_URL non configurata (né nell'ambiente né in .env.test.local)." >&2
  exit 1
fi

echo "Build isolata: POSTGRES_URL punta a ${TEST_DATABASE_URL%%@*}@<host-di-prova>"

# `set -e` va sospeso per la build: un fallimento non deve saltare il
# ripristino di sotto (il trap lo farebbe comunque, ma così restano anche
# la verifica finale degli hash e il codice di uscita corretto).
set +e

# Ogni valore qui e' finto per costruzione: nessuno punta a un progetto
# Supabase reale, a un progetto LiveKit reale o a una chiave Resend reale.
# Se qualcosa durante la build provasse davvero a contattarli, l'host o la
# chiave inesistenti fanno fallire quella chiamata invece di raggiungere un
# servizio vero.
env \
  NODE_ENV=production \
  POSTGRES_URL="$TEST_DATABASE_URL" \
  NEXT_PUBLIC_SUPABASE_URL="https://build-isolato.invalid.test" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="build-isolato-anon-key" \
  SUPABASE_SERVICE_ROLE_KEY="build-isolato-service-role-key" \
  AUTH_SECRET="build-isolato-auth-secret-0000000000000000000000000000" \
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="build-isolato-actions-key-000000000000000000000" \
  BASE_URL="http://localhost:3000" \
  NEXT_PUBLIC_LIVEKIT_URL="wss://build-isolato.invalid.test" \
  LIVEKIT_API_KEY="build-isolato-livekit-key" \
  LIVEKIT_API_SECRET="build-isolato-livekit-secret" \
  RESEND_API_KEY="build-isolato-resend-key" \
  RESEND_FROM_EMAIL="build-isolato@invalid.test" \
  EMAIL_NOTIFICATIONS_ENABLED="false" \
  NEXT_PUBLIC_VAPID_PUBLIC_KEY="build-isolato-vapid-public" \
  VAPID_PRIVATE_KEY="build-isolato-vapid-private" \
  VAPID_SUBJECT="mailto:build-isolato@invalid.test" \
  OPENAI_API_KEY="build-isolato-openai-key" \
  DEEPGRAM_API_KEY="build-isolato-deepgram-key" \
  npx next build 2>&1
BUILD_STATUS=$?
set -e

restore
trap - EXIT

HASH_ENV_AFTER=""
HASH_ENV_LOCAL_AFTER=""
[ -f .env ] && HASH_ENV_AFTER="$(sha256sum .env | cut -d' ' -f1)"
[ -f .env.local ] && HASH_ENV_LOCAL_AFTER="$(sha256sum .env.local | cut -d' ' -f1)"

echo ""
echo "Verifica ripristino:"
if [ "$HASH_ENV_BEFORE" = "$HASH_ENV_AFTER" ]; then
  echo "  .env       identico (hash invariato)"
else
  echo "  .env       ATTENZIONE: hash diverso da prima (before=$HASH_ENV_BEFORE after=$HASH_ENV_AFTER)"
fi
if [ "$HASH_ENV_LOCAL_BEFORE" = "$HASH_ENV_LOCAL_AFTER" ]; then
  echo "  .env.local identico (hash invariato)"
else
  echo "  .env.local ATTENZIONE: hash diverso da prima (before=$HASH_ENV_LOCAL_BEFORE after=$HASH_ENV_LOCAL_AFTER)"
fi

exit "$BUILD_STATUS"
