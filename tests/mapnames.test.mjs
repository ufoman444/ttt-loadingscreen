/* Tests der Zuordnung "Workshop-Addon → Mapname".
   Die Fälle stammen aus echten Sammlungen und halten die Heuristik ehrlich. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { kern, passtZumTitel, istMap, mapnamenFinden, normalisieren } from '../scripts/lib/mapnames.mjs';

/* ══════════════════════════════════════════════════════════════════════════
   Kernbildung
   ══════════════════════════════════════════════════════════════════════════ */

test('kern entfernt Präfixe auch hinter einem Unterstrich', () => {
  // Der Klassiker: eine Wortgrenze greift hinter "_" nicht, deshalb muss
  // vorher alles Trennende zu Leerzeichen werden.
  assert.equal(kern('ttt_archives_ge5_v1b'), 'archivesge5v1b');
  assert.equal(kern('TTT Archives'), 'archives');
});

test('kern lässt Wörter unangetastet, die nur zufällig ein Präfix enthalten', () => {
  assert.equal(kern('Museum'), 'museum');   // "mu" darf hier nicht wegfallen
  assert.equal(kern('Biome'), 'biome');
});

/* ══════════════════════════════════════════════════════════════════════════
   Übernehmen oder ablehnen
   ══════════════════════════════════════════════════════════════════════════ */

const UEBERNEHMEN = [
  ['ttt_archives_ge5_v1b',    'TTT Archives'],
  ['ttt_biome',               'Biome'],
  ['ttt_museum',              'Museum'],
  ['ttt_terrortrain_2020_b1', 'Terrortrain 2020'],
  ['ttt_nighttrap_2020',      'TTT Nighttrap 2020'],
  ['ttt_zingyland_v2a',       'TTT Zingyland']
];

const ABLEHNEN = [
  ['cs_assault',        '[TTT] GSF Assault'],          // nur als benötigter Inhalt erwähnt
  ['gm_gmall',          'Submerge | TTT'],
  ['cs_insertion2',     'Holidayvilla (TTT/Prophunt)'],
  ['ttt_clue',          '[TTT] Juniper Lodge'],
  ['ttt_innocentmotel', '[TTT] Juniper Lodge'],
  ['de_thrill',         'TTT Zingyland'],
  ['ttt_isles',         'TTT Missile Isles'],
  ['ttt_gsf_topztower', '[TTT] GSF Assault']
];

for (const [map, titel] of UEBERNEHMEN) {
  test(`passtZumTitel übernimmt ${map} für "${titel}"`, () => {
    assert.equal(passtZumTitel(map, titel), true);
  });
}

for (const [map, titel] of ABLEHNEN) {
  test(`passtZumTitel lehnt ${map} für "${titel}" ab`, () => {
    assert.equal(passtZumTitel(map, titel), false);
  });
}

test('passtZumTitel lehnt zu kurze Kerne ab', () => {
  assert.equal(passtZumTitel('ttt_ab', 'TTT AB'), false);
});

/* ══════════════════════════════════════════════════════════════════════════
   Tag-Filter
   ══════════════════════════════════════════════════════════════════════════ */

test('istMap erkennt das Tag unabhängig von der Schreibweise', () => {
  assert.equal(istMap({ tags: [{ tag: 'map' }] }), true);
  assert.equal(istMap({ tags: [{ tag: 'Map' }] }), true);
});

test('istMap siebt Waffen und andere Addons aus', () => {
  // Eine Server-Sammlung besteht überwiegend aus Nicht-Maps.
  assert.equal(istMap({ tags: [{ tag: 'Weapon' }, { tag: 'Fun' }] }), false);
  assert.equal(istMap({}), false);
});

/* ══════════════════════════════════════════════════════════════════════════
   Vollständige Zuordnung
   ══════════════════════════════════════════════════════════════════════════ */

test('mapnamenFinden bevorzugt den Titel', () => {
  const treffer = mapnamenFinden({ title: 'ttt_minecraft_b5', description: 'braucht ttt_forest' });
  assert.deepEqual(treffer.namen, ['ttt_minecraft_b5']);
  assert.equal(treffer.quelle, 'titel');
  assert.equal(treffer.sicher, true);
});

test('mapnamenFinden nimmt passende Namen aus der Beschreibung', () => {
  const treffer = mapnamenFinden({ title: 'TTT Archives', description: 'Die Map heißt ttt_archives_ge5_v1b.' });
  assert.deepEqual(treffer.namen, ['ttt_archives_ge5_v1b']);
  assert.equal(treffer.quelle, 'beschreibung');
});

test('mapnamenFinden verwirft fremde Namen aus der Beschreibung', () => {
  const treffer = mapnamenFinden({ title: '[TTT] GSF Assault', description: 'Benötigt cs_assault aus CS:S.' });
  assert.deepEqual(treffer.namen, []);
  assert.equal(treffer.sicher, false, 'bleibt der unscharfen Titelsuche überlassen');
});

test('mapnamenFinden ignoriert im strikten Modus die Beschreibung ganz', () => {
  const item = { title: 'TTT Archives', description: 'Die Map heißt ttt_archives_ge5_v1b.' };
  assert.deepEqual(mapnamenFinden(item, { strikt: true }).namen, []);
});

test('mapnamenFinden findet mehrere Maps eines Addons', () => {
  const treffer = mapnamenFinden({ title: 'ttt_nighttrap und ttt_nighttrap_2020' });
  assert.equal(treffer.namen.length, 2);
});

test('normalisieren erzeugt den Schlüssel für die unscharfe Suche', () => {
  assert.equal(normalisieren('TTT Office'), 'tttoffice');
  assert.equal(normalisieren('ttt_office'), 'tttoffice');
});
