#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   ENTWICKLUNGS-SERVER

   Liefert den Ladebildschirm lokal aus UND stellt die Live-Suche unter
   /map-preview bereit — so kannst du alles testen, was später auf dem
   Webspace läuft, ohne PHP oder Cloudflare.

     node scripts/dev-server.mjs
     → http://localhost:8123/index.html?steamid=76561198012345678&map=ttt_forest

   Nur zum Testen gedacht. Für den Produktivbetrieb nimmst du einen echten
   Webspace und eine der Dateien aus proxy/.
   ══════════════════════════════════════════════════════════════════════════ */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT) || 8123;
const WURZEL = process.cwd();

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg':  'image/jpeg', '.jpeg': 'image/jpeg',
  '.png':  'image/png',  '.webp': 'image/webp',
  '.svg':  'image/svg+xml', '.txt': 'text/plain; charset=utf-8'
};

/* Die Live-Suche stammt aus derselben Datei, die später bei Cloudflare läuft. */
const mapPreview = await import(
  pathToFileURL(join(WURZEL, 'proxy', 'map-preview-function.js')).href
);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  /* ── Live-Suche ──────────────────────────────────────────────────────── */
  if (url.pathname === '/map-preview') {
    try {
      const antwort = await mapPreview.onRequest({
        request: new Request(url.toString()),
        env: process.env
      });
      const text = await antwort.text();
      res.writeHead(antwort.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(text);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e && e.message) }));
    }
    return;
  }

  /* ── Statische Dateien ───────────────────────────────────────────────── */
  let pfad = decodeURIComponent(url.pathname);
  if (pfad === '/' || pfad === '') pfad = '/index.html';

  /* Kein Ausbruch aus dem Projektordner. */
  const ziel = join(WURZEL, normalize(pfad).replace(/^([/\\])+/, ''));
  if (!ziel.startsWith(WURZEL)) {
    res.writeHead(403).end('verboten');
    return;
  }

  try {
    const inhalt = await readFile(ziel);
    res.writeHead(200, {
      'Content-Type': TYPEN[extname(ziel).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(inhalt);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('nicht gefunden: ' + pfad);
  }
});

server.listen(PORT, () => {
  console.log(`\nLadebildschirm läuft auf http://localhost:${PORT}`);
  console.log('Live-Suche unter          /map-preview?map=<mapname>');
  console.log('\nBeispiel:');
  console.log(`  http://localhost:${PORT}/index.html?steamid=76561198012345678&map=ttt_forest\n`);
});
