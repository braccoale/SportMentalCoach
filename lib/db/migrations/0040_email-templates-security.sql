-- email_templates: tabella server-managed, non esposta a PostgREST.
--
-- Contesto. La 0038 aveva revocato solo `anon`. Supabase concede per default
-- ALL su ogni nuova tabella di `public` anche ad `authenticated`, e PostgREST
-- espone lo schema `public`: senza RLS, qualsiasi utente autenticato poteva
-- leggere e RISCRIVERE il testo delle email transazionali di KaiPai
-- direttamente dall'API REST.
--
-- Regola di accesso. `email_templates` è gestita esclusivamente dal backend
-- server-side (lib/core/email/templates.ts e scripts/seed-email-templates.ts),
-- che usa la connessione Postgres dell'applicazione. Il browser non la legge e
-- non la scrive mai, né via supabase-js né via PostgREST.
--
-- Due barriere indipendenti, perché ciascuna da sola può essere annullata per
-- sbaglio (un GRANT rimesso a mano, una default privilege reintrodotta):
--   1. nessun privilegio per anon e authenticated;
--   2. RLS abilitata SENZA alcuna policy: "RLS on, zero policy" nega di default
--      ogni ruolo non proprietario.
--
-- Deliberatamente NON viene usato FORCE ROW LEVEL SECURITY: senza FORCE il
-- proprietario della tabella non è soggetto alle policy, ed è proprio così che
-- l'accesso server-side esistente continua a funzionare senza aggiungere
-- policy o ruoli.
--
-- `service_role` mantiene i propri privilegi: è la chiave usata da strumenti
-- server-side fidati e non è mai esposta al browser.
--
-- Additiva e non distruttiva: nessun dato, nessun template viene letto,
-- modificato o cancellato. Rieseguibile senza effetti collaterali.

REVOKE ALL PRIVILEGES ON TABLE "public"."email_templates"
  FROM anon, authenticated;--> statement-breakpoint

ALTER TABLE "public"."email_templates" ENABLE ROW LEVEL SECURITY;
