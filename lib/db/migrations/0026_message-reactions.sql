CREATE TABLE "message_reactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "message_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "emoji" varchar(16) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_by" integer,
  "updated_by" integer,
  CONSTRAINT "message_reactions_message_user_unique"
    UNIQUE("message_id", "user_id")
);--> statement-breakpoint

ALTER TABLE "message_reactions"
ADD CONSTRAINT "message_reactions_message_id_messages_id_fk"
FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id")
ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "message_reactions"
ADD CONSTRAINT "message_reactions_user_id_users_id_fk"
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "message_reactions_message_id_idx"
ON "message_reactions" USING btree ("message_id");
