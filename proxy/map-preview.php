<?php
/* ══════════════════════════════════════════════════════════════════════════
   LIVE-SUCHE NACH MAP-VORSCHAUBILDERN  (PHP-Variante)

   Gleiche Aufgabe wie proxy/map-preview-function.js, nur für Webspace mit PHP:
   Sucht zu einem Mapnamen das passende Workshop-Addon und gibt dessen
   Vorschaubild zurück. So bekommen auch nagelneue Maps sofort ein Bild.

   Kein Steam-API-Key nötig.

   EINRICHTEN
     Datei auf den Webspace legen, dann in js/config.js:
        mapLookupEndpoint: 'proxy/map-preview.php?map={map}'
   ══════════════════════════════════════════════════════════════════════════ */

declare(strict_types=1);

const CACHE_SEKUNDEN = 86400;
const PREFIXE = ['ttt', 'gm', 'de', 'cs', 'zs', 'ph', 'dm', 'rp', 'mu', 'ba', 'aim', 'surf', 'jb'];

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

/* Liegt die Seite auf einem anderen Host als dieses Skript - etwa auf GitHub
   Pages -, verwirft der Browser die Antwort ohne diese Kopfzeile. Herausgegeben
   werden nur oeffentliche Steam-Daten, deshalb ist die Freigabe unbedenklich.
   Auf die eigene Seite beschraenken: ALLOWED_ORIGIN als Umgebungsvariable. */
header('Access-Control-Allow-Origin: ' . (getenv('ALLOWED_ORIGIN') ?: '*'));
header('Vary: Origin');

/* ── Eingabe prüfen ────────────────────────────────────────────────────── */
$map = strtolower(trim((string) ($_GET['map'] ?? '')));
if (!preg_match('/^[a-z0-9][a-z0-9_\-]{2,63}$/', $map)) {
    header('Cache-Control: public, max-age=3600');
    http_response_code(400);
    echo json_encode(['error' => 'ungueltiger Mapname']);
    exit;
}

/* ── Cache ─────────────────────────────────────────────────────────────── */
$cacheDatei = sys_get_temp_dir() . '/ttt_map_' . $map . '.json';
if (is_file($cacheDatei) && (time() - filemtime($cacheDatei)) < CACHE_SEKUNDEN) {
    header('Cache-Control: public, max-age=' . CACHE_SEKUNDEN);
    echo file_get_contents($cacheDatei);
    exit;
}

/* ── Hilfsfunktionen ───────────────────────────────────────────────────── */
function kern(string $s): string {
    $s = strtolower(preg_replace('/\.bsp$/', '', $s));
    $s = preg_replace('/[^a-z0-9]+/', ' ', $s);
    $s = preg_replace('/\b(' . implode('|', PREFIXE) . ')\b/', ' ', $s);
    return preg_replace('/\s+/', '', $s);
}

function ohneVersion(string $s): string {
    $s = strtolower(preg_replace('/\.bsp$/', '', $s));
    $s = preg_replace('/_(v|b|a|beta|alpha|rc)?\d+[a-z]?$/', '', $s);
    return preg_replace('/_(final|fix|fixed|se|remake|redux|day|night|winter)$/', '', $s);
}

/* 3 = Titel enthält den Mapnamen wörtlich, 2 = Kern gleich,
   1 = Kern ohne Versionsanhängsel gleich, 0 = passt nicht. */
function guete(string $map, string $titel): int {
    if (str_contains(strtolower($titel), $map)) return 3;

    $a = kern($map); $b = kern($titel);
    if (strlen($a) >= 4 && strlen($b) >= 4) {
        if ($a === $b) return 2;
        $av = kern(ohneVersion($map)); $bv = kern(ohneVersion($titel));
        if (strlen($av) >= 4 && ($av === $bv || str_starts_with($av, $bv) || str_starts_with($bv, $av))) return 1;
    }
    return 0;
}

/* ── Workshop durchsuchen ──────────────────────────────────────────────── */
$url = 'https://steamcommunity.com/workshop/browse/?appid=4000'
     . '&searchtext=' . urlencode($map)
     . '&browsesort=textsearch&section=readytouseitems&requiredtags%5B%5D=map';

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 8,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; TTT-LoadingScreen/1.0)',
    CURLOPT_HTTPHEADER     => ['Accept-Language: en'],
]);
$html = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($html === false || $code !== 200) {
    http_response_code(502);
    echo json_encode(['error' => 'Workshop nicht erreichbar']);
    exit;
}

/* Die Ergebnisseite ist eine React-App ohne stabile CSS-Klassen. Der Aufbau
   "Link auf das Item, direkt gefolgt vom Bild mit Titel im alt-Attribut" ist
   dagegen stabil. */
preg_match_all(
    '#filedetails/\?id=(\d+)"[^>]*>\s*<img\s+src="([^"]+)"[^>]*alt="([^"]*)"#',
    $html, $treffer, PREG_SET_ORDER
);

$bester = null; $besteGuete = 0; $gesehen = [];
foreach ($treffer as $t) {
    [, $id, $bild, $titel] = $t;
    if (isset($gesehen[$id])) continue;
    $gesehen[$id] = true;

    $titel = html_entity_decode($titel, ENT_QUOTES, 'UTF-8');
    $g = guete($map, $titel);
    if ($g > $besteGuete) {
        $besteGuete = $g;
        /* Ohne Query-String liefert Steam das Bild in voller Auflösung. */
        $bester = ['img' => explode('?', html_entity_decode($bild, ENT_QUOTES, 'UTF-8'))[0],
                   'titel' => $titel, 'id' => $id, 'guete' => $g];
    }
    if ($g === 3) break;
    if (count($gesehen) >= 12) break;
}

if (!$bester) {
    header('Cache-Control: public, max-age=3600');
    http_response_code(404);
    echo json_encode(['error' => 'nichts gefunden']);
    exit;
}

$out = json_encode($bester);
@file_put_contents($cacheDatei, $out);

header('Cache-Control: public, max-age=' . CACHE_SEKUNDEN);
echo $out;
