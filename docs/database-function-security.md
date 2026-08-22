# Sicurezza delle funzioni database

La migrazione `0058_harden-database-function-security.sql` applica il principio
del privilegio minimo alle funzioni PostgreSQL usate da Supabase.

## Garanzie applicate

- Gli helper `SECURITY DEFINER` delle policy RLS vivono in `app_private`, schema
  non esposto alla Data API. Solo `authenticated` riceve `USAGE` sullo schema e
  `EXECUTE` sulle quattro funzioni richieste dalle policy.
- Le precedenti copie in `public`, le funzioni di trigger e l'event trigger
  `rls_auto_enable` non sono eseguibili da `PUBLIC`, `anon`, `authenticated` o
  `service_role`.
- Tutte le funzioni interessate hanno `search_path = ''` e usano riferimenti
  qualificati agli oggetti database.
- Le nuove funzioni create da `postgres` in `public` non ricevono piu'
  automaticamente `EXECUTE` per `anon` e `authenticated`. Ogni RPC futuro deve
  dichiarare esplicitamente i ruoli autorizzati nella propria migrazione.

La verifica ripetibile e' disponibile con:

```bash
npm run test:db:function-security
```

La verifica RLS end-to-end delle note AI resta:

```bash
npm run test:ai-notes:rls
```

## Passaggio al piano Supabase Pro

`Leaked Password Protection` non e' disponibile sul piano Free. Subito dopo
l'upgrade al piano Pro:

1. aprire Supabase Dashboard -> Authentication -> Sign In / Password Security;
2. abilitare **Leaked Password Protection**;
3. rieseguire il Security Advisor e verificare che il warning
   `auth_leaked_password_protection` sia scomparso.

L'impostazione e' gestita da Supabase Auth e non deve essere simulata con una
funzione SQL o con controlli applicativi locali.
