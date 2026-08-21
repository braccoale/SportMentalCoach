import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migratedClientSurfaces = [
  {
    path: '../../components/action-form.tsx',
    namespace: 'SharedActions',
    forbidden: ['Torna indietro', 'Conferma operazione'],
  },
  {
    path: '../../components/user-menu.tsx',
    namespace: 'UserMenu',
    forbidden: ['Invita un amico', '>Esci<'],
  },
  {
    path: '../../components/dashboard-header.tsx',
    namespace: 'DashboardShell',
    forbidden: ['Trova un coach', '>Registrati<'],
  },
  {
    path: '../../components/notification-bell.tsx',
    namespace: 'Notifications',
    forbidden: ['Segna tutte come lette', 'Nessuna notifica.'],
  },
  {
    path: '../../components/google-analytics.tsx',
    namespace: 'CookieConsent',
    forbidden: ['Continua senza analytics', 'Accetta analytics'],
  },
  {
    path: '../../components/invite/invite-modal.tsx',
    namespace: 'Invite',
    forbidden: ['Condividi su WhatsApp', 'Generazione del link'],
  },
] as const;

for (const surface of migratedClientSurfaces) {
  test(`${surface.path} reads its shared copy from ${surface.namespace}`, async () => {
    const source = await readFile(new URL(surface.path, import.meta.url), 'utf8');
    assert.match(
      source,
      new RegExp(`useTranslations\\(['\"]${surface.namespace}['\"]\\)`)
    );
    for (const literal of surface.forbidden) {
      assert.equal(source.includes(literal), false, `${literal} is still hardcoded`);
    }
  });
}

test('the server-rendered footer reads copy from its own namespace', async () => {
  const source = await readFile(
    new URL('../../components/footer.tsx', import.meta.url),
    'utf8'
  );
  assert.match(source, /useTranslations\(['"]Footer['"]\)/);
  assert.equal(source.includes('Tutti i diritti riservati'), false);
});
