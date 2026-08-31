# Architektur

Der Ladebildschirm ist eine statische Seite ohne Build-Schritt und ohne
Abhängigkeiten. Was der Browser lädt, liegt genau so im Repository. Node wird
nur für die Werkzeuge unter `scripts/` und die Tests gebraucht — nie zur
Laufzeit.

## Warum so schlicht?

Die Seite läuft im eingebetteten Browser von Garry's Mod, wird für wenige
Sekunden angezeigt und ist dann weg. Niemand hat dabei die Entwicklerkonsole
offen. Daraus folgen drei Entwurfsregeln, die sich durch den ganzen Code
ziehen:

1. **Nichts darf hart scheitern.** Fehlt ein Bild, ein Index oder ein
   Endpunkt, zeigt die Seite eben weniger — aber sie zeigt.
2. **Fehler verschwinden trotzdem nicht.** Jeder geschluckte Fehler geht an
   `js/logger.js`. Mit `?debug=1` sieht man den kompletten Ablauf.
3. **Kein Build.** Eine Datei ändern, hochladen, fertig. Wer den Server
   betreibt, ist selten auch Frontend-Entwickler.

## Dateien zur Laufzeit

Die Reihenfolge in `index.html` ist bewusst gewählt:

| Datei | Aufgabe |
|---|---|
| `js/config.js` | Alle Einstellungen. Die einzige Datei, die ein Admin anfasst |
| `js/logger.js` | Stufen `debug`/`info`/`warning`/`error`, Standard ab `warning` |
| `js/util.js` | Reine Logik ohne DOM: Hash, Mapnamen, Ladebalken, Index-Suche |
| `js/music.js` | Musik-Engine und Lautstärkeverwaltung |
| `js/loading.js` | Alles Übrige: DOM, Netzwerk, die Callbacks der Spiel-Engine |

`js/util.js` und `js/logger.js` funktionieren im Browser (`window.TTTUtil`,
`window.TTTLog`) genauso wie unter Node (`require`). Genau deshalb sind sie
getrennt: So lässt sich die Logik testen, ohne einen Browser zu starten.

## Woher die Daten kommen

Es gibt drei Quellen, und sie sind bewusst gestaffelt:

```
1. Engine-Callbacks   GameDetails, SetFilesTotal, SetFilesNeeded,
   (verlässlich)      DownloadingFile, SetStatusChanged
                      → ruft Garry's Mod von sich aus auf, ohne Addon

2. URL-Parameter      ?steamid=%s&map=%m
   (früh da)          → steht schon beim ersten Frame fest

3. js/config.js       serverName, fallbackGamemode, fallbackMaxPlayers
   (letzter Halt)     → nur relevant, wenn die Seite ohne Server läuft
```

Beim Start gilt zuerst die Konfiguration, dann überschreiben die
URL-Parameter, und sobald sich die Engine meldet, gewinnt sie. Deshalb
flackert nichts, auch wenn ein Callback ausbleibt.

Meldet sich nach vier Sekunden keine Engine, schaltet die Seite in einen
**Vorschaumodus** und simuliert den Fortschritt. Kommt danach doch noch ein
echter Callback, übernimmt sofort wieder die Engine — der Balken läuft
monoton, springt also nie zurück.

## Der Ladebalken

`U.progressTarget()` in `js/util.js` liefert den Zielwert, `frame()` in
`js/loading.js` nähert die Anzeige daran an. Die Aufteilung:

| Bereich | Woraus |
|---|---|
| 0 – 6 % | Zeitgesteuertes Anlaufen, solange nichts bekannt ist |
| 6 – 92 % | Echter Download-Fortschritt aus `SetFilesTotal`/`SetFilesNeeded` |
| 92 – 99 % | Langsames Kriechen, während der Client dem Server beitritt |

Die 100 % erreicht der Balken nie — das Spiel nimmt den Bildschirm vorher weg.
Ein Balken, der bei 100 % stehen bleibt und nichts passiert, sieht kaputt aus;
einer, der bei 98 % verschwindet, sieht schnell aus.

## Das Vorschaubild

Fünf Quellen, die erste, die tatsächlich lädt, gewinnt:

```
config.mapImages   →  js/maps.json  →  img/maps/<map>.jpg  →  Live-Suche  →  Platzhalter
   (eigene Angabe)     (Index)          (lokale Datei)        (Workshop)
```

Geprüft wird nicht, ob eine Datei existiert, sondern ob ein `Image` sie lädt —
das funktioniert auch über fremde Domains hinweg, wo ein HTTP-Aufruf an CORS
scheitern würde. Details in [DATA-PIPELINE.md](DATA-PIPELINE.md).

Ein Zähler (`state.imageRun`) verhindert, dass ein spät eintreffendes Bild aus
einem früheren Suchlauf ein besseres überschreibt.

## Musik

`js/music.js` kennt zwei Betriebsarten:

* **`elevator`** erzeugt die Musik zur Laufzeit über die Web Audio API — vier
  Takte ii-V-I in C-Dur mit Pad, Bass, Lead und Hi-Hat, geplant über einen
  Scheduler mit 120 ms Vorlauf. Keine Datei, kein Traffic, keine Lizenzfrage.
* **`url`** spielt eine gewöhnliche Audiodatei über ein `<audio>`-Element.

Die Ausgabelautstärke ist das Produkt aus dem Regler auf der Seite und — falls
`respectGameVolume` gesetzt ist — dem Lautstärkeregler des Spielers, den die
Engine über `GameDetails` mitschickt. Beide Werte überleben das Neuladen im
`localStorage`, gelten aber nur für den jeweiligen Spieler.

Blockiert der Browser den Autostart, wird das nicht als Fehler behandelt: Der
Knopf beschriftet sich um, und die erste Interaktion startet die Musik.

## Sicherheit

* Der Steam-API-Key liegt **nie** im Client. Wo ein Key nötig ist (echter
  Spielername), sitzt ein Proxy unter `proxy/` dazwischen, der ihn aus einer
  Umgebungsvariablen liest.
* Alles, was aus einer URL oder von einem Endpunkt kommt, wird vor der Ausgabe
  durch `U.escapeHtml()` geschickt.
* Die Proxys prüfen ihre Eingaben streng: eine SteamID64 hat genau 17 Ziffern,
  ein Mapname besteht aus `[a-z0-9_-]`. Alles andere wird abgewiesen, bevor
  irgendetwas nach außen geht.

## Was absichtlich fehlt

* **Kein Framework.** Die Seite hat drei Karten und einen Balken.
* **Kein Build-Schritt.** Siehe oben.
* **Keine Analytik.** Ein Ladebildschirm, der Spieler zählt, wäre eine
  Überraschung, die niemand bestellt hat.
