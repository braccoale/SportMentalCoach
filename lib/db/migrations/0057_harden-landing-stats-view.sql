-- La landing legge questi aggregati soltanto dal server tramite POSTGRES_URL.
-- Non serve quindi esporre la vista alla Data API, né farla eseguire con i
-- privilegi del proprietario quando viene interrogata da un ruolo diverso.
--
-- `security_invoker` fa rispettare privilegi e RLS del chiamante; la revoca
-- applica inoltre il principio del privilegio minimo a `anon` e
-- `authenticated`. Il proprietario `postgres`, usato dal backend KaiPai,
-- continua a poter leggere i quattro contatori.
ALTER VIEW public.landing_stats
SET (security_invoker = true);--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE public.landing_stats
FROM PUBLIC, anon, authenticated;--> statement-breakpoint

COMMENT ON VIEW public.landing_stats IS
  'Aggregati della landing letti esclusivamente dal backend. Vista security invoker, non esposta ai ruoli Data API.';
