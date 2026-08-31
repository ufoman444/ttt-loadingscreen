<?php
/* ══════════════════════════════════════════════════════════════════════════
   OPTIONAL: Steam-Profil-Proxy
   Holt echten Namen + Avatar zur SteamID64 über die Steam Web API.

   Warum ein Proxy?
   Der API-Key darf NIEMALS im JavaScript stehen — der Ladebildschirm ist für
   jeden Spieler im Klartext lesbar. Deshalb fragt die Seite dieses kleine
   PHP-Skript, und nur das Skript kennt den Key.

   EINRICHTEN
   1. Kostenlosen API-Key holen: https://steamcommunity.com/dev/apikey
   2. Key als Umgebungsvariable STEAM_API_KEY setzen (siehe unten).
   3. Diese Datei auf einen PHP-fähigen Webspace legen.
   4. In js/config.js eintragen:
         profileEndpoint: 'proxy/steam.php?steamid={steamid}'

   Braucht dein Hoster kein PHP (GitHub Pages, Cloudflare Pages, Netlify …),
   nimm stattdessen proxy/steam-function.js — dort steht die serverless-Variante.
   ══════════════════════════════════════════════════════════════════════════ */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=600');
header('X-Content-Type-Options: nosniff');

/* Liegt die Seite auf einem anderen Host als dieses Skript - etwa auf GitHub
   Pages -, verwirft der Browser die Antwort ohne diese Kopfzeile. Herausgegeben
   werden nur oeffentliche Steam-Daten, deshalb ist die Freigabe unbedenklich.
   Auf die eigene Seite beschraenken: ALLOWED_ORIGIN als Umgebungsvariable. */
header('Access-Control-Allow-Origin: ' . (getenv('ALLOWED_ORIGIN') ?: '*'));
header('Vary: Origin');

/* Ein Key ist optional. Ist keiner gesetzt, geht es ueber die oeffentliche
   Profilseite als XML - die liefert Name und Avatar ohne jede Anmeldung.
   Der Key darf ausschliesslich aus der Umgebung kommen, niemals aus dem Code. */
$apiKey = getenv('STEAM_API_KEY');

/* Eingabe hart validieren: eine SteamID64 ist genau 17 Ziffern. */
$steamid = isset($_GET['steamid']) ? (string) $_GET['steamid'] : '';
if (!preg_match('/^\d{17}$/', $steamid)) {
    http_response_code(400);
    echo json_encode(['error' => 'ungueltige SteamID']);
    exit;
}

/* Kleiner Dateicache, damit Steam bei vollen Servern nicht bombardiert wird. */
$cacheFile = sys_get_temp_dir() . '/ttt_steam_' . $steamid . '.json';
if (is_file($cacheFile) && (time() - filemtime($cacheFile)) < 3600) {
    echo file_get_contents($cacheFile);
    exit;
}

$url = $apiKey
    ? 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/'
      . '?key=' . urlencode($apiKey) . '&steamids=' . urlencode($steamid)
    : 'https://steamcommunity.com/profiles/' . urlencode($steamid) . '?xml=1';

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 5,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_USERAGENT      => 'TTT-LoadingScreen/1.0',
]);
$raw  = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($raw === false || $code !== 200) {
    http_response_code(502);
    echo json_encode(['error' => 'Steam nicht erreichbar']);
    exit;
}

/** Holt ein CDATA-Feld aus der Profil-XML. */
function xmlFeld(string $xml, string $name): string {
    $muster = '#<' . $name . '>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</' . $name . '>#s';
    return preg_match($muster, $xml, $t) ? trim($t[1]) : '';
}

if ($apiKey) {
    $data   = json_decode($raw, true);
    $player = $data['response']['players'][0] ?? null;
    $name   = $player['personaname'] ?? '';
    $avatar = $player['avatarfull'] ?? ($player['avatarmedium'] ?? '');
} else {
    $name   = xmlFeld($raw, 'steamID');
    $avatar = xmlFeld($raw, 'avatarFull') ?: xmlFeld($raw, 'avatarMedium');
}

if (!$name && !$avatar) {
    http_response_code(404);
    echo json_encode(['error' => 'Profil nicht gefunden']);
    exit;
}

/* Nur das herausgeben, was der Ladebildschirm wirklich braucht. */
$out = json_encode(['name' => $name ?: 'Unbekannt', 'avatar' => $avatar]);

@file_put_contents($cacheFile, $out);
echo $out;
