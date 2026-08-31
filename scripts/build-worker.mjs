#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   FERTIGEN CLOUDFLARE-WORKER BAUEN

   Erzeugt dist/worker.js — eine einzelne Datei, die du im Cloudflare-Dashboard
   in den Editor einfuegst. Sie beantwortet beide Endpunkte:

       /steam-profile?steamid=<id>     echter Name und Avatar
       /map-preview?map=<mapname>      Vorschaubild aus dem Workshop

   WARUM GENERIERT UND NICHT VON HAND GESCHRIEBEN?
   Die Logik steht bereits in proxy/steam-function.js und
   proxy/map-preview-function.js. Eine handgeschriebene Kopie waere eine
   zweite Wahrheit, die irgendwann von der ersten abweicht. Dieses Skript
   klebt stattdessen die Originale zusammen — je in einen eigenen
   Gueltigkeitsbereich, damit sich gleichnamige Hilfsfunktionen nicht ins
   Gehege kommen.

     node scripts/build-worker.mjs
   ══════════════════════════════════════════════════════════════════════════ */

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const QUELLEN = [
  { name: 'steamProfil', datei: 'proxy/steam-function.js' },
  { name: 'mapVorschau', datei: 'proxy/map-preview-function.js' }
];

/**
 * Schneidet ein Modul vor seiner ersten export-Anweisung ab. Alle Exporte
 * stehen in beiden Dateien am Ende; uebrig bleibt der reine Rumpf mit der
 * Funktion `behandle`.
 * @param {string} quelltext
 * @returns {string}
 */
function rumpf(quelltext) {
  const zeilen = quelltext.split(/\r?\n/);
  const ersterExport = zeilen.findIndex(z => /^export\s/.test(z));
  if (ersterExport === -1) throw new Error('Keine export-Anweisung gefunden — Aufbau geaendert?');

  /* Kommentarblock direkt ueber dem ersten Export mit abschneiden. */
  let ende = ersterExport;
  while (ende > 0 && /^\s*(\/\*|\*|$)/.test(zeilen[ende - 1])) ende--;

  return zeilen.slice(0, ende).join('\n').trimEnd();
}

const teile = [];
for (const q of QUELLEN) {
  const quelltext = await readFile(q.datei, 'utf8');
  teile.push(
    `/* ─── aus ${q.datei} ─────────────────────────────────────────────── */\n` +
    `const ${q.name} = (function () {\n${rumpf(quelltext)}\n\n  return behandle;\n})();`
  );
}

const worker = `/* ══════════════════════════════════════════════════════════════════════════
   TTT LADEBILDSCHIRM — HELFER-WORKER

   ERZEUGT von scripts/build-worker.mjs. Nicht von Hand aendern, sondern die
   Quellen unter proxy/ bearbeiten und neu bauen.

   EINRICHTEN (einmalig, etwa fuenf Minuten)
     1. dash.cloudflare.com → Compute (Workers) → Create → Start from Hello World
     2. Diese ganze Datei in den Editor einfuegen, Deploy
     3. Die Adresse notieren, z. B. https://ttt-helfer.deinname.workers.dev
     4. In js/config.js eintragen:
          profileEndpoint:   'https://ttt-helfer.deinname.workers.dev/steam-profile?steamid={steamid}'
          mapLookupEndpoint: 'https://ttt-helfer.deinname.workers.dev/map-preview?map={map}'

   Kein Steam-API-Key noetig. Optional als Variable setzbar:
     STEAM_API_KEY    nutzt die offizielle Web-API statt der Profilseite
     ALLOWED_ORIGIN   beschraenkt den Zugriff auf deine Seite,
                      z. B. https://deinname.github.io
   ══════════════════════════════════════════════════════════════════════════ */

${teile.join('\n\n')}

/* ─── Verteiler ─────────────────────────────────────────────────────────── */
export default {
  async fetch(request, env) {
    const pfad = new URL(request.url).pathname;

    if (pfad.startsWith('/steam-profile')) return steamProfil(request, env);
    if (pfad.startsWith('/map-preview'))   return mapVorschau(request, env);

    return new Response(
      'TTT-Ladebildschirm — Helfer laeuft.\\n\\n' +
      'Endpunkte:\\n' +
      '  /steam-profile?steamid=<SteamID64>\\n' +
      '  /map-preview?map=<mapname>\\n',
      { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }
};
`;

await mkdir('dist', { recursive: true });
await writeFile('dist/worker.js', worker, 'utf8');

const zeilen = worker.split('\n').length;
console.log(`\n✓ dist/worker.js geschrieben — ${zeilen} Zeilen, ${(worker.length / 1024).toFixed(1)} KB.`);
console.log('\nInhalt kopieren und im Cloudflare-Editor einfuegen. Die Anleitung');
console.log('steht als Kommentar oben in der Datei.\n');
