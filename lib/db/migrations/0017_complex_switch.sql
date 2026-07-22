CREATE TABLE "agreement_acceptances" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"agreement_key" varchar(40) NOT NULL,
	"version" varchar(32) NOT NULL,
	"document_hash" varchar(64) NOT NULL,
	"accepted_terms" boolean DEFAULT true NOT NULL,
	"accepted_vexatious" boolean DEFAULT false NOT NULL,
	"signature_name" varchar(200),
	"ip_address" varchar(64),
	"user_agent" text,
	"accepted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agreement_acceptances_user_key_idx" ON "agreement_acceptances" USING btree ("user_id","agreement_key");