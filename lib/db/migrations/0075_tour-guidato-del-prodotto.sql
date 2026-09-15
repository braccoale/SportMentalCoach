CREATE TABLE "user_product_tours" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"tour_key" varchar(64) NOT NULL,
	"status" varchar(20) NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "user_product_tours_user_tour_unique" UNIQUE("user_id","tour_key")
);
--> statement-breakpoint
ALTER TABLE "user_product_tours" ADD CONSTRAINT "user_product_tours_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;