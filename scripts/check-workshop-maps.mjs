#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   MAP-INDEX PRÜFEN

   Kontrolliert js/maps.json auf die drei Dinge, die im Betrieb schiefgehen:
     1. Ist jedes Vorschaubild bei Steam noch erreichbar?
     2. Beanspruchen zwei Addons denselben Mapnamen? (dann zeigt der
        Ladebildschirm womöglich das falsche Bild)
     3. Welche Maps hängen nur an der unscharfen Titel-Zuordnung und sollten
        von dir einmal kurz angesehen werden?

   BENUTZUNG
     node scripts/check-workshop-maps.mjs
     node scripts/check-workshop-maps.mjs --index js/maps.json
   ══════════════════════════════════════════════════════════════════════════ */

import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const i = args.indexOf('--index');
const INDEX = i !== -1 && args[i + 1] ? args[i + 1] : 'js/maps.json';

const daten = JSON.parse(await readFile(INDEX, 'utf8'));
const exakt = daten.exakt || {};
const unscharf = daten.unscharf || {};

const echteMaps = Object.keys(exakt).filter(k => k.charAt(0) !== '@');
const unsicher = Object.keys(exakt).filter(k => k.charAt(0) === '@');

console.log(`\nIndex: ${INDEX}`);
console.log(`Erzeugt: ${daten.erzeugt || 'unbekannt'}`);
console.log(`Sammlung(en): ${(daten.sammlungen || []).join(', ') || 'unbekannt'}`);
console.log(`\n${echteMaps.length} Maps mit eindeutigem Namen, ${unsicher.length} nur über den Titel zugeordnet.`);

/* ── 1. Erreichbarkeit der Bilder ──────────────────────────────────────── */
console.log('\n── Bilder werden geprüft ──');

const alleEintraege = [...echteMaps, ...unsicher];
const kaputt = [];
let geprueft = 0;

const schlaf = ms => new Promise(r => setTimeout(r, ms));

/* WICHTIG: kein HEAD verwenden. Steams Bild-CDN beantwortet HEAD für einen
   Teil der Bilder mit 404, obwohl dasselbe Bild per GET sauber mit 200 kommt.
   Ein HEAD-basierter Test meldet also Fehler, die keine sind. Stattdessen ein
   GET über einen einzigen Byte-Bereich — billig und ehrlich. */
async function pruefe(key, versuch = 1) {
  const url = exakt[key].img;
  try {
    const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
    /* Körper sofort verwerfen, damit nicht das ganze Bild geladen wird. */
    if (res.body) { try { await res.body.cancel(); } catch (e) { /* egal */ } }

    if (res.status !== 200 && res.status !== 206) {
      if (versuch < 3) { await schlaf(900 * versuch); return pruefe(key, versuch + 1); }
      kaputt.push({ key, status: res.status });
    }
  } catch (e) {
    if (versuch < 3) { await schlaf(900 * versuch); return pruefe(key, versuch + 1); }
    kaputt.push({ key, status: e.message });
  }
  geprueft++;
  process.stdout.write(`\r  ${geprueft} / ${alleEintraege.length}`);
}

for (const key of alleEintraege) {
  await pruefe(key);
  await schlaf(80);
}
process.stdout.write('\n');

if (kaputt.length) {
  console.log(`\n  ${kaputt.length} Bild(er) NICHT erreichbar:`);
  for (const k of kaputt) console.log(`    ${k.key.padEnd(34)} ${k.status}  (${exakt[k.key].titel})`);
} else {
  console.log(`  Alle ${alleEintraege.length} Bilder erreichbar.`);
}

/* ── 2. Namenskollisionen ──────────────────────────────────────────────── */
console.log('\n── Kollisionen ──');

const nachId = {};
for (const key of echteMaps) {
  const id = exakt[key].id;
  (nachId[id] = nachId[id] || []).push(key);
}
const mehrfach = Object.entries(nachId).filter(([, keys]) => keys.length > 1);

if (mehrfach.length) {
  console.log(`  ${mehrfach.length} Addon(s) beanspruchen mehrere Mapnamen.`);
  console.log('  Meist harmlos (Addon enthält wirklich mehrere Maps), aber prüfenswert,');
  console.log('  wenn der Name aus der Beschreibung stammt:\n');
  for (const [id, keys] of mehrfach.slice(0, 12)) {
    console.log(`    ${exakt[keys[0]].titel}`);
    console.log(`      → ${keys.join(', ')}`);
  }
  if (mehrfach.length > 12) console.log(`    … und ${mehrfach.length - 12} weitere`);
} else {
  console.log('  Keine.');
}

const ausBeschreibung = echteMaps.filter(k => exakt[k].quelle === 'beschreibung');
if (ausBeschreibung.length) {
  console.log(`\n  ${ausBeschreibung.length} Zuordnung(en) stammen aus der Addon-Beschreibung,`);
  console.log('  nicht aus dem Titel — das ist die unzuverlässigste Quelle:\n');
  for (const k of ausBeschreibung.slice(0, 15)) {
    console.log(`    ${k.padEnd(34)} ← "${exakt[k].titel}"`);
  }
  if (ausBeschreibung.length > 15) console.log(`    … und ${ausBeschreibung.length - 15} weitere`);
}

/* ── 3. Unsichere Zuordnungen ──────────────────────────────────────────── */
console.log('\n── Nur über den Titel auffindbar ──');

if (unsicher.length) {
  console.log('  Diese Addons nennen ihren Mapnamen nirgends im Text. Der Ladebildschirm');
  console.log('  findet sie nur, wenn der echte Mapname dem normalisierten Titel entspricht.');
  console.log('  Stimmt das nicht, trag die Map in js/config.js unter "mapImages" ein.\n');

  const umkehr = {};
  for (const [norm, ziel] of Object.entries(unscharf)) if (ziel.charAt(0) === '@') umkehr[ziel] = norm;

  for (const key of unsicher) {
    const e = exakt[key];
    console.log(`    ${(e.titel || '').slice(0, 46).padEnd(48)} greift bei Mapname → "${umkehr[key] || '?'}"`);
  }
} else {
  console.log('  Keine. Jede Map ist eindeutig zugeordnet.');
}

/* ── Fazit ─────────────────────────────────────────────────────────────── */
const abdeckung = echteMaps.length + unsicher.length;
console.log('\n══ Fazit ══');
console.log(`  ${abdeckung} Maps im Index, davon ${echteMaps.length} eindeutig (${Math.round(echteMaps.length / abdeckung * 100)} %).`);
console.log(`  ${kaputt.length ? kaputt.length + ' Bild(er) defekt' : 'Alle Bilder erreichbar'}.`);
console.log(`  ${unsicher.length} Map(s) solltest du im Spiel einmal gegenprüfen.\n`);

process.exit(kaputt.length ? 1 : 0);
