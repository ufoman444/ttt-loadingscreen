/* Tests der reinen Logik aus js/util.js — läuft ohne Browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const U = require('../js/util.js');

/* ══════════════════════════════════════════════════════════════════════════
   Grundlagen
   ══════════════════════════════════════════════════════════════════════════ */

test('clamp begrenzt nach unten und oben', () => {
  assert.equal(U.clamp(-5, 0, 10), 0);
  assert.equal(U.clamp(15, 0, 10), 10);
  assert.equal(U.clamp(7, 0, 10), 7);
});

test('hash liefert für dieselbe Eingabe immer denselben Wert', () => {
  assert.equal(U.hash('76561198012345678'), U.hash('76561198012345678'));
});

test('hash unterscheidet ähnliche SteamIDs', () => {
  assert.notEqual(U.hash('76561198012345678'), U.hash('76561198012345679'));
});

test('rng ist deterministisch und bleibt in [0,1)', () => {
  const a = U.rng(1234), b = U.rng(1234);
  for (let i = 0; i < 50; i++) {
    const wert = a();
    assert.equal(wert, b());
    assert.ok(wert >= 0 && wert < 1, `Wert außerhalb [0,1): ${wert}`);
  }
});

test('pick wählt reproduzierbar aus einer Liste', () => {
  const liste = ['a', 'b', 'c', 'd'];
  assert.equal(U.pick(liste, U.rng(99)), U.pick(liste, U.rng(99)));
  assert.ok(liste.includes(U.pick(liste, U.rng(7))));
});

test('escapeHtml entschärft die gefährlichen Zeichen', () => {
  assert.equal(
    U.escapeHtml('<script>alert("x" & 1)</script>'),
    '&lt;script&gt;alert(&quot;x&quot; &amp; 1)&lt;/script&gt;'
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Mapnamen
   ══════════════════════════════════════════════════════════════════════════ */

test('prettyMapName entfernt die Dateiendung', () => {
  assert.equal(U.prettyMapName('ttt_forest.bsp'), 'ttt_forest');
  assert.equal(U.prettyMapName('ttt_forest'), 'ttt_forest');
});

test('normalizeMap führt Schreibweisen zusammen', () => {
  assert.equal(U.normalizeMap('TTT Concrete'), U.normalizeMap('ttt_concrete'));
  assert.equal(U.normalizeMap('ttt_minecraft_b5.bsp'), 'tttminecraftb5');
});

test('stripVersion entfernt Versionsanhängsel', () => {
  assert.equal(U.stripVersion('ttt_forest_v2b'), 'ttt_forest');
  assert.equal(U.stripVersion('ttt_rooftops_2016'), 'ttt_rooftops');
  assert.equal(U.stripVersion('ttt_clue_se'), 'ttt_clue');
  assert.equal(U.stripVersion('ttt_bank'), 'ttt_bank', 'ohne Anhängsel unverändert');
});

/* ══════════════════════════════════════════════════════════════════════════
   URL-Parameter
   ══════════════════════════════════════════════════════════════════════════ */

test('parseParam liest einen Wert', () => {
  assert.equal(U.parseParam('?steamid=76561198012345678&map=ttt_forest', ['steamid']), '76561198012345678');
  assert.equal(U.parseParam('steamid=123', ['steamid']), '123', 'auch ohne führendes ?');
});

test('parseParam akzeptiert mehrere Schreibweisen des Namens', () => {
  assert.equal(U.parseParam('?MapName=ttt_forest', ['map', 'mapname']), 'ttt_forest');
});

test('parseParam ignoriert nicht ersetzte sv_loadingurl-Platzhalter', () => {
  // Genau der Fall beim Testen im Browser: GMod hat %s nie ersetzt.
  assert.equal(U.parseParam('?steamid=%s', ['steamid']), '');
  assert.equal(U.parseParam('?map=%m', ['map']), '');
});

test('parseParam wirft bei kaputten Prozentfolgen nicht', () => {
  // Genau das passiert, wenn jemand die sv_loadingurl zum Testen in den
  // Browser kopiert: decodeURIComponent('%s') wirft eine URIError.
  assert.doesNotThrow(() => U.parseParam('?steamid=%s&map=%m', ['steamid']));
  assert.doesNotThrow(() => U.parseParam('?map=100%zzz', ['map']));
  assert.equal(U.parseParam('?map=100%zzz', ['map']), '100%zzz', 'unlesbar, aber unveraendert');
});

test('parseParam liefert "" für Fehlendes', () => {
  assert.equal(U.parseParam('', ['steamid']), '');
  assert.equal(U.parseParam('?map=x', ['steamid']), '');
  assert.equal(U.parseParam('?steamid=', ['steamid']), '');
});

test('parseParam dekodiert Pluszeichen als Leerzeichen', () => {
  assert.equal(U.parseParam('?name=Mein+Server', ['name']), 'Mein Server');
});

/* ══════════════════════════════════════════════════════════════════════════
   Ladebalken
   ══════════════════════════════════════════════════════════════════════════ */

const PHASEN = [[0, 'Start'], [20, 'Mitte'], [90, 'Ende']];

test('phaseLabel wählt die passende Beschriftung', () => {
  assert.equal(U.phaseLabel(PHASEN, 0), 'Start');
  assert.equal(U.phaseLabel(PHASEN, 19), 'Start');
  assert.equal(U.phaseLabel(PHASEN, 20), 'Mitte');
  assert.equal(U.phaseLabel(PHASEN, 99), 'Ende');
});

test('phaseLabel kommt mit leerer Liste klar', () => {
  assert.equal(U.phaseLabel([], 50), '');
  assert.equal(U.phaseLabel(null, 50), '');
});

function zustand(extra = {}) {
  return Object.assign({
    filesTotal: 0, filesNeeded: 0, gotFileInfo: false, doneDownloading: false,
    started: 1000, doneSince: 0, demo: false, engineSpoke: false
  }, extra);
}

test('progressTarget läuft vor den Downloads langsam bis 6 % an', () => {
  assert.equal(U.progressTarget(zustand(), 1000), 0);
  assert.ok(U.progressTarget(zustand(), 1700) > 0);
  assert.equal(U.progressTarget(zustand(), 99000), 6, 'darf nicht über 6 % hinauskriechen');
});

test('progressTarget bildet den Download-Fortschritt auf 6–92 % ab', () => {
  const halb = U.progressTarget(zustand({ gotFileInfo: true, filesTotal: 100, filesNeeded: 50 }), 2000);
  assert.equal(halb, 49);

  const start = U.progressTarget(zustand({ gotFileInfo: true, filesTotal: 100, filesNeeded: 100 }), 2000);
  assert.equal(start, 6);
});

test('progressTarget kriecht nach den Downloads Richtung 99 %, ohne sie zu erreichen', () => {
  const s = zustand({ gotFileInfo: true, filesTotal: 100, filesNeeded: 0 });
  assert.equal(U.progressTarget(s, 5000), 92);
  assert.equal(s.doneSince, 5000, 'merkt sich den Zeitpunkt');

  assert.ok(U.progressTarget(s, 6500) > 92);
  assert.equal(U.progressTarget(s, 999999), 99);
});

test('progressTarget bleibt bei 0 Dateien nicht hängen', () => {
  // Nichts herunterzuladen ist kein Fehler, sondern ein sehr schneller Start.
  assert.equal(U.progressTarget(zustand({ gotFileInfo: true, filesTotal: 0 }), 2000), 92);
});

test('progressTarget simuliert im Vorschaumodus, aber nur ohne Engine', () => {
  const zeit = 1000 + 4000 + 2200;

  const demo = zustand({ demo: true });
  assert.ok(U.progressTarget(demo, zeit) > 6, 'Simulation laeuft ueber das normale Anlaufen hinaus');

  // Sobald die Engine spricht, zaehlt nur noch der echte Stand.
  const mitEngine = zustand({ demo: true, engineSpoke: true });
  assert.equal(U.progressTarget(mitEngine, zeit), U.progressTarget(zustand(), zeit));
});

test('progressTarget überschreitet nie 99,5 %', () => {
  const s = zustand({ demo: true });
  assert.ok(U.progressTarget(s, 10 ** 9) <= 99.5);
});

/* ══════════════════════════════════════════════════════════════════════════
   Workshop-Index
   ══════════════════════════════════════════════════════════════════════════ */

const INDEX = {
  exakt: {
    'ttt_minecraft_b5': { img: 'https://cdn/mc.jpg', titel: 'ttt_minecraft_b5', id: '1' },
    'ttt_rooftops':     { img: 'https://cdn/roof.jpg', lokal: 'img/maps/ttt_rooftops.jpg', id: '2' },
    '@999':             { img: 'https://cdn/office.jpg', titel: 'TTT Office', id: '999' }
  },
  unscharf: {
    'tttminecraftb5': 'ttt_minecraft_b5',
    'tttrooftops':    'ttt_rooftops',
    'tttoffice':      '@999'
  }
};

test('workshopCandidates findet den exakten Mapnamen', () => {
  assert.deepEqual(U.workshopCandidates(INDEX, 'ttt_minecraft_b5'), ['https://cdn/mc.jpg']);
});

test('workshopCandidates findet über die normalisierte Schreibweise', () => {
  // Das Addon heißt "TTT Office", die Map auf dem Server ttt_office.
  assert.deepEqual(U.workshopCandidates(INDEX, 'ttt_office'), ['https://cdn/office.jpg']);
});

test('workshopCandidates greift auf den Namen ohne Version zurück', () => {
  assert.deepEqual(
    U.workshopCandidates(INDEX, 'ttt_rooftops_a3'),
    ['img/maps/ttt_rooftops.jpg', 'https://cdn/roof.jpg']
  );
});

test('workshopCandidates stellt die lokale Kopie vor die CDN-URL', () => {
  const [erster] = U.workshopCandidates(INDEX, 'ttt_rooftops');
  assert.equal(erster, 'img/maps/ttt_rooftops.jpg');
});

test('workshopCandidates liefert keine Dubletten', () => {
  const treffer = U.workshopCandidates(INDEX, 'ttt_minecraft_b5');
  assert.equal(new Set(treffer).size, treffer.length);
});

test('workshopCandidates verträgt fehlenden oder leeren Index', () => {
  assert.deepEqual(U.workshopCandidates(null, 'ttt_forest'), []);
  assert.deepEqual(U.workshopCandidates({}, 'ttt_forest'), []);
  assert.deepEqual(U.workshopCandidates(INDEX, 'ttt_voellig_unbekannt'), []);
});
