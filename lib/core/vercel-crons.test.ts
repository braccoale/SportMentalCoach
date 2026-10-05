import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/**
 * I cron di Vercel chiamano la rotta con GET e con `Authorization: Bearer
 * CRON_SECRET`. Un percorso sbagliato in `vercel.json` non dà nessun errore al
 * deploy: il cron gira, riceve un 404 e il lavoro non parte mai. Il caso reale
 * è già successo con un workflow che usciva verde senza chiamare niente.
 */
interface CronVoce {
  path: string;
  schedule: string;
}

function crons(): CronVoce[] {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')
  ) as { crons?: CronVoce[] };
  return config.crons ?? [];
}

test('vercel.json dichiara i cron del worker e dei promemoria', () => {
  const percorsi = crons().map((voce) => voce.path);
  assert.ok(percorsi.includes('/api/internal/ai-notes/process'));
  assert.ok(percorsi.includes('/api/internal/notifications/reminders'));
});

for (const voce of crons()) {
  test(`${voce.path}: la rotta esiste ed espone GET`, () => {
    const file = join(
      process.cwd(),
      'app',
      ...voce.path.split('/').filter(Boolean),
      'route.ts'
    );
    assert.ok(existsSync(file), `manca ${file}`);
    const sorgente = readFileSync(file, 'utf8');
    assert.match(
      sorgente,
      /export (async )?function GET\b/,
      `${voce.path} non esporta GET: Vercel chiama i cron con GET`
    );
  });

  test(`${voce.path}: lo schedule ha cinque campi`, () => {
    assert.equal(voce.schedule.trim().split(/\s+/).length, 5);
  });
}
