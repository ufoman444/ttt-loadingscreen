/* ══════════════════════════════════════════════════════════════════════════
   TTT LOADINGSCREEN — REINE HILFSFUNKTIONEN

   Alles hier drin ist frei von DOM und Netzwerk: gleiche Eingabe, gleiche
   Ausgabe. Genau deshalb liegt es in einer eigenen Datei — so lässt es sich
   unter tests/ prüfen, ohne einen Browser zu starten.

   Im Browser hängt sich das Modul als `window.TTTUtil` ein, unter Node ist es
   ein normales require()-Modul.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TTTUtil = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Begrenzt einen Wert auf einen Bereich.
   * @param {number} v Wert
   * @param {number} a Untergrenze
   * @param {number} b Obergrenze
   * @returns {number}
   */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /**
   * Stabiler 32-Bit-Hash (FNV-1a). Dieselbe Zeichenkette ergibt immer denselben
   * Wert — die Grundlage dafür, dass ein Spieler stets dasselbe Täterprofil
   * bekommt.
   * @param {string} str
   * @returns {number} vorzeichenlose 32-Bit-Zahl
   */
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < String(str).length; i++) {
      h ^= String(str).charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  /**
   * Deterministischer Zufallsgenerator (xorshift32) aus einem Startwert.
   * @param {number} seed
   * @returns {function(): number} liefert Werte in [0, 1)
   */
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;  s >>>= 0;
      return s / 4294967296;
    };
  }

  /**
   * Wählt ein Element aus einer Liste anhand eines Zufallsgenerators.
   * @param {Array<*>} list
   * @param {function(): number} r
   * @returns {*}
   */
  function pick(list, r) { return list[Math.floor(r() * list.length) % list.length]; }

  /**
   * Maskiert die Zeichen, die in HTML gefährlich werden können.
   * @param {*} s
   * @returns {string}
   */
  function escapeHtml(s) {
    return String(s).replace(/[<>&"]/g, function (c) {
      return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c];
    });
  }

  /* ── Mapnamen ─────────────────────────────────────────────────────────── */

  /**
   * Entfernt eine angehängte Dateiendung: "ttt_forest.bsp" → "ttt_forest".
   * @param {string} raw
   * @returns {string}
   */
  function prettyMapName(raw) { return String(raw).replace(/\.bsp$/i, ''); }

  /**
   * Reduziert einen Namen auf Kleinbuchstaben und Ziffern. Damit fallen
   * "TTT Concrete" und "ttt_concrete" auf dieselbe Form zusammen.
   * @param {string} s
   * @returns {string}
   */
  function normalizeMap(s) {
    return String(s).toLowerCase().replace(/\.bsp$/, '').replace(/[^a-z0-9]/g, '');
  }

  /**
   * Entfernt Versionsanhängsel: "ttt_forest_v2b" → "ttt_forest".
   * @param {string} s
   * @returns {string}
   */
  function stripVersion(s) {
    return String(s).toLowerCase()
      .replace(/\.bsp$/, '')
      .replace(/_(v|b|a|beta|alpha|rc)?\d+[a-z]?$/, '')
      .replace(/_(final|fix|fixed|se|remake|redux|day|night|winter)$/, '');
  }

  /**
   * Liest einen Wert aus einem Query-String. Nicht ersetzte Platzhalter aus der
   * sv_loadingurl ("%s", "%m") gelten als nicht vorhanden — sonst stünde beim
   * Testen im Browser wörtlich "%s" als SteamID auf der Seite.
   * @param {string} search Query-String, mit oder ohne führendes "?"
   * @param {string[]} names akzeptierte Parameternamen, klein geschrieben
   * @returns {string} gefundener Wert oder ""
   */
  function sicherDekodieren(s) {
    try { return decodeURIComponent(s); }
    catch (e) { return s; }     /* kaputte Prozentfolge → unverändert lassen */
  }

  function parseParam(search, names) {
    if (!search) return '';
    var q = search.charAt(0) === '?' ? search.substring(1) : search;
    if (!q) return '';

    var parts = q.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      var key = sicherDekodieren(kv[0] || '').toLowerCase();
      if (names.indexOf(key) === -1) continue;

      var roh = (kv[1] || '').replace(/\+/g, ' ');
      /* Vor dem Dekodieren prüfen: "%s" ist keine gültige Prozentfolge und
         würde decodeURIComponent eine Ausnahme entlocken. */
      if (!roh || roh.charAt(0) === '%') return '';

      var val = sicherDekodieren(roh).trim();
      return val.charAt(0) === '%' ? '' : val;
    }
    return '';
  }

  /* ── Ladebalken ───────────────────────────────────────────────────────── */

  /**
   * Sucht die zum Fortschritt passende Beschriftung.
   * @param {Array<[number, string]>} phases Schwellwert/Text-Paare, aufsteigend
   * @param {number} pct Fortschritt in Prozent
   * @returns {string}
   */
  function phaseLabel(phases, pct) {
    if (!phases || !phases.length) return '';
    var label = phases[0][1];
    for (var i = 0; i < phases.length; i++) {
      if (pct >= phases[i][0]) label = phases[i][1];
    }
    return label;
  }

  /**
   * Berechnet den Zielwert des Ladebalkens.
   *
   * Vor den ersten Downloads läuft er zeitgesteuert bis 6 % an, während der
   * Downloads bildet er deren echten Fortschritt auf 6–92 % ab, danach kriecht
   * er langsam Richtung 99 % — die 100 % erreicht er nie, weil das Spiel den
   * Bildschirm vorher wegnimmt.
   *
   * Setzt `state.doneSince`, sobald die Downloads fertig sind.
   * @param {object} state Ladezustand
   * @param {number} now Zeitstempel in Millisekunden
   * @returns {number} Zielwert in Prozent, 0–99.5
   */
  function progressTarget(state, now) {
    var t = 0;

    if (state.gotFileInfo && state.filesTotal > 0) {
      var done = (state.filesTotal - state.filesNeeded) / state.filesTotal;
      t = 6 + 86 * clamp(done, 0, 1);
    } else if (state.doneDownloading || (state.gotFileInfo && state.filesTotal === 0)) {
      t = 92;
    } else {
      t = clamp((now - state.started) / 1400, 0, 6);
    }

    if (t >= 92) {
      if (!state.doneSince) state.doneSince = now;
      t = 92 + clamp((now - state.doneSince) / 3000, 0, 7);
    }

    /* Vorschaumodus: simuliert den Fortschritt, solange sich keine Engine meldet. */
    if (state.demo && !state.engineSpoke) {
      t = Math.max(t, clamp((now - state.started - 4000) / 220, 0, 97));
    }

    return clamp(t, 0, 99.5);
  }

  /* ── Workshop-Index ───────────────────────────────────────────────────── */

  /**
   * Sammelt die Bild-URLs, die der Workshop-Index für eine Map hergibt —
   * erst der exakte Name, dann die normalisierte Schreibweise, zuletzt der
   * Name ohne Versionsanhängsel. Eine lokal heruntergeladene Kopie hat immer
   * Vorrang vor der Steam-CDN-URL.
   * @param {?object} index Inhalt von js/maps.json
   * @param {string} map Mapname, klein geschrieben
   * @returns {string[]} Kandidaten in absteigender Güte, ohne Dubletten
   */
  function workshopCandidates(index, map) {
    var out = [];
    if (!index || !index.exakt) return out;

    var seen = {};
    function add(entry) {
      if (!entry) return;
      var urls = [entry.lokal, entry.img];
      for (var i = 0; i < urls.length; i++) {
        if (urls[i] && !seen[urls[i]]) { seen[urls[i]] = 1; out.push(urls[i]); }
      }
    }

    add(index.exakt[map]);

    var fuzzy = index.unscharf || {};
    var key = fuzzy[normalizeMap(map)];
    if (key) add(index.exakt[key]);

    var kurz = fuzzy[normalizeMap(stripVersion(map))];
    if (kurz) add(index.exakt[kurz]);

    return out;
  }

  return {
    clamp: clamp,
    hash: hash,
    rng: rng,
    pick: pick,
    escapeHtml: escapeHtml,
    prettyMapName: prettyMapName,
    normalizeMap: normalizeMap,
    stripVersion: stripVersion,
    parseParam: parseParam,
    phaseLabel: phaseLabel,
    progressTarget: progressTarget,
    workshopCandidates: workshopCandidates
  };
});
