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

/* Key ausschließlich aus der Umgebung — nicht hier hineinschreiben. */
$apiKey = getenv('STEAM_API_KEY');
if (!$apiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'STEAM_API_KEY ist nicht gesetzt']);
    exit;
}

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

$url = 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/'
     . '?key=' . urlencode($apiKey)
     . '&steamids=' . urlencode($steamid);

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

$data   = json_decode($raw, true);
$player = $data['response']['players'][0] ?? null;

if (!$player) {
    http_response_code(404);
    echo json_encode(['error' => 'Profil nicht gefunden']);
    exit;
}

/* Nur das herausgeben, was der Ladebildschirm wirklich braucht. */
$out = json_encode([
    'name'   => $player['personaname']  ?? 'Unbekannt',
    'avatar' => $player['avatarfull']   ?? ($player['avatarmedium'] ?? ''),
]);

@file_put_contents($cacheFile, $out);
echo $out;
