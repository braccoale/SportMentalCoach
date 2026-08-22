import assert from 'node:assert/strict';
import test from 'node:test';
import { RETURN_TO_PARAM, withReturnTo } from './return-to';

const DA = '/dashboard/coach/athletes/88';

test('senza un ritorno l’indirizzo resta intatto', () => {
  assert.equal(withReturnTo('/dashboard/appointments/7', null), '/dashboard/appointments/7');
});

test('il ritorno viene aggiunto come parametro', () => {
  assert.equal(
    withReturnTo('/dashboard/appointments/7', DA),
    `/dashboard/appointments/7?${RETURN_TO_PARAM}=${encodeURIComponent(DA)}`
  );
});

/**
 * Il caso che rompeva tutto in silenzio: quello che segue il cancelletto non è
 * una query ma parte del frammento, quindi un parametro messo dopo l'ancora non
 * arriva mai al server — e il collegamento «indietro» tornerebbe al valore
 * predefinito senza che niente segnali l'errore.
 */
test('l’ancora resta in fondo', () => {
  assert.equal(
    withReturnTo('/dashboard/appointments/7#session-compass', DA),
    `/dashboard/appointments/7?${RETURN_TO_PARAM}=${encodeURIComponent(DA)}#session-compass`
  );
});

test('un indirizzo che ha già una query prende la congiunzione giusta', () => {
  assert.equal(
    withReturnTo('/dashboard/appointments/7?created=1#x', DA),
    `/dashboard/appointments/7?created=1&${RETURN_TO_PARAM}=${encodeURIComponent(DA)}#x`
  );
});

test('il valore è codificato, così una query nel ritorno non si mescola', () => {
  const conQuery = '/dashboard/coach/athletes/88?tab=obiettivi';
  const risultato = withReturnTo('/dashboard/appointments/7', conQuery);
  assert.equal(new URL(risultato, 'https://x.test').searchParams.get(RETURN_TO_PARAM), conQuery);
});
