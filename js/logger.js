/* ══════════════════════════════════════════════════════════════════════════
   TTT LOADINGSCREEN — LOGGER

   Ein Ladebildschirm hat kein Fenster, in das er Fehler schreiben könnte: Er
   ist nach ein paar Sekunden weg, und niemand hat die Konsole offen. Deshalb
   schluckt der Code Fehler bewusst — aber nicht spurlos: Sie landen hier.

   Stufen: debug · info · warning · error

   Standardmäßig werden nur `warning` und `error` ausgegeben. Zum Suchen eines
   Problems hängst du `?debug=1` an die URL, dann siehst du alles — inklusive
   der Reihenfolge, in der die Bildquellen durchprobiert wurden.

   Im Browser als `window.TTTLog`, unter Node als require()-Modul.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TTTLog = api;
})(typeof self !== 'undefined' ? self : this, function (global) {
  'use strict';

  var STUFEN = { debug: 10, info: 20, warning: 30, error: 40, off: 100 };
  var PRAEFIX = '[TTT]';

  var aktuelleStufe = STUFEN.warning;
  var verlauf = [];
  var MAX_VERLAUF = 200;

  /* Ohne Konsole (sehr alte Einbettungen) darf nichts krachen. */
  var konsole = global && global.console ? global.console : null;

  function ausgeben(stufe, name, args) {
    var eintrag = { zeit: Date.now(), stufe: name, text: Array.prototype.slice.call(args) };
    verlauf.push(eintrag);
    if (verlauf.length > MAX_VERLAUF) verlauf.shift();

    if (stufe < aktuelleStufe || !konsole) return;

    var ziel = name === 'error' ? (konsole.error || konsole.log)
             : name === 'warning' ? (konsole.warn || konsole.log)
             : name === 'debug' ? (konsole.debug || konsole.log)
             : konsole.log;
    if (!ziel) return;

    try {
      ziel.apply(konsole, [PRAEFIX + ' ' + name + ':'].concat(Array.prototype.slice.call(args)));
    } catch (e) { /* Eine kaputte Konsole darf den Ladebildschirm nicht stoppen. */ }
  }

  var TTTLog = {

    /**
     * Setzt die Mindeststufe, ab der ausgegeben wird.
     * @param {'debug'|'info'|'warning'|'error'|'off'} name
     */
    setLevel: function (name) {
      if (STUFEN[name] !== undefined) aktuelleStufe = STUFEN[name];
    },

    /**
     * Liest die gewünschte Stufe aus Konfiguration und URL. `?debug=1` gewinnt,
     * damit man ein Problem nachstellen kann, ohne eine Datei zu ändern.
     * @param {object} [cfg] Konfiguration, optional mit `logLevel`
     * @param {string} [search] Query-String der Seite
     */
    configure: function (cfg, search) {
      if (cfg && cfg.logLevel) this.setLevel(cfg.logLevel);
      if (search && /(^|[?&])debug=1(&|$)/.test(search)) this.setLevel('debug');
    },

    /** Ausführliche Ablaufmeldungen. @param {...*} args */
    debug: function () { ausgeben(STUFEN.debug, 'debug', arguments); },
    /** Normale Zustandsmeldungen. @param {...*} args */
    info: function () { ausgeben(STUFEN.info, 'info', arguments); },
    /** Etwas hat nicht geklappt, der Bildschirm läuft aber weiter. @param {...*} args */
    warning: function () { ausgeben(STUFEN.warning, 'warning', arguments); },
    /** Etwas ist ausgefallen. @param {...*} args */
    error: function () { ausgeben(STUFEN.error, 'error', arguments); },

    /**
     * Die letzten Meldungen — praktisch, um sie aus der Konsole heraus
     * einzusehen: `TTTLog.history()`
     * @returns {Array<{zeit:number, stufe:string, text:Array}>}
     */
    history: function () { return verlauf.slice(); }
  };

  return TTTLog;
});
