/* ══════════════════════════════════════════════════════════════════════════
   OPTIONAL: Steam-Profil-Proxy als Serverless Function
   Für kostenlose Hoster ohne PHP — Cloudflare Pages, Netlify, Vercel.

   Der Steam-API-Key bleibt serverseitig. Niemals in js/config.js schreiben.

   ── Cloudflare Pages ──────────────────────────────────────────────────────
   Datei ablegen unter:  functions/steam.js
   Key setzen:           Settings → Environment variables → STEAM_API_KEY
   In js/config.js:      profileEndpoint: '/steam?steamid={steamid}'

   ── Netlify ───────────────────────────────────────────────────────────────
   Datei ablegen unter:  netlify/functions/steam.js
   Key setzen:           Site settings → Environment variables → STEAM_API_KEY
   In js/config.js:      profileEndpoint: '/.netlify/functions/steam?steamid={steamid}'
   (Der Export unten funktioniert bei Netlify über den `handler`-Alias.)
   ══════════════════════════════════════════════════════════════════════════ */

const CACHE_SECONDS = 3600;

async function lookup(steamid, apiKey) {
  const url = 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/'
            + '?key=' + encodeURIComponent(apiKey)
            + '&steamids=' + encodeURIComponent(steamid);

  const res = await fetch(url, { headers: { 'User-Agent': 'TTT-LoadingScreen/1.0' } });
  if (!res.ok) return null;

  const data = await res.json();
  const players = data && data.response && data.response.players;
  if (!players || !players.length) return null;

  const p = players[0];
  return {
    name: p.personaname || 'Unbekannt',
    avatar: p.avatarfull || p.avatarmedium || ''
  };
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=' + CACHE_SECONDS,
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

/* ── Cloudflare Pages Functions ──────────────────────────────────────────── */
export async function onRequest(context) {
  const steamid = new URL(context.request.url).searchParams.get('steamid') || '';

  /* Eine SteamID64 hat genau 17 Ziffern. Alles andere fliegt raus. */
  if (!/^\d{17}$/.test(steamid)) return json({ error: 'ungueltige SteamID' }, 400);

  const apiKey = context.env && context.env.STEAM_API_KEY;
  if (!apiKey) return json({ error: 'STEAM_API_KEY ist nicht gesetzt' }, 500);

  try {
    const profile = await lookup(steamid, apiKey);
    return profile ? json(profile) : json({ error: 'Profil nicht gefunden' }, 404);
  } catch (e) {
    return json({ error: 'Steam nicht erreichbar' }, 502);
  }
}

/* ── Netlify Functions (gleiche Logik, anderer Einstiegspunkt) ───────────── */
export default async (request, context) => {
  const steamid = new URL(request.url).searchParams.get('steamid') || '';
  if (!/^\d{17}$/.test(steamid)) return json({ error: 'ungueltige SteamID' }, 400);

  const apiKey = (typeof process !== 'undefined' && process.env)
    ? process.env.STEAM_API_KEY
    : (context && context.env && context.env.STEAM_API_KEY);
  if (!apiKey) return json({ error: 'STEAM_API_KEY ist nicht gesetzt' }, 500);

  try {
    const profile = await lookup(steamid, apiKey);
    return profile ? json(profile) : json({ error: 'Profil nicht gefunden' }, 404);
  } catch (e) {
    return json({ error: 'Steam nicht erreichbar' }, 502);
  }
};
