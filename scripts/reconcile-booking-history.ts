import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', override: true });
dotenv.config();

async function main() {
  const repair = process.argv.includes('--repair');
  const { reconcileHistoricalUnrecordedBookings } = await import(
    '@/lib/core/video/technical-events-server'
  );

  const result = await reconcileHistoricalUnrecordedBookings({ repair });
  console.log(
    JSON.stringify(
      {
        mode: repair ? 'repair' : 'preview',
        ...result,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: 'unknown' }
  );
  process.exitCode = 1;
});
