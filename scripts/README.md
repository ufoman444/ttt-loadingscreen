# Skripte

Alle Skripte laufen mit **Node 18 oder neuer** und brauchen keine Pakete.
Ausführen immer aus dem Projektordner heraus.

---

## `fetch-workshop-maps.mjs` — Map-Vorschaubilder holen

Liest eine Steam-Workshop-Sammlung aus und schreibt `js/maps.json`. Der
Ladebildschirm bedient sich dort automatisch.

```bash
node scripts/fetch-workshop-maps.mjs 1509773512
```

| Option | Wirkung |
|---|---|
| `--download` | Bilder zusätzlich nach `img/maps/` laden, damit der Ladebildschirm nicht von Steams CDN abhängt |
| `--strict` | Mapnamen nur aus dem Addon-**Titel** übernehmen, Beschreibungen ignorieren |
| `--all` | Auch Addons ohne `map`-Tag auswerten (normalerweise unerwünscht) |
| `--out <datei>` | Anderer Zielpfad als `js/maps.json` |

Mehrere Sammlungen gehen in einem Aufruf: einfach mehrere IDs hintereinander.

**Wie die Zuordnung funktioniert.** Steam verrät nicht, welche `.bsp` in einem
Addon steckt — es gibt schlicht keinen Endpunkt dafür. Das Skript erschließt den
Mapnamen deshalb so:

1. Nur Addons mit dem Tag `map` kommen überhaupt in Frage. Das siebt Waffen,
   ULX und Gamemodes aus.
2. Steht im **Titel** ein Name wie `ttt_...`, gilt der.
3. Sonst wird die **Beschreibung** durchsucht — aber nur Treffer übernommen,
   die zum Titel passen. Sonst reißt „[TTT] GSF Assault" die fremde Map
   `cs_assault` an sich, die es nur als benötigten Inhalt erwähnt.
4. Bleibt nichts übrig, ist das Addon trotzdem über seinen normalisierten
   Titel auffindbar (`TTT Concrete` findet `ttt_concrete`).

---

## `check-workshop-maps.mjs` — Index prüfen

```bash
node scripts/check-workshop-maps.mjs
```

Prüft drei Dinge:

* Ist jedes Vorschaubild bei Steam noch erreichbar?
* Beanspruchen zwei Addons denselben Mapnamen?
* Welche Maps hängen nur an der unscharfen Titel-Zuordnung?

Der letzte Punkt ist die Liste, die du einmal überfliegen solltest. Passt eine
Zuordnung nicht, trägst du die Map in `js/config.js` unter `mapImages` ein —
eigene Angaben haben immer Vorrang.

> Das Skript nutzt bewusst **GET mit Range-Header statt HEAD**: Steams
> Bild-CDN beantwortet HEAD für einen Teil der Bilder mit 404, obwohl dasselbe
> Bild per GET einwandfrei kommt. Ein HEAD-Test meldet also Fehler, die keine sind.

---

## `lib/mapnames.mjs` — die Zuordnungslogik

Kein ausführbares Skript, sondern das Modul mit der Erfahrungslogik hinter der
Zuordnung „Addon → Mapname". Wird von `fetch-workshop-maps.mjs` benutzt und in
`tests/mapnames.test.mjs` geprüft.

Wenn du `PREFIXE` erweiterst oder an `passtZumTitel` schraubst:

```bash
npm test
```

Die Tests enthalten echte Fälle aus Workshop-Sammlungen — sie müssen grün
bleiben, sonst beansprucht wieder ein Addon eine fremde Map.

---

## `build-worker.mjs` — Helfer-Worker bauen

```bash
npm run build:worker
```

Erzeugt `dist/worker.js` — eine einzelne Datei zum Einfügen ins
Cloudflare-Dashboard. Sie beantwortet `/steam-profile` und `/map-preview` und
ist damit der Weg, echte Steam-Profile und die Live-Suche auch auf GitHub
Pages zu bekommen, das selbst keinen Code ausführt.

Die Datei wird aus `proxy/steam-function.js` und `proxy/map-preview-function.js`
zusammengebaut, jede in einem eigenen Gültigkeitsbereich. So gibt es keine
zweite Fassung der Logik, die irgendwann von der ersten abweicht. Nach jeder
Änderung an den Quellen neu bauen; `tests/worker.test.mjs` prüft das Ergebnis.

---

## `fetch-players.mjs` — Profile vorab holen (optional)

```bash
node scripts/fetch-players.mjs 76561198060265210 76561198012345678
node scripts/fetch-players.mjs --datei stammspieler.txt
```

Schreibt `js/players.json` mit Name und Avatar. Nur interessant, wenn du
keinen Worker einrichten willst: Dann bekommen wenigstens die dort
eingetragenen Spieler ihr echtes Profil. Mit Worker ist das überflüssig — der
deckt jeden ab, auch neue Spieler.

Kein API-Key nötig. Ohne `--ersetzen` wächst die Liste bei jedem Lauf.

---

## `dev-server.mjs` — lokal testen

```bash
node scripts/dev-server.mjs
```

Liefert den Ladebildschirm auf <http://localhost:8123> aus **und** stellt die
Live-Suche unter `/map-preview` bereit — also genau das, was später auf dem
Webspace läuft, ohne PHP oder Cloudflare.

```
http://localhost:8123/index.html?steamid=76561198012345678&map=ttt_forest
```

Meldet sich innerhalb von 4 Sekunden keine Spiel-Engine, schaltet die Seite in
einen Vorschaumodus und simuliert den Ladefortschritt.
