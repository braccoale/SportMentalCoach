-- I numeri pubblici della landing, presi dal sistema e non scritti a mano.
--
-- Una vista invece di quattro query sparse nel componente: la definizione di
-- "coach iscritto" o di "ora di coaching" e' una regola di prodotto, non un
-- dettaglio della home. Se domani cambia (per esempio: contiamo anche i coach
-- in attesa di approvazione), cambia qui e vale ovunque.
--
-- La vista espone SOLO aggregati: nessuna riga, nessun nome, nessun dato
-- personale. Per questo resta una vista "security definer" (default Postgres)
-- e viene concessa in lettura anche ad `anon`: la home e' pubblica e deve
-- poter contare senza che le RLS delle tabelle sottostanti la azzerino.
CREATE OR REPLACE VIEW "landing_stats" AS
WITH "coach_count" AS (
  -- Coach: solo profili approvati (quelli davvero visibili nel marketplace)
  -- e con l'account ancora attivo.
  SELECT count(*)::integer AS "n"
  FROM "provider_profiles" "pp"
  JOIN "users" "u" ON "u"."id" = "pp"."user_id"
  WHERE "pp"."status" = 'approved'
    AND "u"."deleted_at" IS NULL
),
"athlete_count" AS (
  -- Atleti: un profilo cliente per utente, account non cancellato.
  SELECT count(*)::integer AS "n"
  FROM "client_profiles" "cp"
  JOIN "users" "u" ON "u"."id" = "cp"."user_id"
  WHERE "u"."deleted_at" IS NULL
),
"session_totals" AS (
  -- Sessioni svolte = prenotazioni completate.
  --
  -- I minuti si prendono dalla fonte piu' attendibile disponibile, in ordine:
  -- 1) la durata reale della videochiamata (heartbeat del client);
  -- 2) la durata concordata per quella sessione;
  -- 3) la durata prevista dal servizio.
  -- Il cap a 8 ore evita che un heartbeat rimasto appeso gonfi il totale
  -- pubblico; il floor a 0 protegge da timestamp incoerenti.
  SELECT
    count(*)::integer AS "n",
    COALESCE(SUM(
      LEAST(
        480::numeric,
        GREATEST(
          0::numeric,
          COALESCE(
            EXTRACT(EPOCH FROM ("b"."session_ended_at" - "b"."session_started_at")) / 60.0,
            "b"."duration_min"::numeric,
            "s"."duration_min"::numeric,
            0::numeric
          )
        )
      )
    ), 0) AS "minutes"
  FROM "bookings" "b"
  LEFT JOIN "services" "s" ON "s"."id" = "b"."service_id"
  WHERE "b"."status" = 'completed'
)
SELECT
  "coach_count"."n" AS "coaches",
  "athlete_count"."n" AS "athletes",
  "session_totals"."n" AS "sessions",
  FLOOR("session_totals"."minutes" / 60.0)::integer AS "coaching_hours"
FROM "coach_count", "athlete_count", "session_totals";--> statement-breakpoint

COMMENT ON VIEW "landing_stats" IS
  'Aggregati pubblici per la landing: coach approvati, atleti, sessioni completate e ore di coaching. Solo totali, nessun dato personale.';--> statement-breakpoint

GRANT SELECT ON "landing_stats" TO "anon", "authenticated";
