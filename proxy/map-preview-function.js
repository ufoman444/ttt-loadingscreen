/* ══════════════════════════════════════════════════════════════════════════
   LIVE-SUCHE NACH MAP-VORSCHAUBILDERN  (Serverless Function)

   Sucht zu einem Mapnamen das passende Workshop-Addon und liefert dessen
   Vorschaubild zurück. Damit bekommen auch Maps ein Bild, die es beim letzten
   Lauf von scripts/fetch-workshop-maps.mjs noch gar nicht gab.

   Kein Steam-API-Key nötig — die Workshop-Suche ist öffentlich.

   WARUM ÜBERHAUPT SERVERSEITIG?
   Steam schickt keine CORS-Header. Der Browser des Spielers darf die Suche
   also nicht selbst aufrufen, ein kleiner Vermittler muss dazwischen.

   ── Cloudflare Pages ──────────────────────────────────────────────────────
   Datei ablegen unter:  functions/map-preview.js
   In js/config.js:      mapLookupEndpoint: '/map-preview?map={map}'

   ── Netlify ───────────────────────────────────────────────────────────────
   Datei ablegen unter:  netlify/functions/map-preview.js
   In js/config.js:      mapLookupEndpoint: '/.netlify/functions/map-preview?map={map}'
   ══════════════════════════════════════════════════════════════════════════ */

const CACHE_SECONDS = 86400;      // ein Tag; Workshop-Bilder ändern sich selten
const SUCHE = 'https://steamcommunity.com/workshop/browse/';
const GMOD_APPID = 4000;

/* Präfixe, die zum Kern eines Mapnamens nicht dazugehören. */
const PREFIXE = ['ttt', 'gm', 'de', 'cs', 'zs', 'ph', 'dm', 'rp', 'mu', 'ba', 'aim', 'surf', 'jb'];

function kern(s) {
  return String(s).toLowerCase()
    .replace(/\.bsp$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(new RegExp(String.raw`\b(${PREFIXE.join('|')})\b`, 'g'), ' ')
    .replace(/\s+/g, '');
}

/* Versionsanhängsel weg: ttt_rooftops_a3 und ttt_rooftops_2016 sind dieselbe
   Map in zwei Fassungen — als Vorschaubild ist das allemal besser als nichts. */
function ohneVersion(s) {
  return String(s).toLowerCase()
    .replace(/\.bsp$/, '')
    .replace(/_(v|b|a|beta|alpha|rc)?\d+[a-z]?$/, '')
    .replace(/_(final|fix|fixed|se|remake|redux|day|night|winter)$/, '');
}

/* Wie gut passt ein gefundenes Addon zum gesuchten Mapnamen?
   3 = Titel enthält den Mapnamen wörtlich, 2 = Kern identisch,
   1 = Kern ohne Version identisch, 0 = passt nicht. */
function guete(map, titel) {
  const t = String(titel).toLowerCase();
  if (t.includes(map.toLowerCase())) return 3;

  const a = kern(map), b = kern(titel);
  if (a.length >= 4 && b.length >= 4) {
    if (a === b) return 2;
    const av = kern(ohneVersion(map)), bv = kern(ohneVersion(titel));
    if (av.length >= 4 && (av === bv || av.startsWith(bv) || bv.startsWith(av))) return 1;
  }
  return 0;
}

/* Aus der Ergebnisseite (id, Bild, Titel) herausziehen. Die Suchseite ist eine
   React-App ohne stabile CSS-Klassen — der Link-gefolgt-von-Bild-Aufbau ist
   aber seit Jahren gleich, und das alt-Attribut trägt den Titel. */
const TREFFER_RE = /filedetails\/\?id=(\d+)"[^>]*>\s*<img\s+src="([^"]+)"[^>]*alt="([^"]*)"/g;

function parseTreffer(html) {
  const out = [];
  const gesehen = new Set();
  for (const m of html.matchAll(TREFFER_RE)) {
    const [, id, img, titel] = m;
    if (gesehen.has(id)) continue;
    gesehen.add(id);
    out.push({
      id,
      /* Ohne Query-String liefert Steam das Bild in voller Auflösung
         statt der 288-Pixel-Briefmarke aus der Ergebnisliste. */
      img: img.split('?')[0].replace(/&amp;/g, '&'),
      titel: titel.replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    });
    if (out.length >= 12) break;
  }
  return out;
}

async function suche(map) {
  const url = `${SUCHE}?appid=${GMOD_APPID}&searchtext=${encodeURIComponent(map)}`
            + '&browsesort=textsearch&section=readytouseitems&requiredtags%5B%5D=map';

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TTT-LoadingScreen/1.0)',
      'Accept-Language': 'en'
    }
  });
  if (!res.ok) return null;

  const treffer = parseTreffer(await res.text());
  if (!treffer.length) return null;

  /* Bestbewerteten Treffer nehmen — lieber gar kein Bild als ein falsches. */
  let bester = null, besteGuete = 0;
  for (const t of treffer) {
    const g = guete(map, t.titel);
    if (g > besteGuete) { besteGuete = g; bester = t; }
    if (g === 3) break;
  }
  return bester ? { ...bester, guete: besteGuete } : null;
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      /* Auch Fehlschläge cachen — sonst sucht jeder Beitritt erneut vergeblich. */
      'Cache-Control': `public, max-age=${status && status !== 200 ? 3600 : CACHE_SECONDS}`,
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function behandle(request, env) {
  const map = (new URL(request.url).searchParams.get('map') || '').toLowerCase().trim();

  /* Mapnamen sind kurz und harmlos — alles andere fliegt raus. */
  if (!/^[a-z0-9][a-z0-9_\-]{2,63}$/.test(map)) {
    return json({ error: 'ungueltiger Mapname' }, 400);
  }

  /* Cloudflare: Antwort im Edge-Cache ablegen. */
  const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  if (cache) {
    const treffer = await cache.match(cacheKey);
    if (treffer) return treffer;
  }

  let antwort;
  try {
    const fund = await suche(map);
    antwort = fund
      ? json({ img: fund.img, titel: fund.titel, id: fund.id, guete: fund.guete })
      : json({ error: 'nichts gefunden' }, 404);
  } catch (e) {
    antwort = json({ error: 'Workshop nicht erreichbar' }, 502);
  }

  if (cache && antwort.status === 200) {
    try { await cache.put(cacheKey, antwort.clone()); } catch (e) { /* egal */ }
  }
  return antwort;
}

/* Für die Tests herausgereicht. Zusätzliche Exporte stören weder Cloudflare
   noch Netlify — beide suchen nur nach onRequest bzw. dem Standard-Export. */
export { kern, ohneVersion, guete, parseTreffer };

/* ── Cloudflare Pages Functions ──────────────────────────────────────────── */
export async function onRequest(context) {
  return behandle(context.request, context.env);
}

/* ── Netlify Functions ───────────────────────────────────────────────────── */
export default async (request, context) => behandle(request, context && context.env);
