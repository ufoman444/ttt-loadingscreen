# Datenwege: wie ein Vorschaubild zur Map kommt

Der Ladebildschirm kennt den Mapnamen (`ttt_minecraft_b5`) und braucht dazu ein
Bild. Dieses Dokument beschreibt, warum das erstaunlich umständlich ist und wie
das Projekt es löst.

## Das Grundproblem

Man würde erwarten: Mapname zur Steam-API schicken, Bild zurückbekommen. Beides
geht nicht.

**Es gibt keinen Endpunkt „welches Addon enthält Map X".** Die Workshop-API
verrät Titel, Beschreibung, Tags und Vorschaubild eines Addons — aber nicht,
welche Dateien darin stecken. Der Umweg über die `.gma`-Datei fällt ebenfalls
aus: `file_url` ist bei Workshop-Inhalten leer, die Auslieferung läuft über
Steams eigenes Verteilsystem, nicht über HTTP.

**Der Browser darf Steam gar nicht fragen.** `api.steampowered.com` schickt
keine CORS-Header. Nachgemessen:

```
$ curl -si '.../GetPublishedFileDetails/v1/' | grep -i access-control
(keine Ausgabe)
```

Ein `fetch()` aus dem Ladebildschirm heraus scheitert also grundsätzlich, egal
wie richtig die Anfrage ist.

Daraus folgt die Aufteilung: Die Zuordnung passiert **vorab** in einem Skript,
und für alles Unbekannte springt **serverseitig** eine Live-Suche ein.

## Weg 1: der Index (vorab, exakt)

```
Sammlungs-ID
   │
   ├─ GetCollectionDetails ────────► Liste der Addon-IDs
   │    (auch Sammlungen in Sammlungen, rekursiv)
   │
   ├─ GetPublishedFileDetails ─────► Titel, Beschreibung, Tags, preview_url
   │    (in 50er-Blöcken, ohne API-Key)
   │
   ├─ Filter: Tag "map" ───────────► nur echte Maps
   │
   ├─ Mapnamen erschließen ────────► scripts/lib/mapnames.mjs
   │
   └─ js/maps.json
```

Aufgerufen mit `node scripts/fetch-workshop-maps.mjs <sammlungs-id>`.

### Der Tag-Filter ist nicht optional

Eine typische Server-Sammlung besteht überwiegend aus Nicht-Maps. Gemessen an
einer echten Sammlung mit 249 Addons:

| | |
|---|---|
| Addons gesamt | 249 |
| davon mit Tag `map` | **89** |
| Waffen, ULX, Gamemodes, Basen | 153 |

Ohne diesen Filter beansprucht ein Waffen-Addon, das in seiner Beschreibung
eine Map erwähnt, deren Namen für sich — und der Ladebildschirm zeigt dann ein
Waffen-Icon als Map-Vorschau. Das Tag schreibt Garry's Mod **klein** (`map`),
nicht `Map`; der Vergleich ignoriert deshalb die Groß- und Kleinschreibung.

### Mapnamen erschließen

In dieser Reihenfolge, siehe `scripts/lib/mapnames.mjs`:

1. **Titel.** Steht dort `ttt_...`, ist die Sache klar. Deckt den Großteil ab.
2. **Beschreibung**, aber nur mit Treffern, die zum Titel passen.
3. **Normalisierter Titel** als Rückfallebene: `TTT Office` → `tttoffice`
   findet später die Map `ttt_office`. Diese Einträge stehen unter einem
   Schlüssel mit `@`-Präfix und gelten als unsicher.

Schritt 2 braucht die Passprüfung, sonst richtet er Schaden an. Beispiele aus
der Praxis:

| Addon | in der Beschreibung | Urteil |
|---|---|---|
| TTT Archives | `ttt_archives_ge5_v1b` | übernommen — ist seine Map |
| [TTT] GSF Assault | `cs_assault` | **abgelehnt** — nur benötigter Inhalt |
| Submerge \| TTT | `gm_gmall` | **abgelehnt** — fremde Map |
| TTT Zingyland | `de_thrill` | **abgelehnt** |
| TTT Zingyland | `ttt_zingyland_v2a` | übernommen |

Die Prüfung vergleicht die *Kerne* von Mapname und Titel, also beide ohne
Präfix und Sonderzeichen, und verlangt eine Übereinstimmung **am Anfang**:
`archives` passt zu `archivesge5v1b`, aber `assault` nicht zu `gsfassault`.
Alle Fälle stehen als Tests in `tests/mapnames.test.mjs`.

### Ergebnis in der Praxis

Für die 89 Maps der genannten Sammlung:

| | |
|---|---|
| eindeutig zugeordnet | 74 |
| nur über den normalisierten Titel | 16 |
| Vorschaubilder erreichbar | alle |

Die 16 unsicheren listet `node scripts/check-workshop-maps.mjs` auf. Stimmt
eine nicht, wird sie von Hand in `config.mapImages` eingetragen — eigene
Angaben schlagen jede Automatik.

## Weg 2: die Live-Suche (zur Laufzeit, für alles Neue)

Für Maps, die im Index fehlen — frisch abonniert, aus einer anderen Sammlung
oder mit abweichendem Namen:

```
Browser ──► eigener Endpunkt ──► steamcommunity.com/workshop/browse
                (proxy/)              ?searchtext=<map>&requiredtags[]=map
                   │
                   ├─ Treffer auswerten (ID, Bild, Titel)
                   ├─ bewerten (siehe unten)
                   └─ JSON: { img, titel, id, guete }
```

Die Community-Suche funktioniert ohne API-Key. Die eigentliche Workshop-Suche
der API (`IPublishedFileService/QueryFiles`) verlangt einen Key und antwortet
ohne ihn mit HTTP 403 — deshalb der Weg über die öffentliche Suchseite.

Eine Anfrage genügt: Die Ergebnisseite enthält Bild und Titel bereits. Sie ist
inzwischen eine React-Anwendung mit generierten Klassennamen, also nichts, woran
man sich festhalten könnte. Stabil ist der Aufbau
„Link auf das Item, direkt gefolgt vom Bild, dessen `alt` den Titel trägt" —
genau darauf greift `parseTreffer()` zu, abgesichert durch
`tests/map-preview.test.mjs`.

Vom Bild-URL wird der Query-String abgeschnitten: Die Suchseite verlinkt eine
288-Pixel-Briefmarke, ohne Parameter liefert dasselbe Bild die volle Auflösung.

### Bewertung der Treffer

Ein falsches Bild ist schlimmer als gar keins, deshalb wird jeder Treffer
eingestuft:

| Güte | Bedingung | Beispiel |
|---|---|---|
| 3 | Titel enthält den Mapnamen wörtlich | `ttt_minecraft_b5` → „ttt_minecraft_b5" |
| 2 | gleicher Kern | `ttt_office` → „TTT Office" |
| 1 | gleicher Kern ohne Versionsanhängsel | `ttt_rooftops_a3` → „ttt_rooftops_2016" |
| 0 | passt nicht — es wird nichts geliefert | `ttt_bank` → „TTT Juniper Lodge" |

Gemessene Antwortzeiten liegen bei 0,4–0,6 Sekunden, Ausreißer bis 3 Sekunden.
Ergebnisse werden einen Tag zwischengespeichert, Fehlschläge eine Stunde —
sonst sucht jeder Serverbeitritt aufs Neue vergeblich.

## Weg 3: nächtliche Auffrischung

Für rein statische Hoster ohne Serverfunktionen liegt
`.github/workflows/update-maps.yml` bei: Es führt das Index-Skript einmal pro
Nacht aus und committet `js/maps.json`, falls sich etwas geändert hat. Eine
neu aufgenommene Map hat damit am nächsten Tag ihr Bild, ohne Zutun.

## Reihenfolge im Browser

Am Ende probiert `resolveMapImage()` in `js/loading.js` alle Quellen durch und
nimmt die erste, die tatsächlich ein Bild lädt:

```
config.mapImages   →  js/maps.json  →  img/maps/<map>.jpg  →  Live-Suche  →  Platzhalter
```

Geprüft wird über ein `Image`-Objekt, nicht über einen HTTP-Aufruf: Ein Bild
darf von jeder Domain geladen werden, ein `fetch()` dorthin nicht.

## Fallstricke, die Zeit gekostet haben

**Steams Bild-CDN beantwortet HEAD mit 404.** Dieselbe URL liefert per GET eine
200 samt Bild. Ein Prüfskript, das mit HEAD arbeitet, meldet massenhaft Fehler,
die keine sind — `check-workshop-maps.mjs` verwendet deshalb GET mit
`Range: bytes=0-0`.

**Das CDN drosselt parallele Anfragen.** Acht gleichzeitige Abrufe beantwortet
es teilweise mit 404. Die Prüfung läuft daher der Reihe nach, mit Pause und
zwei Wiederholungen.

**Ein Addon kann mehrere Maps enthalten.** `js/maps.json` bildet deshalb
Mapname → Addon ab, nicht umgekehrt. Beanspruchen zwei Addons denselben Namen,
gewinnt das mit mehr Abonnenten — und das Prüfskript sagt Bescheid.
