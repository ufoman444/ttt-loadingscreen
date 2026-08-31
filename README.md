# TTT Ladebildschirm

Ein Ladebildschirm für Garry's Mod / Trouble in Terrorist Town. Reines
HTML/CSS/JS, keine Build-Tools, keine Abhängigkeiten. Einbindung über
`sv_loadingurl` in der `server.cfg`.

**Enthalten:** Ladebalken mit echtem Download-Fortschritt · Serverregeln ·
Spielerprofil per SteamID · Map-Vorschau mit Name · abschaltbare
Hintergrundmusik (Fahrstuhlmusik inklusive, ohne Audiodatei).

---

## 1. Einbindung in die `server.cfg`

```
sv_loadingurl "https://deine-domain.de/ttt/index.html?steamid=%s&map=%m"
```

Danach Server neu starten. Fertig.

### Welche Platzhalter gibt es?

Garry's Mod ersetzt in `sv_loadingurl` **genau zwei** Platzhalter:

| Platzhalter | Wird ersetzt durch |
|-------------|--------------------|
| `%s`        | SteamID64 des beitretenden Spielers |
| `%m`        | Name der Map, die geladen wird |

**Zur Frage "brauche ich für die Map einen URL-Parameter?":**
Nein, zwingend nicht. Die Engine ruft beim Laden von sich aus die
JavaScript-Funktion `GameDetails(...)` auf und übergibt dort Servername,
Mapname, Slots, SteamID, Gamemode, Lautstärke und Sprache. Der Ladebildschirm
nutzt primär diesen Weg.

`?map=%m` ist trotzdem empfohlen: Der Mapname steht damit schon beim ersten
Frame fest, statt erst wenn der Callback eintrudelt — die Map-Karte flackert
also nicht kurz als "wird ermittelt…". Dasselbe gilt für `?steamid=%s`.

> **Wichtig:** Es gibt keinen Platzhalter für die *nächste* Map im Rotationsplan.
> Angezeigt wird die Map, in die der Spieler gerade lädt — für den Ladenden ist
> das genau die richtige. Willst du wirklich die übernächste Map anzeigen, muss
> ein serverseitiges Addon sie in eine JSON-Datei schreiben, die die Seite lädt.

---

## 2. Konfiguration

Alles Einstellbare steckt in **`js/config.js`**. Andere Dateien musst du nicht
anfassen.

### Regeln

```js
rules: [
  { text: 'Fässer-Kills sind erlaubt.', note: 'Physik ist keine Straftat.' },
  { text: 'freshmaster ist immer Traitor.', note: '…', traitor: true }
]
```

`traitor: true` färbt die Regel rot und setzt den Stempel daneben.

### Map-Bilder — kommen automatisch

Du musst keine Bilder von Hand ablegen. Der Ladebildschirm sucht das
Vorschaubild in dieser Reihenfolge und nimmt das erste, das lädt:

| # | Quelle | Wann |
|---|--------|------|
| 1 | `config.mapImages` | Deine eigene Angabe. Hat immer Vorrang |
| 2 | `js/maps.json` | Index aus deiner Workshop-Sammlung (siehe unten) |
| 3 | `img/maps/<mapname>.jpg\|png\|webp` | Falls du doch ein eigenes Bild hinlegst |
| 4 | **Live-Suche im Workshop** | Für Maps, die in keiner der Quellen stehen |
| 5 | Platzhalterkarte | Wenn wirklich nichts zu finden war |

#### Einmalig: Index aus deiner Sammlung erzeugen

```bash
node scripts/fetch-workshop-maps.mjs 1509773512
```

Die Zahl ist die ID deiner Sammlung aus deren URL. Das Skript schreibt
`js/maps.json`. Kein Steam-API-Key nötig.

Mit `--download` landen die Bilder zusätzlich in `img/maps/`, dann hängt der
Ladebildschirm nicht an Steams CDN.

Anschließend lohnt ein Blick auf den Prüfbericht:

```bash
node scripts/check-workshop-maps.mjs
```

#### Dauerhaft: neue Maps ganz ohne Zutun

Zwei Mechanismen, die sich ergänzen — beide optional:

**a) Live-Suche (sofort, für jede Map).** Findet sich im Index nichts, fragt
der Ladebildschirm eine kleine Schnittstelle, die das Addon live im Workshop
sucht. Eine Map, die du heute erst abonniert hast, hat damit sofort ein Bild.
Dafür kopierst du je nach Hoster eine Datei:

| Hoster | Datei ablegen als | `mapLookupEndpoint` in `js/config.js` |
|---|---|---|
| Cloudflare Pages | `functions/map-preview.js` | `/map-preview?map={map}` |
| Netlify | `netlify/functions/map-preview.js` | `/.netlify/functions/map-preview?map={map}` |
| Webspace mit PHP | `proxy/map-preview.php` | `proxy/map-preview.php?map={map}` |

Vorlage ist `proxy/map-preview-function.js` bzw. `proxy/map-preview.php`. Auch
hier: kein API-Key. Ohne so eine Schnittstelle bleibt es beim Index — dann
`mapLookupEndpoint` einfach auf `''` setzen.

**b) Nächtliche Auffrischung (für rein statische Hoster).** Liegt das Projekt
auf GitHub, hält `.github/workflows/update-maps.yml` den Index von selbst
aktuell: einmal pro Nacht Sammlung auslesen, `js/maps.json` committen. Du musst
nur die Variable `COLLECTION_ID` im Repository setzen — die Datei erklärt das
Schritt für Schritt.

#### Was das Skript nicht kann

Steam verrät nicht, welche `.bsp` in einem Addon steckt — dafür gibt es keinen
Endpunkt. Der Mapname wird deshalb aus Tag, Titel und Beschreibung erschlossen.
Bei einer echten Sammlung mit 249 Addons (davon 89 Maps) waren 74 Zuordnungen
eindeutig und 16 hingen nur am normalisierten Titel. Letztere listet das
Prüfskript einzeln auf. Passt eine davon nicht, trägst du die Map in
`config.mapImages` ein — das gewinnt gegen alles andere.

Eigenes Bild machen: im Spiel die Konsole öffnen und `jpeg` eingeben.
(404-Meldungen in der Browser-Konsole beim Durchprobieren der Bildpfade sind
normal und harmlos.)

### Musik

```js
music: {
  mode: 'elevator',   // 'elevator' | 'url' | 'off'
  musicUrl: '',       // bei mode:'url' z. B. 'https://cdn.../lobby.mp3'
  volume: 0.35,
  respectGameVolume: true
}
```

* **`elevator`** (Standard) erzeugt die Fahrstuhlmusik live im Browser über die
  Web Audio API — vier Takte ii-V-I-Kitsch mit Pad, Bass, Lead und sehr
  höflichem Hi-Hat. Keine Datei, kein Traffic, keine Lizenzfrage.
* **`url`** spielt deine eigene Datei. Achte darauf, dass sie per HTTPS
  erreichbar ist und CORS nicht blockiert.
* `respectGameVolume` koppelt die Lautstärke an den Regler des Spielers, den
  GMod über `GameDetails` mitschickt.

#### Bedienung durch die Spieler

Oben rechts sitzt eine Bedieneinheit aus **Stummschalter und
Lautstärkeregler**:

* Der Regler wirkt sofort, ohne Neuladen.
* Ganz nach links gezogen ist die Musik aus; beim Hochziehen läuft sie von
  selbst wieder an.
* Der Lautsprecher-Knopf schaltet stumm und merkt sich dabei die vorherige
  Lautstärke — ein zweiter Klick holt genau sie zurück.
* Lautstärke und Stumm-Zustand überleben das Neuladen (`localStorage`), gelten
  aber nur für den jeweiligen Spieler.
* Blockiert der Browser den Autostart, beschriftet sich der Knopf mit
  "Musik starten" und macht dezent auf sich aufmerksam.

`volume` in der Konfiguration ist der **Startwert** des Reglers. Hat ein
Spieler schon einmal etwas eingestellt, gilt sein Wert. Bei
`respectGameVolume: true` wird das Ergebnis zusätzlich mit dem
GMod-Lautstärkeregler multipliziert — wer das Spiel stumm gestellt hat, hört
also auch hier nichts.

### Spielerprofil

Ohne Zusatzaufwand zeigt der Screen SteamID64, Profil-Link, einen aus der ID
erzeugten Avatar und ein humoristisches Täterprofil (Deckname, Verdachtsstufe,
Fässer-Affinität …). Alle Werte sind aus der SteamID abgeleitet — derselbe
Spieler bekommt also immer dasselbe Profil.

Für **echten Steam-Namen und Avatar** brauchst du einen kleinen Server-Proxy,
weil der Steam-API-Key niemals im Client stehen darf:

* `proxy/steam.php` — für Webspace mit PHP
* `proxy/steam-function.js` — für Cloudflare Pages / Netlify / Vercel

Dann in `js/config.js`:

```js
profileEndpoint: 'proxy/steam.php?steamid={steamid}'
```

API-Key gibt es kostenlos unter <https://steamcommunity.com/dev/apikey> und er
gehört in eine Umgebungsvariable `STEAM_API_KEY`, nicht in den Code.

---

## 3. Kostenlose Hosting-Möglichkeiten

Die Seite ist statisch — jeder Webspace tut es. Diese Anbieter sind kostenlos
und für genau diesen Zweck geeignet:

| Anbieter | Statisch | Serverseitig (Steam-Proxy) | Anmerkungen |
|---|---|---|---|
| **Cloudflare Pages** | ja | ja, *Pages Functions* | Meine Empfehlung: schnell, HTTPS, eigene Domain möglich, großzügiges Limit. Hier laufen Live-Suche und Steam-Proxy |
| **GitHub Pages** | ja | nein | Denkbar einfach. Auf dem Gratis-Tarif muss das Repo öffentlich sein. Keine Live-Suche — dafür hält der mitgelieferte Workflow den Map-Index nächtlich aktuell |
| **Netlify** | ja | ja, *Netlify Functions* | Deploy per Git oder Drag-and-drop des Ordners |
| **Vercel** | ja | ja, *Serverless Functions* | Der Hobby-Tarif ist für nicht-kommerzielle Nutzung gedacht — bei einem Server mit Shop/Spenden lieber Cloudflare nehmen |
| **GitLab Pages** | ja | nein | Alternative zu GitHub Pages |
| **Neocities** | ja | nein | Sehr simpel, Datei-Upload im Browser |
| **InfinityFree** u. ä. Gratis-PHP-Hoster | ja | ja (PHP) | Einzige Gratis-Option *mit* PHP. Dafür oft langsam, mit Werbeeinblendungen und Bot-Schutz — siehe Warnung unten |
| **Webspace deines GMod-Hosters** | ja | oft ja | Viele Anbieter legen zum Server einen FastDL-/Webspace dazu. Schon bezahlt, also nachschauen lohnt |

**Worauf du achten musst — sonst sieht der Spieler eine leere Seite:**

* Die URL muss **öffentlich über http/https erreichbar** sein. `localhost` oder
  eine LAN-IP funktioniert nicht, der Spieler lädt die Seite auf *seinem* Rechner.
* **Keine Zwischenseiten.** Gratis-Hoster, die eine Werbe-, Cookie- oder
  Bot-Schutz-Seite vorschalten (auch Cloudflares "Under Attack"-Modus), liefern
  dem Spielclient genau diese Seite statt deines Ladebildschirms.
* **HTTPS ist in Ordnung** und generell die bessere Wahl.
* Manche Spieler haben Ladebildschirme von Servern in ihren Einstellungen
  deaktiviert. Die sehen dann den Standardbildschirm — daran kannst du nichts
  ändern, und es ist auch kein Fehler deiner Seite.

**Deploy per Drag-and-drop (Cloudflare Pages / Netlify):** Ordner packen oder
hochladen, fertig. Die spätere URL trägst du in `sv_loadingurl` ein.

---

## 4. Lokal testen

```bash
node scripts/dev-server.mjs
```

Der Testserver liefert auch die Live-Suche unter `/map-preview` aus, du kannst
also alles testen. Ohne Node tut es zur Not auch `python -m http.server 8123` —
dann fehlt nur die Live-Suche.

Dann im Browser öffnen:

```
http://localhost:8123/index.html?steamid=76561198012345678&map=ttt_minecraft_b5
```

Meldet sich innerhalb von 4 Sekunden keine Engine, schaltet die Seite in einen
**Vorschaumodus** und simuliert den Ladefortschritt, damit du alles ansehen
kannst. Sobald ein echter GMod-Callback kommt, übernimmt sofort wieder der
echte Fortschritt.

---

## 5. Dateien

```
index.html                        Struktur
css/style.css                     Gestaltung (dunkles Grün-System)
js/config.js                      → hier stellst du alles ein
js/logger.js                      Protokoll (debug/info/warning/error)
js/util.js                        reine Logik: Mapnamen, Ladebalken, Index
js/music.js                       Musik-Engine (Fahrstuhlmusik + URL-Modus)
js/loading.js                     DOM, Netzwerk, die Callbacks der Engine
js/maps.json                      erzeugter Map-Index (nicht von Hand pflegen)
img/maps/                         eigene Map-Bilder, falls gewünscht

scripts/fetch-workshop-maps.mjs   Index aus der Workshop-Sammlung erzeugen
scripts/check-workshop-maps.mjs   Index prüfen (Bilder, Kollisionen, Unschärfen)
scripts/lib/mapnames.mjs          Zuordnung Addon → Mapname
scripts/dev-server.mjs            lokaler Testserver inkl. Live-Suche

tests/                            Tests (node --test, ohne Browser)

proxy/map-preview.php             Live-Suche nach Map-Bildern (PHP)
proxy/map-preview-function.js     dieselbe als Serverless Function
proxy/steam.php                   optional: echter Steam-Name/Avatar (PHP)
proxy/steam-function.js           dieselbe als Serverless Function

docs/ARCHITECTURE.md              Aufbau und Entwurfsentscheidungen
docs/DATA-PIPELINE.md             wie ein Vorschaubild zur Map kommt
.github/workflows/update-maps.yml optional: nächtliche Index-Auffrischung
```

**Auf den Webspace gehört nur der obere Teil** — `index.html`, `css/`, `js/`,
`img/` und bei Bedarf `proxy/`. `scripts/`, `tests/` und `docs/` sind
Werkzeug und Dokumentation; sie schaden dort nicht, werden aber auch nicht
gebraucht.

Details zu den Skripten stehen in [scripts/README.md](scripts/README.md),
zum Aufbau in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Tests

```bash
npm test
```

64 Tests über `node --test`, ohne Abhängigkeiten und ohne Browser. Geprüft wird
die Logik, bei der ein Fehler still bliebe: Mapnamen-Zuordnung, Ladebalken,
URL-Parameter und das Auswerten der Workshop-Suche.

### Fehlersuche

Hängt der Ladebildschirm oder fehlt ein Bild, hilft `?debug=1` an der URL:

```
https://deine-domain.de/ttt/index.html?steamid=%s&map=%m&debug=1
```

Dann protokolliert die Seite jeden Schritt in die Browser-Konsole — welche
Bildquellen probiert wurden, ob der Index ankam, was die Live-Suche gefunden
hat. `TTTLog.history()` zeigt die letzten Meldungen.

### Welche Callbacks nutzt die Seite?

Die Engine ruft diese Funktionen von sich aus auf, ganz ohne Lua-Addon:

| Funktion | wofür der Ladebildschirm sie nutzt |
|---|---|
| `GameDetails(servername, serverurl, mapname, maxplayers, steamid, gamemode, volume, language)` | Servername, Map, Slots, Spielerprofil, Musiklautstärke |
| `SetFilesTotal(total)` / `SetFilesNeeded(needed)` | echter Fortschritt des Ladebalkens |
| `DownloadingFile(name)` | Statuszeile "Lade …" |
| `SetStatusChanged(status)` | Statuszeile des Verbindungsaufbaus |

---

## 6. Anpassen

* **Farben** stecken als CSS-Variablen ganz oben in `css/style.css` (`:root`).
  Eine andere Grünnuance ist eine Zeile Arbeit.
* **Tipps, Ladebalken-Sprüche, Map-Sprüche** stehen in `js/config.js`.
* **Servername** kommt automatisch aus dem `hostname` des Servers.
