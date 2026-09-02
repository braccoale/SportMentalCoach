/**
 * Cancella gli utenti creati dagli scenari end-to-end, e il rumore che hanno
 * prodotto.
 *
 * **Perché serve.** `e2e/happy-path.mjs` crea utenti nuovi a ogni giro — è il
 * suo modo di partire sempre da zero — e li lascia sul database, che qui è
 * produzione. Ogni registrazione di coach avvisa inoltre **tutti** gli
 * amministratori: il 2026-08-27 sette giri hanno lasciato trenta notifiche a
 * persone reali. Da allora `npm run dev:silent` impedisce che partano, ma le
 * utenze restano comunque da rimuovere.
 *
 * **Perché le notifiche vanno cancellate a parte.** Non appartengono agli
 * utenti di prova: sono righe degli amministratori. Il cascade su `users` non
 * le tocca. E il legame non è l'id dell'utente ma quello del profilo coach,
 * perché è lì che punta il collegamento: `{"link":"/dashboard/admin/coach#coach-38"}`
 * (le notifiche più vecchie usano ancora `/dashboard/admin#coach-38`).
 *
 * Uso:
 *   npx tsx scripts/cleanup-e2e-users.ts            → mostra e basta
 *   npx tsx scripts/cleanup-e2e-users.ts --esegui   → cancella
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { client } from '@/lib/db/drizzle';

/** Il dominio non è usato da nessun altro: nessun account vero finisce qui. */
const PATTERN = 'e2e-%@demo.smc';

async function main() {
  const dryRun = !process.argv.includes('--esegui');

  const users = await client`
    select id, email, name, last_name
    from users where email like ${PATTERN} order by id
  `;
  console.log(`UTENTI DI PROVA: ${users.length}`);
  for (const u of users) {
    console.log(`  id=${u.id}  ${u.email}  ${u.name ?? ''} ${u.last_name ?? ''}`);
  }
  if (users.length === 0) {
    await client.end();
    return;
  }

  const ids = users.map((u) => u.id as number);

  // Solo per dirlo ad alta voce: queste righe hanno ON DELETE CASCADE su
  // user_id e vanno via con l'utente. Se qui comparisse una prenotazione con
  // un partecipante vero, sarebbe il momento di fermarsi e guardare.
  const [counts] = await client`
    select
      (select count(*)::int from bookings
        where client_id = any(${ids})
           or provider_id in (select id from provider_profiles where user_id = any(${ids}))
      ) as prenotazioni,
      (select count(*)::int from provider_profiles where user_id = any(${ids})) as profili_coach,
      (select count(*)::int from client_profiles where user_id = any(${ids})) as profili_atleta,
      (select count(*)::int from reviews where author_id = any(${ids})) as recensioni
  `;
  console.log('SI PORTA DIETRO:', JSON.stringify(counts));

  const profiles = await client`
    select id from provider_profiles where user_id = any(${ids})
  `;
  /*
   * Due forme, non una. Le notifiche generate prima della Control Room
   * puntavano a `/dashboard/admin#coach-<id>`; da quando i coach hanno la
   * loro area il collegamento e' `/dashboard/admin/coach#coach-<id>`.
   * Cercare solo la forma nuova lascerebbe indietro proprio le righe
   * storiche, che sono quelle che questo script deve ripulire.
   */
  const links = profiles.flatMap((p) => [
    `/dashboard/admin#coach-${p.id as number}`,
    `/dashboard/admin/coach#coach-${p.id as number}`,
  ]);
  const [noise] = links.length
    ? await client`
        select count(*)::int as n from notifications
        where type in ('provider_registered', 'provider_review_requested')
          and data->>'link' = any(${links})
      `
    : [{ n: 0 }];
  console.log('NOTIFICHE AGLI ADMIN GENERATE DA LORO:', noise.n);

  if (dryRun) {
    console.log('\n(prova a vuoto — niente è stato cancellato)');
    console.log('per eseguire: npx tsx scripts/cleanup-e2e-users.ts --esegui');
    await client.end();
    return;
  }

  const deletedNoise = links.length
    ? await client`
        delete from notifications
        where type in ('provider_registered', 'provider_review_requested')
          and data->>'link' = any(${links})
        returning id
      `
    : [];
  const deleted = await client`
    delete from users where id = any(${ids}) returning id
  `;
  console.log(
    `\nCANCELLATI: ${deleted.length} utenti, ${deletedNoise.length} notifiche agli admin`
  );

  await client.end();
}

main().catch((error) => {
  console.error('ERRORE:', error.message);
  process.exit(1);
});
