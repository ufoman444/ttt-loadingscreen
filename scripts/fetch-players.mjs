#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   STEAM-PROFILE VORAB HOLEN

   Schreibt js/players.json mit Name und Avatar zu den angegebenen SteamIDs.
   Der Ladebildschirm bedient sich dort und zeigt damit echte Profile — auch
   auf einem rein statischen Hoster wie GitHub Pages, der keinen Servercode
   ausfuehren kann.

   BENUTZUNG
     node scripts/fetch-players.mjs 76561198060265210 76561198012345678
     node scripts/fetch-players.mjs --datei spieler.txt
     node scripts/fetch-players.mjs 7656... --ersetzen

   Ohne --ersetzen werden vorhandene Eintraege behalten und nur aufgefrischt;
   die Liste waechst also mit jedem Lauf.

   OPTIONEN
     --datei <pfad>   SteamIDs aus einer Textdatei lesen (eine pro Zeile,
                      "#" leitet einen Kommentar ein)
     --ersetzen       vorhandene js/players.json verwerfen statt ergaenzen
     --out <datei>    anderer Zielpfad als js/players.json

   Kein API-Key noetig: Gelesen wird die oeffentliche Profilseite als XML.
   Ist STEAM_API_KEY gesetzt, wird stattdessen die offizielle Web-API benutzt.

   WARUM VORAB UND NICHT IM BROWSER?
   steamcommunity.com und api.steampowered.com schicken keine CORS-Header —
   nachgemessen, alle drei Endpunkte werden vom Browser blockiert. Ein
   statischer Hoster hat aber niemanden, der stellvertretend fragen koennte.
   Also fragt dieses Skript vorher, und die Antwort liegt als Datei bereit.
   ══════════════════════════════════════════════════════════════════════════ */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const UA = 'Mozilla/5.0 (compatible; TTT-LoadingScreen/1.0)';

/* ── Argumente ─────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const ersetzen = args.includes('--ersetzen');

function argWert(name, standard) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : standard;
}

const OUT = argWert('--out', 'js/players.json');
const DATEI = argWert('--datei', null);

let ids = args.filter(a => /^\d{17}$/.test(a));

if (DATEI) {
  const roh = await readFile(DATEI, 'utf8');
  for (const zeile of roh.split(/\r?\n/)) {
    const wert = zeile.split('#')[0].trim();
    if (/^\d{17}$/.test(wert)) ids.push(wert);
  }
}

ids = [...new Set(ids)];

if (!ids.length) {
  console.error('Fehler: keine gueltige SteamID64 angegeben (17 Ziffern).\n');
  console.error('  node scripts/fetch-players.mjs <steamid> [weitere] [--datei liste.txt]\n');
  process.exit(1);
}

/* ── Abruf ─────────────────────────────────────────────────────────────── */
const apiKey = process.env.STEAM_API_KEY || '';

function feld(xml, name) {
  const m = xml.match(new RegExp('<' + name + '>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</' + name + '>'));
  return m ? m[1].trim() : '';
}

/** Oeffentliche Profilseite als XML — ohne Key, ohne Registrierung. */
async function ohneKey(steamid) {
  const res = await fetch(`https://steamcommunity.com/profiles/${steamid}?xml=1`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en' }
  });
  if (!res.ok) return null;

  const xml = await res.text();
  const name = feld(xml, 'steamID');
  const avatar = feld(xml, 'avatarFull') || feld(xml, 'avatarMedium');
  return (name || avatar) ? { name: name || 'Unbekannt', avatar } : null;
}

/** Offizielle Web-API — bis zu 100 IDs auf einmal. */
async function mitKey(steamids) {
  const url = 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/'
            + '?key=' + encodeURIComponent(apiKey)
            + '&steamids=' + steamids.join(',');

  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return {};

  const data = await res.json();
  const treffer = {};
  for (const p of (data.response && data.response.players) || []) {
    treffer[p.steamid] = {
      name: p.personaname || 'Unbekannt',
      avatar: p.avatarfull || p.avatarmedium || ''
    };
  }
  return treffer;
}

/* ── Bestehenden Stand einlesen ────────────────────────────────────────── */
let profile = {};
if (!ersetzen) {
  try {
    const alt = JSON.parse(await readFile(OUT, 'utf8'));
    profile = alt.spieler || {};
  } catch (e) { /* noch keine Datei — das ist der Normalfall beim ersten Lauf */ }
}

console.log(`\n${ids.length} SteamID(s), Abruf ${apiKey ? 'ueber die Web-API' : 'ohne API-Key'}:`);

let ok = 0, fehler = 0;

if (apiKey) {
  for (let i = 0; i < ids.length; i += 100) {
    const treffer = await mitKey(ids.slice(i, i + 100));
    for (const [id, daten] of Object.entries(treffer)) { profile[id] = daten; ok++; }
    process.stdout.write(`\r  ${Math.min(i + 100, ids.length)} / ${ids.length}`);
  }
} else {
  for (let i = 0; i < ids.length; i++) {
    try {
      const daten = await ohneKey(ids[i]);
      if (daten) { profile[ids[i]] = daten; ok++; } else { fehler++; }
    } catch (e) {
      fehler++;
    }
    process.stdout.write(`\r  ${i + 1} / ${ids.length}  (${ok} ok, ${fehler} ohne Treffer)`);
    await new Promise(r => setTimeout(r, 150));   // hoeflich zu Steam bleiben
  }
}
process.stdout.write('\n');

/* ── Schreiben ─────────────────────────────────────────────────────────── */
const index = {
  erzeugt: new Date().toISOString(),
  anzahl: Object.keys(profile).length,
  spieler: profile
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(index, null, 1), 'utf8');

console.log(`\n✓ ${OUT} geschrieben — ${index.anzahl} Profile insgesamt.`);
if (fehler) {
  console.log(`  ${fehler} ID(s) ohne Treffer. Meist ein geloeschtes Konto oder ein Tippfehler.`);
}
console.log('\nDer Ladebildschirm nutzt die Datei automatisch (config.playersIndex).');
console.log('Wer nicht darin steht, bekommt weiterhin das erzeugte Muster.\n');
