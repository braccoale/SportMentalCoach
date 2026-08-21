-- Gli account sintetici della demo devono restare separati dai numeri e dai
-- selettori del prodotto reale. Il flag applicativo evita di dover interrogare
-- lo schema Auth da ogni query di business.
ALTER TABLE "users"
ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint

COMMENT ON COLUMN "users"."is_demo" IS
  'Account sintetico KaiPai: escluso da statistiche pubbliche, marketplace e selettori.';--> statement-breakpoint

-- Backfill autorevole dagli app_metadata Auth già assegnati dal seed demo.
UPDATE "users" "u"
SET "is_demo" = true
FROM "auth"."users" "au"
WHERE "au"."id" = "u"."auth_id"
  AND COALESCE(("au"."raw_app_meta_data" ->> 'kaipai_demo')::boolean, false);--> statement-breakpoint

CREATE OR REPLACE VIEW "landing_stats" AS
WITH "coach_count" AS (
  SELECT count(*)::integer AS "n"
  FROM "provider_profiles" "pp"
  JOIN "users" "u" ON "u"."id" = "pp"."user_id"
  WHERE "pp"."status" = 'approved'
    AND "u"."deleted_at" IS NULL
    AND "u"."is_demo" = false
),
"athlete_count" AS (
  SELECT count(*)::integer AS "n"
  FROM "client_profiles" "cp"
  JOIN "users" "u" ON "u"."id" = "cp"."user_id"
  WHERE "u"."deleted_at" IS NULL
    AND "u"."is_demo" = false
),
"session_totals" AS (
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
  JOIN "users" "athlete" ON "athlete"."id" = "b"."client_id"
  JOIN "provider_profiles" "pp" ON "pp"."id" = "b"."provider_id"
  JOIN "users" "coach" ON "coach"."id" = "pp"."user_id"
  LEFT JOIN "services" "s" ON "s"."id" = "b"."service_id"
  WHERE "b"."status" = 'completed'
    AND "athlete"."is_demo" = false
    AND "coach"."is_demo" = false
)
SELECT
  "coach_count"."n" AS "coaches",
  "athlete_count"."n" AS "athletes",
  "session_totals"."n" AS "sessions",
  FLOOR("session_totals"."minutes" / 60.0)::integer AS "coaching_hours"
FROM "coach_count", "athlete_count", "session_totals";--> statement-breakpoint

COMMENT ON VIEW "landing_stats" IS
  'Aggregati pubblici per la landing, esclusi account e contenuti demo. Solo totali, nessun dato personale.';--> statement-breakpoint

GRANT SELECT ON "landing_stats" TO "anon", "authenticated";
