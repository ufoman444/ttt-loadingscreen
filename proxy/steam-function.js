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

/* Für die Tests herausgereicht; stört weder Cloudflare noch Netlify. */
export { feld, ohneKey, mitKey };

/* ── Cloudflare Pages Functions ──────────────────────────────────────────── */
export async function onRequest(context) {
  return behandle(context.request, context.env);
}

/* ── Netlify Functions ───────────────────────────────────────────────────── */
export default async (request, context) => {
  const env = (typeof process !== 'undefined' && process.env)
    ? process.env
    : (context && context.env);
  return behandle(request, env);
};
