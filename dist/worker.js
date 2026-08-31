/* ══════════════════════════════════════════════════════════════════════════
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

/* ─── aus proxy/steam-function.js ─────────────────────────────────────────────── */
const steamProfil = (function () {
/* ══════════════════════════════════════════════════════════════════════════
   ECHTER STEAM-NAME UND AVATAR  (Serverless Function)

   Liefert zu einer SteamID64 den Anzeigenamen und das Profilbild.

   Zwei Wege, der erste braucht keinerlei Anmeldung:

     1. Ohne Key: steamcommunity.com/profiles/<id>?xml=1
        Liefert Name und Avatar auch bei "nur Freunde"-Profilen. Reicht für
        einen Ladebildschirm vollkommen aus.
     2. Mit Key:  ISteamUser/GetPlayerSummaries
        Wird automatisch bevorzugt, sobald STEAM_API_KEY gesetzt ist —
        stabiler und offiziell unterstützt.

   WARUM SERVERSEITIG?
   Steam schickt keine CORS-Header. Der Browser des Spielers darf weder die
   API noch die Profilseite abfragen. Und ein API-Key hätte im Client ohnehin
   nichts verloren: Der Ladebildschirm ist für jeden lesbar.

   ── Cloudflare Pages ──────────────────────────────────────────────────────
   Datei ablegen unter:  functions/steam-profile.js
   In js/config.js:      profileEndpoint: '/steam-profile?steamid={steamid}'
   Key (optional):       Settings → Environment variables → STEAM_API_KEY

   ── Netlify ───────────────────────────────────────────────────────────────
   Datei ablegen unter:  netlify/functions/steam-profile.js
   In js/config.js:      profileEndpoint: '/.netlify/functions/steam-profile?steamid={steamid}'
   ══════════════════════════════════════════════════════════════════════════ */

const CACHE_SECONDS = 3600;
const UA = 'Mozilla/5.0 (compatible; TTT-LoadingScreen/1.0)';

/** Holt den Inhalt eines CDATA-Feldes aus der Profil-XML. */
function feld(xml, name) {
  const m = xml.match(new RegExp('<' + name + '>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</' + name + '>'));
  return m ? m[1].trim() : '';
}

/**
 * Weg 1: öffentliche Profilseite als XML. Kein Key, keine Registrierung.
 * @param {string} steamid
 * @returns {Promise<?{name: string, avatar: string}>}
 */
async function ohneKey(steamid) {
  const res = await fetch(`https://steamcommunity.com/profiles/${steamid}?xml=1`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en' }
  });
  if (!res.ok) return null;

  const xml = await res.text();
  const name = feld(xml, 'steamID');
  const avatar = feld(xml, 'avatarFull') || feld(xml, 'avatarMedium') || feld(xml, 'avatarIcon');
  if (!name && !avatar) return null;

  return { name: name || 'Unbekannt', avatar };
}

/**
 * Weg 2: offizielle Web-API. Wird genommen, sobald ein Key hinterlegt ist.
 * @param {string} steamid
 * @param {string} apiKey
 * @returns {Promise<?{name: string, avatar: string}>}
 */
async function mitKey(steamid, apiKey) {
  const url = 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/'
            + '?key=' + encodeURIComponent(apiKey)
            + '&steamids=' + encodeURIComponent(steamid);

  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;

  const data = await res.json();
  const spieler = data && data.response && data.response.players && data.response.players[0];
  if (!spieler) return null;

  return {
    name: spieler.personaname || 'Unbekannt',
    avatar: spieler.avatarfull || spieler.avatarmedium || ''
  };
}

/* ── CORS ─────────────────────────────────────────────────────────────────
   Liegt die Seite woanders als dieser Endpunkt — etwa auf GitHub Pages —
   ist jede Anfrage hierher fremdherkunft (cross-origin). Ohne diese Kopfzeile
   verwirft der Browser die Antwort, obwohl der Server sie sauber geliefert hat.

   Standardmaessig fuer alle Herkuenfte freigegeben: Der Endpunkt gibt nur
   oeffentliche Steam-Daten heraus, kennt keine Sitzung und keine Geheimnisse.
   Wer ihn auf die eigene Seite beschraenken will, setzt die Umgebungsvariable
   ALLOWED_ORIGIN, z. B. https://deinname.github.io
   ───────────────────────────────────────────────────────────────────────── */
function corsKopf(env) {
  const erlaubt = (env && env.ALLOWED_ORIGIN) || '*';
  return {
    'Access-Control-Allow-Origin': erlaubt,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin'
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${status && status !== 200 ? 600 : CACHE_SECONDS}`,
      'X-Content-Type-Options': 'nosniff',
      ...corsKopf(env)
    }
  });
}

async function behandle(request, env) {
  /* Vorabfrage des Browsers bei fremder Herkunft. */
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsKopf(env) });
  }

  const steamid = (new URL(request.url).searchParams.get('steamid') || '').trim();

  /* Eine SteamID64 hat genau 17 Ziffern. Alles andere fliegt raus. */
  if (!/^\d{17}$/.test(steamid)) return json({ error: 'ungueltige SteamID' }, 400, env);

  const apiKey = env && env.STEAM_API_KEY;

  try {
    const profil = apiKey ? await mitKey(steamid, apiKey) : await ohneKey(steamid);
    return profil ? json(profil, 200, env) : json({ error: 'Profil nicht gefunden' }, 404, env);
  } catch (e) {
    return json({ error: 'Steam nicht erreichbar' }, 502, env);
  }
}

  return behandle;
})();

/* ─── aus proxy/map-preview-function.js ─────────────────────────────────────────────── */
const mapVorschau = (function () {
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

/* ── CORS ─────────────────────────────────────────────────────────────────
   Liegt die Seite woanders als dieser Endpunkt — etwa auf GitHub Pages —
   ist jede Anfrage hierher fremdherkunft (cross-origin). Ohne diese Kopfzeile
   verwirft der Browser die Antwort, obwohl der Server sie sauber geliefert hat.

   Standardmaessig fuer alle Herkuenfte freigegeben: Der Endpunkt gibt nur
   oeffentliche Steam-Daten heraus, kennt keine Sitzung und keine Geheimnisse.
   Wer ihn auf die eigene Seite beschraenken will, setzt die Umgebungsvariable
   ALLOWED_ORIGIN, z. B. https://deinname.github.io
   ───────────────────────────────────────────────────────────────────────── */
function corsKopf(env) {
  const erlaubt = (env && env.ALLOWED_ORIGIN) || '*';
  return {
    'Access-Control-Allow-Origin': erlaubt,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin'
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      /* Auch Fehlschläge cachen — sonst sucht jeder Beitritt erneut vergeblich. */
      'Cache-Control': `public, max-age=${status && status !== 200 ? 3600 : CACHE_SECONDS}`,
      'X-Content-Type-Options': 'nosniff',
      ...corsKopf(env)
    }
  });
}

async function behandle(request, env) {
  /* Vorabfrage des Browsers bei fremder Herkunft. */
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsKopf(env) });
  }

  const map = (new URL(request.url).searchParams.get('map') || '').toLowerCase().trim();

  /* Mapnamen sind kurz und harmlos — alles andere fliegt raus. */
  if (!/^[a-z0-9][a-z0-9_\-]{2,63}$/.test(map)) {
    return json({ error: 'ungueltiger Mapname' }, 400, env);
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
      ? json({ img: fund.img, titel: fund.titel, id: fund.id, guete: fund.guete }, 200, env)
      : json({ error: 'nichts gefunden' }, 404, env);
  } catch (e) {
    antwort = json({ error: 'Workshop nicht erreichbar' }, 502, env);
  }

  if (cache && antwort.status === 200) {
    try { await cache.put(cacheKey, antwort.clone()); } catch (e) { /* egal */ }
  }
  return antwort;
}

/* Für die Tests herausgereicht. Zusätzliche Exporte stören weder Cloudflare
   noch Netlify — beide suchen nur nach onRequest bzw. dem Standard-Export. */

  return behandle;
})();

/* ─── Verteiler ─────────────────────────────────────────────────────────── */
export default {
  async fetch(request, env) {
    const pfad = new URL(request.url).pathname;

    if (pfad.startsWith('/steam-profile')) return steamProfil(request, env);
    if (pfad.startsWith('/map-preview'))   return mapVorschau(request, env);

    return new Response(
      'TTT-Ladebildschirm — Helfer laeuft.\n\n' +
      'Endpunkte:\n' +
      '  /steam-profile?steamid=<SteamID64>\n' +
      '  /map-preview?map=<mapname>\n',
      { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }
};
