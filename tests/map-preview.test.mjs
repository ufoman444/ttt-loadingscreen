/* Tests der Live-Suche. Kein Netz nötig: geprüft werden das Auswerten der
   Ergebnisseite und die Bewertung der Treffer — die beiden Teile, an denen
   ein falsches Bild entstehen könnte. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { kern, ohneVersion, guete, parseTreffer } from '../proxy/map-preview-function.js';

/* Ausschnitt aus einer echten Workshop-Ergebnisseite. Die Seite ist eine
   React-App mit generierten Klassennamen — verlässlich ist nur der Aufbau
   "Link auf das Item, direkt gefolgt vom Bild mit Titel im alt-Attribut". */
const SEITE = `
<div class="_7-YnT aspectratio_square">
  <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=534491717" class="tK5ag">
    <img src="https://images.steamusercontent.com/ugc/574565056/06E58BDE/?ima=fit&amp;imw=288&amp;imh=288"
         alt="ttt_rooftops_2016" loading="lazy" class=""/></a>
</div>
<div class="_7-YnT aspectratio_square">
  <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=159321088" class="tK5ag">
    <img src="https://images.steamusercontent.com/ugc/901001920/D1CB9D3B/?ima=fit&amp;imw=288"
         alt="ttt_minecraft_b5" loading="lazy" class=""/></a>
</div>
<div class="_7-YnT aspectratio_square">
  <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=159321088" class="tK5ag">
    <img src="https://images.steamusercontent.com/ugc/901001920/D1CB9D3B/?imw=64"
         alt="ttt_minecraft_b5" loading="lazy" class=""/></a>
</div>
`;

test('parseTreffer liest ID, Bild und Titel aus der Ergebnisseite', () => {
  const treffer = parseTreffer(SEITE);
  assert.equal(treffer[0].id, '534491717');
  assert.equal(treffer[0].titel, 'ttt_rooftops_2016');
  assert.equal(treffer[1].id, '159321088');
});

test('parseTreffer schneidet den Query-String ab — sonst kommt die 288er-Briefmarke', () => {
  const [erster] = parseTreffer(SEITE);
  assert.equal(erster.img, 'https://images.steamusercontent.com/ugc/574565056/06E58BDE/');
  assert.ok(!erster.img.includes('imw=288'));
});

test('parseTreffer überspringt dasselbe Item ein zweites Mal', () => {
  const ids = parseTreffer(SEITE).map(t => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 2);
});

test('parseTreffer liefert bei fremdem HTML eine leere Liste', () => {
  assert.deepEqual(parseTreffer('<html><body>nichts hier</body></html>'), []);
});

/* ── Bewertung ──────────────────────────────────────────────────────────── */

test('guete: wörtlicher Titeltreffer bekommt die Höchstnote', () => {
  assert.equal(guete('ttt_minecraft_b5', 'ttt_minecraft_b5'), 3);
  assert.equal(guete('ttt_clue_se', 'ttt_Clue_se'), 3, 'Groß- und Kleinschreibung egal');
});

test('guete: gleicher Kern zählt als sicherer Treffer', () => {
  assert.equal(guete('ttt_office', 'TTT Office'), 2);
});

test('guete: andere Fassung derselben Map ist besser als nichts', () => {
  assert.equal(guete('ttt_rooftops_a3', 'ttt_rooftops_2016'), 1);
  assert.equal(guete('ttt_waterworld_a3', 'ttt_waterworld'), 1);
});

test('guete: fremde Map wird abgelehnt', () => {
  // Lieber die Platzhalterkarte als ein falsches Bild.
  assert.equal(guete('ttt_bank', 'TTT Juniper Lodge'), 0);
  assert.equal(guete('ttt_forest', 'Counter-Strike Waffenpaket'), 0);
});

test('ohneVersion entfernt Fassungsanhängsel', () => {
  assert.equal(ohneVersion('ttt_rooftops_a3'), 'ttt_rooftops');
  assert.equal(ohneVersion('ttt_rooftops_2016'), 'ttt_rooftops');
});

test('kern arbeitet wie im Index-Skript', () => {
  // Beide Kopien müssen dasselbe tun, sonst findet die Live-Suche etwas
  // anderes als der Index.
  assert.equal(kern('[TTT] Juniper Lodge'), 'juniperlodge');
  assert.equal(kern('ttt_archives_ge5_v1b'), 'archivesge5v1b');
});
