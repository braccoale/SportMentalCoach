CREATE TABLE "direct_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"athlete_id" integer NOT NULL,
	"provider_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "direct_conversations_athlete_provider_unique" UNIQUE("athlete_id","provider_id")
);
--> statement-breakpoint
CREATE TABLE "direct_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "direct_messages_body_check" CHECK (char_length(trim("direct_messages"."body")) between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "is_intro" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "direct_conversations" ADD CONSTRAINT "direct_conversations_athlete_id_users_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_conversations" ADD CONSTRAINT "direct_conversations_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_conversation_id_direct_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."direct_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "direct_conversations_provider_idx" ON "direct_conversations" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "direct_messages_conversation_created_idx" ON "direct_messages" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "services_provider_intro_unique" ON "services" USING btree ("provider_id") WHERE "services"."is_intro" = true;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_intro_terms_check" CHECK (not "services"."is_intro" or ("services"."duration_min" = 20 and "services"."price" is not null and "services"."price" = 0));
--> statement-breakpoint
-- Direct chats are accessed only through participant-checked server endpoints.
ALTER TABLE public.direct_conversations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.direct_conversations, public.direct_messages FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON SEQUENCE public.direct_conversations_id_seq, public.direct_messages_id_seq FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT ALL ON public.direct_conversations, public.direct_messages TO service_role;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE public.direct_conversations_id_seq, public.direct_messages_id_seq TO service_role;
