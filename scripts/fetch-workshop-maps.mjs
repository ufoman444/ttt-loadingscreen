#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   MAP-VORSCHAUBILDER AUS EINER STEAM-WORKSHOP-SAMMLUNG HOLEN

   Liest eine (oder mehrere) Workshop-Sammlungen aus, ordnet jedem Addon den
   Mapnamen zu und schreibt js/maps.json. Der Ladebildschirm nutzt diesen Index
   danach automatisch — du musst keine Bilder mehr von Hand ablegen.

   BENUTZUNG
     node scripts/fetch-workshop-maps.mjs 1496481131
     node scripts/fetch-workshop-maps.mjs 1496481131 807546561
     node scripts/fetch-workshop-maps.mjs 1496481131 --download

   Die Zahl ist die ID deiner Sammlung — sie steht in deren URL:
     https://steamcommunity.com/sharedfiles/filedetails/?id=1496481131
   Einzelne Addon-IDs funktionieren genauso.

   OPTIONEN
     --download        Bilder zusätzlich nach img/maps/ herunterladen, damit
                       der Ladebildschirm nicht von Steams CDN abhängt.
     --out <datei>     Anderer Zielpfad als js/maps.json.
     --strict          Nur Mapnamen aus dem Addon-TITEL verwenden.
     --all             Auch Addons ohne "map"-Tag auswerten. Standardmäßig
                       werden nur Maps betrachtet — sonst schiebt dir ein
                       Waffen-Addon, das in seiner Beschreibung eine Map
                       erwähnt, sein Icon als Map-Vorschau unter.

   Kein API-Key nötig. Node 18 oder neuer, keine Abhängigkeiten.

   WARUM EIN SKRIPT UND NICHT LIVE IM LADEBILDSCHIRM?
   Steams API schickt keine CORS-Header, der Browser des Spielers darf sie also
   gar nicht abfragen. Und es gibt keinen Endpunkt "welches Addon enthält Map X"
   — die Zuordnung muss über Titel und Beschreibung erschlossen werden. Beides
   erledigt man besser einmal vorab als bei jedem Serverbeitritt.
   ══════════════════════════════════════════════════════════════════════════ */

import { writeFile, mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { normalisieren, mapnamenFinden, istMap } from './lib/mapnames.mjs';

const API = 'https://api.steampowered.com/ISteamRemoteStorage';

/* ── Argumente ─────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const ids = args.filter(a => /^\d+$/.test(a));
const download = args.includes('--download');
const alleAddons = args.includes('--all');
const strikt = args.includes('--strict');   // Beschreibungen komplett ignorieren
const outIndex = args.indexOf('--out');
const OUT = outIndex !== -1 && args[outIndex + 1] ? args[outIndex + 1] : 'js/maps.json';

if (!ids.length) {
  console.error('Fehler: keine Sammlungs- oder Addon-ID angegeben.\n');
  console.error('  node scripts/fetch-workshop-maps.mjs <sammlungs-id> [weitere ids] [--download]\n');
  process.exit(1);
}

/* ── Steam-API ─────────────────────────────────────────────────────────── */
async function post(endpoint, body) {
  const res = await fetch(`${API}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body)
  });
  if (!res.ok) throw new Error(`${endpoint} antwortete mit HTTP ${res.status}`);
  return res.json();
}

/* Sammlung auflösen — auch Sammlungen in Sammlungen. */
async function sammlungAufloesen(startIds) {
  const gesehen = new Set();
  const items = new Set();
  let queue = [...startIds];

  while (queue.length) {
    const batch = queue.splice(0, 20).filter(id => !gesehen.has(id));
    batch.forEach(id => gesehen.add(id));
    if (!batch.length) continue;

    const body = { collectioncount: batch.length };
    batch.forEach((id, i) => { body[`publishedfileids[${i}]`] = id; });

    let data;
    try { data = await post('GetCollectionDetails/v1/', body); }
    catch (e) { console.warn('  Warnung:', e.message); continue; }

    for (const det of data.response.collectiondetails || []) {
      if (det.result !== 1 || !det.children) {
        /* Keine Sammlung → als einzelnes Addon behandeln. */
        items.add(det.publishedfileid);
        continue;
      }
      for (const kind of det.children) {
        /* filetype 2 = weitere Sammlung, sonst normales Addon */
        if (Number(kind.filetype) === 2) queue.push(kind.publishedfileid);
        else items.add(kind.publishedfileid);
      }
    }
  }
  return [...items];
}

async function addonsLaden(itemIds) {
  const alle = [];
  for (let i = 0; i < itemIds.length; i += 50) {
    const batch = itemIds.slice(i, i + 50);
    const body = { itemcount: batch.length };
    batch.forEach((id, n) => { body[`publishedfileids[${n}]`] = id; });
    const data = await post('GetPublishedFileDetails/v1/', body);
    alle.push(...(data.response.publishedfiledetails || []));
    process.stdout.write(`\r  ${Math.min(i + 50, itemIds.length)} / ${itemIds.length} Addons geladen`);
  }
  process.stdout.write('\n');
  return alle;
}

/* ── Bild herunterladen (nur mit --download) ───────────────────────────── */
async function bildLaden(url, ziel) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(ziel));
}

/* ══════════════════════════════════════════════════════════════════════════
   Hauptprogramm
   ══════════════════════════════════════════════════════════════════════════ */
console.log(`\nSammlung(en) werden aufgelöst: ${ids.join(', ')}`);
const itemIds = await sammlungAufloesen(ids);
console.log(`  ${itemIds.length} Addons gefunden`);

if (!itemIds.length) {
  console.error('Keine Addons gefunden. Stimmt die ID? Ist die Sammlung öffentlich?');
  process.exit(1);
}

console.log('\nAddon-Details werden abgerufen:');
const addons = await addonsLaden(itemIds);

/* Beliebtere Addons zuerst — bei Namenskollisionen gewinnt das gebräuchlichere. */
addons.sort((a, b) => Number(b.subscriptions || 0) - Number(a.subscriptions || 0));

const exakt = {};        // ttt_minecraft_b5 → Eintrag
const unscharf = {};     // tttminecraftb5   → Mapname (Rückfallebene)
const ohneTreffer = [];

const kandidaten = addons.filter(it => it.result === 1 && it.preview_url);
const mapAddons = alleAddons ? kandidaten : kandidaten.filter(istMap);

console.log(`
${mapAddons.length} davon sind Maps` +
            (alleAddons ? ' (Tag-Filter deaktiviert)' : ` (Tag "map"), ${kandidaten.length - mapAddons.length} andere Addons übersprungen`));

for (const item of mapAddons) {

  const { namen, quelle, sicher } = mapnamenFinden(item, { strikt });
  const eintrag = {
    img: item.preview_url,
    titel: item.title || '',
    id: item.publishedfileid
  };

  if (sicher) {
    for (const name of namen) {
      if (!exakt[name]) exakt[name] = { ...eintrag, quelle };
      const key = normalisieren(name);
      if (!unscharf[key]) unscharf[key] = name;
    }
  } else {
    ohneTreffer.push(item);
  }

  /* Der normalisierte Titel dient immer als zusätzliche Rückfallebene:
     "TTT Concrete" findet so auch die Map "ttt_concrete". */
  const titelKey = normalisieren(item.title);
  if (titelKey.length > 3 && !unscharf[titelKey]) {
    if (!sicher) {
      exakt['@' + item.publishedfileid] = { ...eintrag, quelle: 'titel-normalisiert' };
      unscharf[titelKey] = '@' + item.publishedfileid;
    } else {
      unscharf[titelKey] = namen[0];
    }
  }
}

/* ── Optional: Bilder lokal ablegen ────────────────────────────────────── */
if (download) {
  const ziel = 'img/maps';
  await mkdir(ziel, { recursive: true });
  const namen = Object.keys(exakt).filter(n => n.charAt(0) !== '@');
  console.log(`\n${namen.length} Vorschaubilder werden nach ${ziel}/ geladen:`);

  let ok = 0, fehler = 0;
  for (let i = 0; i < namen.length; i++) {
    const name = namen[i];
    const datei = path.join(ziel, `${name}.jpg`);
    try {
      await bildLaden(exakt[name].img, datei);
      exakt[name].lokal = `img/maps/${name}.jpg`;
      ok++;
    } catch (e) {
      fehler++;
    }
    process.stdout.write(`\r  ${i + 1} / ${namen.length}  (${ok} ok, ${fehler} fehlgeschlagen)`);
    await new Promise(r => setTimeout(r, 120));   // höflich zu Steams CDN bleiben
  }
  process.stdout.write('\n');
}

/* ── Index schreiben ───────────────────────────────────────────────────── */
const index = {
  erzeugt: new Date().toISOString(),
  sammlungen: ids,
  anzahl: Object.keys(exakt).filter(n => n.charAt(0) !== '@').length,
  exakt,
  unscharf
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(index, null, 1), 'utf8');

/* ── Bericht ───────────────────────────────────────────────────────────── */
console.log(`\n✓ ${OUT} geschrieben — ${index.anzahl} Maps zugeordnet.`);

if (ohneTreffer.length) {
  console.log(`\n${ohneTreffer.length} Addons ohne erkennbaren Mapnamen im Text.`);
  console.log('Sie sind über den normalisierten Titel trotzdem auffindbar. Passt die');
  console.log('Zuordnung nicht, trag die Map von Hand in js/config.js unter "mapImages" ein:\n');
  for (const item of ohneTreffer.slice(0, 15)) {
    console.log(`  ${item.publishedfileid.padEnd(12)} ${item.title}`);
  }
  if (ohneTreffer.length > 15) console.log(`  … und ${ohneTreffer.length - 15} weitere`);
}

console.log('\nFertig. In js/config.js muss "workshopIndex" auf diese Datei zeigen');
console.log('(Standard: \'js/maps.json\' — dann ist nichts weiter zu tun).\n');
