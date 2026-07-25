UPDATE "sports"
SET "sort_order" = "sort_order" + 1,
    "updated_at" = now()
WHERE "sort_order" >= 13;--> statement-breakpoint

INSERT INTO "sports" ("key", "label", "active", "sort_order")
VALUES ('curling', 'Curling', true, 13)
ON CONFLICT ("key") DO UPDATE
SET "label" = excluded."label",
    "active" = true,
    "sort_order" = excluded."sort_order",
    "updated_at" = now();
