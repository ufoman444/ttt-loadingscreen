/* Rauchtest des erzeugten Helfer-Workers (dist/worker.js).

   Geprüft werden nur Wege, die ohne Netz auskommen — der Verteiler und die
   Eingabeprüfung. Bricht scripts/build-worker.mjs beim Zusammenkleben etwas
   kaputt, fällt es hier auf, bevor jemand eine defekte Datei bei Cloudflare
   einfügt. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PFAD = 'dist/worker.js';

if (!existsSync(PFAD)) {
  test('dist/worker.js fehlt — erst "npm run build:worker" ausführen', { skip: true }, () => {});
} else {
  const worker = (await import(pathToFileURL(PFAD).href)).default;

  test('der Worker stellt einen fetch-Einstieg bereit', () => {
    assert.equal(typeof worker.fetch, 'function');
  });

  test('unbekannter Pfad erklärt die Endpunkte', async () => {
    const res = await worker.fetch(new Request('https://x/'), {});
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.match(text, /steam-profile/);
    assert.match(text, /map-preview/);
  });

  test('ungültige SteamID wird abgewiesen, bevor Steam gefragt wird', async () => {
    const res = await worker.fetch(new Request('https://x/steam-profile?steamid=abc'), {});
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'ungueltige SteamID');
  });

  test('ungültiger Mapname wird abgewiesen', async () => {
    const res = await worker.fetch(new Request('https://x/map-preview?map=../etc/passwd'), {});
    assert.equal(res.status, 400);
  });

  test('Antworten tragen die CORS-Kopfzeile — sonst verwirft GitHub Pages sie', async () => {
    const res = await worker.fetch(new Request('https://x/steam-profile?steamid=abc'), {});
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  });

  test('ALLOWED_ORIGIN schränkt die Freigabe ein', async () => {
    const res = await worker.fetch(
      new Request('https://x/steam-profile?steamid=abc'),
      { ALLOWED_ORIGIN: 'https://ufoman444.github.io' }
    );
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://ufoman444.github.io');
  });

  test('Vorabfrage des Browsers wird beantwortet', async () => {
    const res = await worker.fetch(
      new Request('https://x/steam-profile?steamid=76561198060265210', { method: 'OPTIONS' }), {}
    );
    assert.equal(res.status, 204);
    assert.match(res.headers.get('access-control-allow-methods'), /GET/);
  });
}
