-- Pagina Panoramica del corso (hero, "cosa imparerai", livello): tre colonne
-- additive e nullable su academy_courses, nessuna delle tre popolata da
-- questa migrazione. `hero_image_key` è una chiave nel bucket privato
-- Academy, non un URL pubblico — stesso pattern di
-- academy_module_attachments.storage_key.

ALTER TABLE "academy_courses" ADD COLUMN "level" varchar(60);--> statement-breakpoint
ALTER TABLE "academy_courses" ADD COLUMN "hero_image_key" text;--> statement-breakpoint
ALTER TABLE "academy_courses" ADD COLUMN "what_youll_learn" text[];