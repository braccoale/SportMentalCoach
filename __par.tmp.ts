import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();
async function main() {
  const sql = postgres(process.env.POSTGRES_URL!, { max: 1, prepare: false, connect_timeout: 10 });
  let t0 = Date.now();
  await sql`select 1`;
  console.log('singola:', Date.now() - t0, 'ms');

  t0 = Date.now();
  await Promise.all([
    sql`select count(*) from users`,
    sql`select count(*) from bookings`,
    sql`select count(*) from reviews`,
    sql`select count(*) from services`,
    sql`select count(*) from sports`,
    sql`select count(*) from provider_profiles`,
  ]);
  console.log('6 parallele (pipeline su 1 conn):', Date.now() - t0, 'ms');
  await sql.end();
}
main().catch(e => { console.log('ERR:', e.message); process.exit(1); });
