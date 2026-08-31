/* ══════════════════════════════════════════════════════════════════════════
   TTT LOADINGSCREEN — LOGIK

   Datenquellen, in dieser Reihenfolge:
     1. Die JavaScript-Callbacks, die Garry's Mod selbst aufruft
        (GameDetails, SetFilesTotal, SetFilesNeeded, DownloadingFile,
        SetStatusChanged). Das ist die zuverlässigste Quelle.
     2. URL-Parameter aus sv_loadingurl (?steamid=%s&map=%m) als Rückfallebene,
        z. B. wenn ein Callback ausbleibt.
     3. js/config.js als letzter Fallback (Browser-Test ohne Server).
   ══════════════════════════════════════════════════════════════════════════ */
(function (global, doc) {
  'use strict';

  var CFG = global.TTT_CONFIG || {};
  var U   = global.TTTUtil;
  var LOG = global.TTTLog;

  if (!U || !LOG) {
    /* Ohne die Hilfsmodule laeuft hier nichts. Lieber laut scheitern als
       stumm eine halb tote Seite zeigen. */
    if (global.console) global.console.error('[TTT] js/util.js oder js/logger.js fehlt.');
    return;
  }

  LOG.configure(CFG, global.location.search);

  /* ── DOM-Kürzel ───────────────────────────────────────────────────────── */
  function $(id) { return doc.getElementById(id); }
  var el = {
    serverName: $('serverName'), gamemode: $('gamemode'), slots: $('slots'),
    mapImage: $('mapImage'), mapFallback: $('mapFallback'), mapName: $('mapName'),
    mapHint: $('mapHint'), mapStatus: $('mapStatus'),
    rules: $('rules'),
    avatarImg: $('avatarImg'),
    playerName: $('playerName'), playerCode: $('playerCode'),
    steamLink: $('steamLink'), steamId: $('steamId'),
    stats: $('stats'), verdict: $('verdict'), profileNote: $('profileNote'),
    phase: $('phase'), pct: $('pct'), bar: $('bar'), barFill: $('barFill'),
    barGhost: $('barGhost'), barrel: $('barrel'),
    status: $('status'), files: $('files'), tip: $('tip'),
    musicBtn: $('musicBtn'), musicLabel: $('musicLabel'),
    audio: $('audio'), musicVol: $('musicVol'), musicPct: $('musicPct')
  };

  /* ── Zustand ──────────────────────────────────────────────────────────── */
  var state = {
    filesTotal: 0,
    filesNeeded: 0,
    gotFileInfo: false,
    gotDetails: false,
    engineSpoke: false,
    doneDownloading: false,
    doneSince: 0,
    started: Date.now(),
    demo: false,
    target: 0,
    display: 0,
    lastPctShown: -1,
    mapResolved: '',
    mapImageFound: false,
    imageRun: 0,
    lookupTried: false,
    indexDone: false,
    playerKnown: false,
    playerId: ''
  };

  /* ══════════════════════════════════════════════════════════════════════
     HILFSFUNKTIONEN
     ══════════════════════════════════════════════════════════════════════ */

  /* Die reine Logik liegt in js/util.js — hier nur kurze Namen dafuer. */
  function param(names) { return U.parseParam(global.location.search, names); }

  var hash  = U.hash;
  var rng   = U.rng;
  var pick  = U.pick;
  var clamp = U.clamp;
  var esc   = U.escapeHtml;

  /* ══════════════════════════════════════════════════════════════════════
     1) REGELN
     ══════════════════════════════════════════════════════════════════════ */
  function renderRules() {
    var rules = CFG.rules || [];
    var html = '';
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      html += '<li class="' + (r.traitor ? 'is-traitor' : '') + '" style="animation-delay:' + (i * 70) + 'ms">' +
                '<div>' +
                  '<span class="rules__text">' + esc(r.text) +
                    (r.traitor ? '<span class="rules__stamp">TRAITOR</span>' : '') +
                  '</span>' +
                  (r.note ? '<span class="rules__note">' + esc(r.note) + '</span>' : '') +
                '</div>' +
              '</li>';
    }
    el.rules.innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════════════════════
     2) MAP + VORSCHAUBILD

     Wichtig für Admins: Garry's Mod ersetzt in sv_loadingurl nur zwei
     Platzhalter — %s (SteamID64) und %m (Mapname). Einen Parameter für die
     Map brauchst du also NICHT zwingend: der Mapname kommt ohnehin über
     GameDetails(). ?map=%m ist trotzdem sinnvoll als Rückfallebene.
     ══════════════════════════════════════════════════════════════════════ */
  var prettyMapName = U.prettyMapName;

  function setMap(raw) {
    if (!raw) return;
    var map = prettyMapName(raw).toLowerCase();
    if (state.mapResolved === map) return;
    state.mapResolved = map;

    el.mapName.textContent = prettyMapName(raw);
    if (el.mapStatus) el.mapStatus.textContent = 'geladen';

    /* Spruch zur Map */
    var hints = CFG.mapHints || {};
    var r = rng(hash(map));
    el.mapHint.textContent = hints[map] || pick([
      'Leichen bitte nicht auf dem Rasen ablegen.',
      'Die Fässer stehen da nicht zufällig.',
      'Irgendwo hier ist ein Traitor-Trap. Viel Spaß beim Suchen.',
      'Diese Map hat mehr Ecken als deine Alibis.',
      'Erfahrungsgemäß stirbt hier zuerst jemand im Spawn.',
      'Achtung: Kartenkenntnis ersetzt kein Karma.',
      'Hier wurde noch nie jemand grundlos erschossen. Statistisch gesehen.'
    ], r);

    resolveMapImage();
  }

  /* ── Vorschaubild bestimmen ────────────────────────────────────────────
     Reihenfolge: eigene Angabe in config.mapImages → Workshop-Index
     (js/maps.json, erzeugt von scripts/fetch-workshop-maps.mjs) →
     lokaler Ordner img/maps/ → Platzhalterkarte.
     ─────────────────────────────────────────────────────────────────────── */
  function workshopCandidates(map) {
    return U.workshopCandidates(mapIndex, map);
  }

  function resolveMapImage() {
    var map = state.mapResolved;
    if (!map || state.mapImageFound) return;

    var candidates = [];

    /* Eigene Angabe gewinnt immer. */
    var configured = (CFG.mapImages || {})[map];
    if (configured) candidates.push(configured);

    candidates = candidates.concat(workshopCandidates(map));

    var folder = CFG.mapImageFolder || 'img/maps/';
    var exts = CFG.mapImageExtensions || ['jpg', 'png', 'webp'];
    for (var i = 0; i < exts.length; i++) candidates.push(folder + map + '.' + exts[i]);

    LOG.debug('Bildkandidaten fuer', map, candidates);
    state.imageRun++;
    tryImages(candidates, 0, state.imageRun);
  }

  function tryImages(list, i, run) {
    if (i >= list.length) {                          // nichts dabei → Live-Suche
      LOG.debug('Kein Kandidat hat geladen, versuche die Live-Suche.');
      liveLookup();
      return;
    }
    if (run !== state.imageRun || state.mapImageFound) return;

    var probe = new global.Image();
    probe.onload = function () {
      if (run !== state.imageRun || state.mapImageFound) return;
      state.mapImageFound = true;
      LOG.info('Vorschaubild geladen:', list[i]);
      el.mapImage.src = list[i];
      el.mapImage.hidden = false;
      if (el.mapFallback) el.mapFallback.style.display = 'none';
    };
    probe.onerror = function () { tryImages(list, i + 1, run); };
    probe.src = list[i];
  }

  /* ── Live-Suche für unbekannte Maps ───────────────────────────────────────
     Findet sich im Index nichts und ist ein Endpunkt konfiguriert, fragt der
     Ladebildschirm ihn nach dem Vorschaubild. So bekommen auch Maps ein Bild,
     die es beim letzten Lauf des Index-Skripts noch gar nicht gab.
     Schlägt das fehl, bleibt einfach die Platzhalterkarte stehen.
     ─────────────────────────────────────────────────────────────────────── */
  function liveLookup() {
    if (state.lookupTried || state.mapImageFound) return;
    /* Erst den Index abwarten - der ist schneller und genauer. */
    if (!state.indexDone) return;
    if (!CFG.mapLookupEndpoint || !state.mapResolved) return;
    state.lookupTried = true;

    var url = CFG.mapLookupEndpoint.replace('{map}', encodeURIComponent(state.mapResolved));
    try {
      var xhr = new global.XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 6000;
      xhr.onload = function () {
        if (xhr.status < 200 || xhr.status >= 300) {
          LOG.info('Live-Suche ohne Treffer (HTTP ' + xhr.status + ') fuer', state.mapResolved);
          return;
        }
        var data;
        try { data = JSON.parse(xhr.responseText); }
        catch (e) { LOG.warning('Live-Suche lieferte kein gueltiges JSON.'); return; }

        if (!data || !data.img || state.mapImageFound) return;
        LOG.info('Live-Suche fand', data.titel || data.img);
        state.imageRun++;
        tryImages([data.img], 0, state.imageRun);
      };
      xhr.ontimeout = function () { LOG.warning('Live-Suche hat zu lange gebraucht.'); };
      xhr.onerror   = function () { LOG.warning('Live-Suche nicht erreichbar:', url); };
      xhr.send();
    } catch (e) {
      LOG.error('Live-Suche konnte nicht gestartet werden:', e && e.message);
    }
  }

  /* Der Workshop-Index kommt asynchron. Ist die Map schon bekannt, wird das
     Bild danach einfach erneut gesucht. */
  var mapIndex = null;

  function loadMapIndex() {
    var url = CFG.workshopIndex;

    /* Ohne Index sofort freigeben, damit die Live-Suche nicht wartet. */
    if (!url) { state.indexDone = true; return; }

    function fertig() {
      state.indexDone = true;
      resolveMapImage();
    }

    try {
      var xhr = new global.XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 5000;
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            mapIndex = JSON.parse(xhr.responseText);
            LOG.info('Map-Index geladen:', (mapIndex && mapIndex.anzahl) || 0, 'Maps');
          } catch (e) {
            mapIndex = null;
            LOG.error('Map-Index ist kein gueltiges JSON:', url);
          }
        } else {
          LOG.info('Kein Map-Index unter', url, '(HTTP ' + xhr.status + ')');
        }
        fertig();
      };
      xhr.onerror   = function () { LOG.warning('Map-Index nicht erreichbar:', url); fertig(); };
      xhr.ontimeout = function () { LOG.warning('Map-Index hat zu lange gebraucht.'); fertig(); };
      xhr.send();
    } catch (e) {
      LOG.error('Map-Index konnte nicht geladen werden:', e && e.message);
      fertig();
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     3) SPIELERPROFIL
     ══════════════════════════════════════════════════════════════════════ */
  var ADJEKTIVE = [
    'Nervöser', 'Auffällig unauffälliger', 'Chronisch unschuldiger', 'Schweigsamer',
    'Übermotivierter', 'Verdächtig ruhiger', 'Statistisch auffälliger', 'Notorisch harmloser',
    'Zufällig anwesender', 'Hektischer', 'Tiefenentspannter', 'Freundlich wirkender'
  ];
  var NOMEN = [
    'Fassschubser', 'Brechstangen-Poet', 'Traitor-Versteher', 'Leichenfinder',
    'Kronzeuge', 'Zeugenschutz-Kandidat', 'Zufallsopfer', 'Granatenflüsterer',
    'Karma-Optimist', 'Spawncamper a. D.', 'Alibibastler', 'Türblockierer'
  ];
  var VERDIKTE = [
    'Keine belastbaren Beweise. Was bekanntlich nichts heißt.',
    'Akte unauffällig. Verdächtig unauffällig.',
    'Wurde dreimal freigesprochen. Von sich selbst.',
    'Beteuert seine Unschuld, bevor jemand gefragt hat.',
    'Steht statistisch überdurchschnittlich oft neben Leichen.',
    'Hat noch nie ein Fass geworfen. Behauptet er.',
    'Gilt als harmlos. Das taten die anderen auch.',
    'Zuletzt gesehen beim Verlassen des Traitor-Raums. Rein zufällig.'
  ];

  /**
   * Zeichnet ein aus der SteamID abgeleitetes Muster und hängt es als Bild in
   * den Avatar-Rahmen.
   *
   * Bewusst über ein <img> statt über ein sichtbares <canvas>: Eingebettete
   * Browser — und der von Garry's Mod ist einer — stellen Canvas-Inhalte nicht
   * immer zuverlässig dar. Ein fertiges Bild zeigt jeder. Nebenbei nimmt der
   * echte Steam-Avatar später denselben Weg.
   * @param {number} seed Hash der SteamID
   */
  function drawIdenticon(seed) {
    var canvas = doc.createElement('canvas');
    if (!canvas.getContext) return;
    canvas.width = canvas.height = 128;

    var ctx = canvas.getContext('2d');
    var r = rng(seed);
    var size = canvas.width, cells = 5, cell = size / cells;

    /* Grüner Hintergrund, passend zum Rest des Screens. */
    var bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#0f2019');
    bg.addColorStop(1, '#16261f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    var palette = ['#6ee7b7', '#34d399', '#10b981', '#a3e635', '#059669'];
    ctx.fillStyle = palette[Math.floor(r() * palette.length)];

    for (var y = 0; y < cells; y++) {
      for (var x = 0; x < Math.ceil(cells / 2); x++) {
        if (r() > 0.5) {
          ctx.fillRect(x * cell, y * cell, cell, cell);
          ctx.fillRect((cells - 1 - x) * cell, y * cell, cell, cell);  // gespiegelt
        }
      }
    }

    try {
      el.avatarImg.src = canvas.toDataURL('image/png');
      el.avatarImg.hidden = false;
    } catch (e) {
      LOG.warning('Avatar konnte nicht erzeugt werden:', e && e.message);
    }
  }

  function renderStats(seed) {
    var r = rng(seed);
    var rows = [
      { key: 'Verdachtsstufe',    val: Math.round(35 + r() * 64),  suffix: ' %',   cls: 'is-hot'  },
      { key: 'Karma (geschätzt)', val: Math.round(620 + r() * 380), suffix: '',    cls: '',        max: 1000 },
      { key: 'Fässer-Affinität',  val: Math.round(20 + r() * 80),  suffix: ' %',   cls: 'is-lime' },
      { key: 'Überlebenschance',  val: Math.round(8 + r() * 55),   suffix: ' %',   cls: ''        }
    ];

    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var pctVal = clamp(row.val / (row.max || 100) * 100, 2, 100);
      html += '<li class="' + row.cls + '">' +
                '<div class="stats__row">' +
                  '<span class="stats__key">' + row.key + '</span>' +
                  '<span class="stats__val">' + row.val + row.suffix + '</span>' +
                '</div>' +
                '<div class="stats__track"><div class="stats__fill" data-pct="' + pctVal + '"></div></div>' +
              '</li>';
    }
    el.stats.innerHTML = html;

    /* Balken erst im nächsten Frame füllen, damit die Animation läuft. */
    global.setTimeout(function () {
      var fills = el.stats.querySelectorAll('.stats__fill');
      for (var i = 0; i < fills.length; i++) fills[i].style.width = fills[i].getAttribute('data-pct') + '%';
    }, 120);
  }

  /**
   * Fuellt die Profilkarte. `istBeispiel` kennzeichnet Vorschaudaten, damit
   * niemand sie fuer echt haelt.
   * @param {string|number} steamid64
   * @param {boolean} [istBeispiel]
   */
  function setPlayer(steamid64, istBeispiel) {
    var id = String(steamid64 || '').replace(/[^0-9]/g, '');

    if (!id || id.length < 5) {
      /* Kein Parameter übergeben — hilfreiche Meldung statt kaputter Karte. */
      el.playerName.textContent = 'Unbekannter Terrorist';
      el.playerCode.textContent = 'Deckname: Namenloser';
      el.steamId.textContent = 'keine SteamID übergeben';
      el.steamLink.removeAttribute('href');
      el.verdict.innerHTML = '<b>Hinweis für den Admin:</b> Häng <code>?steamid=%s</code> ' +
                             'an deine sv_loadingurl, dann steht hier das echte Profil.';
      drawIdenticon(hash('anonym'));
      renderStats(hash('anonym'));
      return;
    }

    var seed = hash(id);
    var r = rng(seed);
    state.playerId = id;

    el.playerName.textContent = 'Spieler #' + id.substring(id.length - 4);
    el.playerCode.textContent = 'Deckname: ' + pick(ADJEKTIVE, r) + ' ' + pick(NOMEN, r);
    el.steamId.textContent = id;
    el.steamLink.href = 'https://steamcommunity.com/profiles/' + id;
    el.verdict.innerHTML = '<b>Aktenvermerk:</b> ' + esc(pick(VERDIKTE, r));

    drawIdenticon(seed);
    renderStats(seed);
    state.playerKnown = !istBeispiel;

    /* Echtes Profil beschaffen, in dieser Reihenfolge:
       1. bereits bekannt (js/players.json oder Zwischenspeicher) — sofort da
       2. eigener Endpunkt, falls konfiguriert
       3. oeffentlicher Dienst — braucht keinen Server und kein Deployment */
    var bekannt = profilAusCache(id);
    if (uebernimmProfil(id)) {
      /* fertig */
    } else if (bekannt) {
      zeigeProfil(bekannt);
      LOG.info('Profil aus dem Zwischenspeicher:', bekannt.name);
    } else if (CFG.profileEndpoint) {
      loadRealProfile(id);
    } else {
      publicProfileLookup(id);
    }

    if (istBeispiel) {
      el.playerName.textContent = 'Beispielspieler';
      if (el.profileNote) el.profileNote.textContent = 'Beispiel';
      el.verdict.innerHTML = '<b>Vorschau:</b> ' + esc(pick(VERDIKTE, r)) +
        ' <em>Im Spiel steht hier das Profil des beitretenden Spielers.</em>';
    }

  }

  /**
   * Setzt Name und Avatar aus dem vorab geholten Spieler-Index, sofern die
   * SteamID dort steht.
   * @param {string} id SteamID64
   * @returns {boolean} true, wenn ein Eintrag gefunden wurde
   */
  /**
   * Traegt Name und Avatar in die Profilkarte ein.
   * @param {{name?: string, avatar?: string}} daten
   */
  function zeigeProfil(daten) {
    if (!daten) return;
    if (daten.name) el.playerName.textContent = daten.name;
    if (daten.avatar) {
      /* Ein Bild darf von jeder Domain geladen werden — CORS gilt hier nicht. */
      el.avatarImg.src = daten.avatar;
      el.avatarImg.hidden = false;
    }
  }

  function uebernimmProfil(id) {
    var eintrag = playerIndex && playerIndex.spieler && playerIndex.spieler[id];
    if (!eintrag) return false;

    zeigeProfil(eintrag);
    LOG.info('Profil aus dem Index:', eintrag.name);
    return true;
  }

  /* Wie der Map-Index kommt auch dieser asynchron. */
  var playerIndex = null;

  function loadPlayerIndex() {
    var url = CFG.playersIndex;
    if (!url) return;

    try {
      var xhr = new global.XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 5000;
      xhr.onload = function () {
        if (xhr.status < 200 || xhr.status >= 300) {
          LOG.info('Kein Spieler-Index unter', url, '(HTTP ' + xhr.status + ')');
          return;
        }
        try {
          playerIndex = JSON.parse(xhr.responseText);
          LOG.info('Spieler-Index geladen:', (playerIndex && playerIndex.anzahl) || 0, 'Profile');
        } catch (e) {
          LOG.error('Spieler-Index ist kein gueltiges JSON:', url);
          return;
        }
        /* Steht der aktuelle Spieler drin, jetzt nachtragen. */
        if (state.playerId) uebernimmProfil(state.playerId);
      };
      xhr.onerror   = function () { LOG.warning('Spieler-Index nicht erreichbar:', url); };
      xhr.ontimeout = function () { LOG.warning('Spieler-Index hat zu lange gebraucht.'); };
      xhr.send();
    } catch (e) {
      LOG.error('Spieler-Index konnte nicht geladen werden:', e && e.message);
    }
  }

  /* ── Oeffentliche Profilsuche (der Weg fuer GitHub Pages) ─────────────────
     Steam selbst laesst sich vom Browser nicht fragen. Es gibt aber Dienste,
     die genau das stellvertretend tun und ihre Antwort mit CORS-Freigabe
     ausliefern — damit braucht es keinen eigenen Server und nichts zu
     deployen. Faellt der Dienst aus, bleibt es beim erzeugten Muster.
     ─────────────────────────────────────────────────────────────────────── */
  var PROFIL_CACHE_MS = 24 * 60 * 60 * 1000;

  function profilAusCache(id) {
    try {
      var roh = global.localStorage.getItem('ttt_profil_' + id);
      if (!roh) return null;
      var daten = JSON.parse(roh);
      if (!daten || (Date.now() - daten.t) > PROFIL_CACHE_MS) return null;
      return daten;
    } catch (e) { return null; }
  }

  function merkeProfil(id, daten) {
    try {
      global.localStorage.setItem('ttt_profil_' + id,
        JSON.stringify({ name: daten.name, avatar: daten.avatar, t: Date.now() }));
    } catch (e) { /* ohne Zwischenspeicher wird eben jedes Mal gefragt */ }
  }

  /**
   * Sucht das Profil bei den konfigurierten Diensten, einer nach dem anderen.
   * @param {string} id SteamID64
   * @param {number} [i] Index in der Dienstliste
   */
  function publicProfileLookup(id, i) {
    var dienste = CFG.profileLookupUrls || [];
    i = i || 0;
    if (i >= dienste.length) return;

    var url = dienste[i].replace('{steamid}', encodeURIComponent(id));

    function weiter() { publicProfileLookup(id, i + 1); }

    try {
      var xhr = new global.XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 5000;
      xhr.onload = function () {
        if (xhr.status < 200 || xhr.status >= 300) {
          LOG.info('Profildienst antwortete mit HTTP ' + xhr.status + ':', url);
          return weiter();
        }
        var daten;
        try { daten = U.extractProfile(JSON.parse(xhr.responseText)); }
        catch (e) { LOG.warning('Profildienst lieferte kein gueltiges JSON.'); return weiter(); }

        if (!daten) { LOG.info('Profildienst kannte die SteamID nicht.'); return weiter(); }

        LOG.info('Profil gefunden:', daten.name);
        zeigeProfil(daten);
        merkeProfil(id, daten);
      };
      xhr.onerror   = function () { LOG.info('Profildienst nicht erreichbar:', url); weiter(); };
      xhr.ontimeout = function () { LOG.info('Profildienst hat zu lange gebraucht.'); weiter(); };
      xhr.send();
    } catch (e) {
      LOG.warning('Profilsuche konnte nicht gestartet werden:', e && e.message);
    }
  }

  function loadRealProfile(id) {
    var url = CFG.profileEndpoint.replace('{steamid}', encodeURIComponent(id));
    try {
      var xhr = new global.XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 4000;
      xhr.onload = function () {
        if (xhr.status < 200 || xhr.status >= 300) {
          LOG.warning('Profil-Endpunkt antwortete mit HTTP ' + xhr.status);
          return;
        }
        var data;
        try { data = JSON.parse(xhr.responseText); }
        catch (e) { LOG.warning('Profil-Endpunkt lieferte kein gueltiges JSON.'); return; }
        if (data && data.name) el.playerName.textContent = data.name;
        if (data && data.avatar) {
          el.avatarImg.src = data.avatar;      // ersetzt das erzeugte Muster
          el.avatarImg.hidden = false;
        }
      };
      xhr.onerror = function () { LOG.warning('Profil-Endpunkt nicht erreichbar:', url); };
      xhr.send();
    } catch (e) {
      LOG.error('Profil konnte nicht abgefragt werden:', e && e.message);
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     4) LADEBALKEN
     ══════════════════════════════════════════════════════════════════════ */
  function currentPhaseLabel(p) {
    return U.phaseLabel(CFG.phases, p);
  }

  function frame() {
    state.target = Math.max(state.target, U.progressTarget(state, Date.now()));
    state.display += (state.target - state.display) * 0.09;

    var p = state.display;
    var shown = Math.floor(p);

    el.barFill.style.width = p.toFixed(2) + '%';
    el.barGhost.style.width = state.target.toFixed(2) + '%';
    el.bar.setAttribute('aria-valuenow', shown);

    if (el.barrel) {
      el.barrel.style.left = p.toFixed(2) + '%';
      el.barrel.style.setProperty('--roll', (p * 11).toFixed(1) + 'deg');
      if (p > 90) el.barrel.classList.add('is-panic');
    }

    if (shown !== state.lastPctShown) {
      state.lastPctShown = shown;
      el.pct.textContent = shown;
      el.pct.classList.add('is-tick');
      global.setTimeout(function () { el.pct.classList.remove('is-tick'); }, 180);
      el.phase.textContent = currentPhaseLabel(shown);
    }

    global.requestAnimationFrame(frame);
  }

  function updateFileLine() {
    if (!state.gotFileInfo || state.filesTotal <= 0) { el.files.textContent = ''; return; }
    var done = state.filesTotal - state.filesNeeded;
    el.files.textContent = done + ' / ' + state.filesTotal + ' Dateien';
  }

  /* ══════════════════════════════════════════════════════════════════════
     5) TIPPS
     ══════════════════════════════════════════════════════════════════════ */
  function startTips() {
    var tips = (CFG.tips || []).slice();
    if (!tips.length) return;
    var i = Math.floor(Math.random() * tips.length);

    function show() {
      el.tip.textContent = tips[i % tips.length];
      el.tip.classList.remove('is-swap');
      void el.tip.offsetWidth;          // Reflow erzwingen, damit die Animation neu startet
      el.tip.classList.add('is-swap');
      i++;
    }
    show();
    global.setInterval(show, CFG.tipInterval || 7000);
  }

  /* ══════════════════════════════════════════════════════════════════════
     6) MUSIK-SCHALTER
     ══════════════════════════════════════════════════════════════════════ */
  function initMusic() {
    var mcfg = CFG.music || {};
    if (mcfg.mode === 'off') {
      if (el.audio) el.audio.style.display = 'none';
      return;
    }

    /* Lautstärke vor dem Stummschalten, damit der Knopf sie zurückholen kann. */
    var letzteLautstaerke = typeof mcfg.volume === 'number' ? mcfg.volume : 0.35;

    function zeigeLautstaerke(v) {
      var prozent = Math.round(v * 100);
      el.musicVol.value = prozent;
      el.musicVol.style.setProperty('--fill', prozent + '%');
      el.musicVol.setAttribute('aria-valuetext', prozent + ' Prozent');
      el.musicPct.innerHTML = prozent + '&thinsp;%';
      el.audio.classList.toggle('is-quiet', v > 0 && v < 0.34);
    }

    global.TTTMusic.onChange(function (playing, blocked) {
      var v = global.TTTMusic.getVolume();
      var stumm = !playing || v === 0;

      el.audio.classList.toggle('is-on', playing);
      el.audio.classList.toggle('is-muted', stumm);
      el.audio.classList.toggle('is-blocked', !playing && blocked);

      el.musicBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
      el.musicBtn.setAttribute('aria-label', playing ? 'Musik stummschalten' : 'Musik einschalten');
      el.musicBtn.title = playing ? 'Musik stummschalten' : 'Musik einschalten';

      el.musicLabel.textContent = blocked && !playing ? 'Musik starten'
                                : playing ? 'Fahrstuhlmusik'
                                : 'Stille';
      zeigeLautstaerke(v);
    });

    /* Regler: wirkt sofort, auf 0 gezogen ist er stumm. */
    el.musicVol.addEventListener('input', function () {
      var v = Number(el.musicVol.value) / 100;
      if (v > 0) letzteLautstaerke = v;
      zeigeLautstaerke(v);
      global.TTTMusic.setVolume(v);
    });

    /* Stummschalter: merkt sich die vorherige Lautstärke. */
    el.musicBtn.addEventListener('click', function () {
      if (global.TTTMusic.isPlaying()) {
        letzteLautstaerke = global.TTTMusic.getVolume() || letzteLautstaerke;
        global.TTTMusic.stop();
        zeigeLautstaerke(0);
      } else {
        global.TTTMusic.setVolume(letzteLautstaerke > 0 ? letzteLautstaerke : 0.35);
      }
    });

    global.TTTMusic.init(mcfg);
    zeigeLautstaerke(global.TTTMusic.getVolume());
    letzteLautstaerke = global.TTTMusic.getVolume() || letzteLautstaerke;
  }

  /* ══════════════════════════════════════════════════════════════════════
     7) GMOD-CALLBACKS
     Diese Funktionen ruft die Engine von sich aus auf. Sie MÜSSEN am
     window-Objekt hängen — sonst findet Garry's Mod sie nicht.
     ══════════════════════════════════════════════════════════════════════ */

  global.GameDetails = function (servername, serverurl, mapname, maxplayers, steamid, gamemode, volume, language) {
    state.engineSpoke = true;
    state.gotDetails = true;
    LOG.info('GameDetails:', servername, '|', mapname, '|', gamemode);

    if (servername) el.serverName.textContent = servername;
    if (gamemode)   el.gamemode.textContent = gamemode;
    if (maxplayers) el.slots.textContent = maxplayers + ' Slots';
    if (mapname)    setMap(mapname);
    if (steamid)    setPlayer(steamid);

    /* Lautstärkeregler des Spielers respektieren. */
    if (typeof volume === 'number' && global.TTTMusic) global.TTTMusic.setGameVolume(volume);
  };

  global.SetFilesTotal = function (total) {
    state.engineSpoke = true;
    state.gotFileInfo = true;
    state.filesTotal = Number(total) || 0;
    updateFileLine();
  };

  global.SetFilesNeeded = function (needed) {
    state.engineSpoke = true;
    state.gotFileInfo = true;
    state.filesNeeded = Number(needed) || 0;
    if (state.filesNeeded <= 0 && state.filesTotal > 0) state.doneDownloading = true;
    updateFileLine();
  };

  global.DownloadingFile = function (fileName) {
    state.engineSpoke = true;
    var name = String(fileName || '');
    var short = name.split('/').pop().split('\\').pop();
    el.status.textContent = 'Lade ' + (short.length > 52 ? short.substring(0, 49) + '…' : short);
  };

  global.SetStatusChanged = function (status) {
    state.engineSpoke = true;
    if (status) el.status.textContent = String(status);
  };

  /* ══════════════════════════════════════════════════════════════════════
     8) START
     ══════════════════════════════════════════════════════════════════════ */
  function boot() {
    renderRules();
    startTips();
    initMusic();
    loadMapIndex();
    loadPlayerIndex();

    /* Fallback aus der Konfiguration, bis die Engine sich meldet. */
    if (CFG.serverName) el.serverName.textContent = CFG.serverName;
    el.gamemode.textContent = CFG.fallbackGamemode || 'terrortown';
    el.slots.textContent = (CFG.fallbackMaxPlayers || 32) + ' Slots';

    /* Rückfallebene: URL-Parameter aus sv_loadingurl. */
    var urlMap = param(['map', 'mapname', 'm', 'nextmap']);
    var urlSteam = param(['steamid', 'steamid64', 's']);

    if (urlMap) setMap(urlMap);
    setPlayer(urlSteam);

    /* Meldet sich die Engine nach 4 s nicht, läuft eine Vorschau-Simulation.
       Sobald ein echter Callback kommt, übernimmt sofort wieder die Engine. */
    global.setTimeout(function () {
      if (!state.engineSpoke) {
        state.demo = true;
        LOG.info('Keine Engine gefunden — Vorschaumodus.');

        /* Ohne ?steamid= bliebe die Profilkarte leer. Fuer die Vorschau
           setzen wir ein Beispiel ein, deutlich als solches markiert. */
        if (!state.playerKnown && CFG.demoSteamId) {
          LOG.info('Beispielprofil fuer die Vorschau:', CFG.demoSteamId);
          setPlayer(CFG.demoSteamId, true);
        }
        el.status.textContent = 'Vorschaumodus (kein Server verbunden)';
      }
    }, 4000);

    global.requestAnimationFrame(frame);
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window, document);
