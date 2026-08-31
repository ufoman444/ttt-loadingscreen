/* ══════════════════════════════════════════════════════════════════════════
   TTT LOADINGSCREEN — MUSIK
   Zwei Betriebsarten:
     'elevator'  Prozedural erzeugte Fahrstuhlmusik über die Web Audio API.
                 Keine Audiodatei, kein Traffic, keine Lizenzfrage.
     'url'       Eine beliebige MP3/OGG/Stream-URL aus der Konfiguration.
   Öffentliche API:  TTTMusic.init(cfg) · .toggle() · .play() · .stop()
                     .setGameVolume(v) · .onChange(cb) · .isPlaying()
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'ttt_loading_music_muted';
  var VOLUME_KEY  = 'ttt_loading_music_volume';

  /* ── Zustand ──────────────────────────────────────────────────────────── */
  var cfg        = {};
  var listeners  = [];
  var playing    = false;
  var blocked    = false;   // Autoplay vom Browser verweigert
  var gameVolume = 1;       // Lautstärkeregler des Spielers (aus GameDetails)
  var userVolume = null;    // Regler auf der Seite (0–1), überschreibt cfg.volume

  var ctx = null, master = null, engine = null, audioEl = null;

  /* ── Hilfen ───────────────────────────────────────────────────────────── */
  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](playing, blocked); } catch (e) { /* egal */ }
    }
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  /* Die tatsächliche Ausgabelautstärke ergibt sich aus dem Regler auf der
     Seite und — sofern gewünscht — dem Lautstärkeregler des Spielers, den
     Garry's Mod über GameDetails mitschickt. */
  function targetVolume() {
    var base = userVolume !== null ? userVolume
             : (typeof cfg.volume === 'number' ? cfg.volume : 0.35);
    var game = cfg.respectGameVolume === false ? 1 : gameVolume;
    return clamp01(base * game);
  }

  function ladeVolume() {
    if (cfg.rememberChoice === false) return null;
    try {
      var v = global.localStorage.getItem(VOLUME_KEY);
      if (v === null) return null;
      v = parseFloat(v);
      return isNaN(v) ? null : clamp01(v);
    } catch (e) { return null; }
  }

  function merkeVolume(v) {
    if (cfg.rememberChoice === false) return;
    try { global.localStorage.setItem(VOLUME_KEY, String(v)); } catch (e) { /* egal */ }
  }

  function remember(muted) {
    if (cfg.rememberChoice === false) return;
    try { global.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch (e) { /* egal */ }
  }

  function wasMuted() {
    if (cfg.rememberChoice === false) return false;
    try { return global.localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
  }

  /* ══════════════════════════════════════════════════════════════════════
     FAHRSTUHLMUSIK-GENERATOR
     Vier Takte ii–V–I-Kitsch in C-Dur, 84 BPM, mit Pad, Bass, Lead und
     einem sehr höflichen Schlagzeug. Genau so nervig wie ein echter Aufzug.
     ══════════════════════════════════════════════════════════════════════ */
  function ElevatorEngine(audioCtx, out) {
    var BPM        = 84;
    var beat       = 60 / BPM;
    var LOOKAHEAD  = 0.12;   // Sekunden im Voraus geplant
    var TICK       = 25;     // ms Timer-Intervall

    /* Cmaj7 · Am7 · Dm7 · G7 — der Fahrstuhl-Kanon schlechthin */
    var progression = [
      { chord: [60, 64, 67, 71], bass: 36, scale: [60, 62, 64, 67, 69, 71] },
      { chord: [57, 60, 64, 67], bass: 33, scale: [57, 60, 62, 64, 67, 69] },
      { chord: [62, 65, 69, 72], bass: 38, scale: [62, 65, 67, 69, 72, 74] },
      { chord: [55, 59, 62, 65], bass: 31, scale: [55, 59, 62, 65, 67, 71] }
    ];

    var timer = null;
    var nextNoteTime = 0;
    var step = 0;            // Achtel-Zähler, 8 pro Takt
    var nodes = [];          // laufende Oszillatoren zum Aufräumen

    var bus = audioCtx.createGain();
    bus.gain.value = 1;

    /* Weicher Filter — nimmt der Sache die Schärfe. */
    var tone = audioCtx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    tone.Q.value = 0.4;

    /* Billiger Hall: ein Delay mit Rückkopplung. Reicht völlig. */
    var delay = audioCtx.createDelay(1.0);
    delay.delayTime.value = 0.34;
    var feedback = audioCtx.createGain();
    feedback.gain.value = 0.28;
    var wet = audioCtx.createGain();
    wet.gain.value = 0.22;

    bus.connect(tone);
    tone.connect(out);
    tone.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(out);

    function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

    function track(node, stopAt) {
      nodes.push(node);
      node.onended = function () {
        var i = nodes.indexOf(node);
        if (i >= 0) nodes.splice(i, 1);
      };
      node.stop(stopAt);
    }

    /* Ein Ton mit Hüllkurve. */
    function voice(opts) {
      var t = opts.time;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();

      osc.type = opts.type || 'sine';
      osc.frequency.value = hz(opts.midi);
      if (opts.detune) osc.detune.value = opts.detune;

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(opts.peak, t + opts.attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.attack + opts.release);

      osc.connect(gain);
      gain.connect(bus);
      osc.start(t);
      track(osc, t + opts.attack + opts.release + 0.05);
      return osc;
    }

    /* Lead mit leichtem Vibrato — das Sahnehäubchen auf der Aufzugstorte. */
    function leadVoice(midi, t, dur) {
      var osc = voice({ midi: midi, time: t, type: 'triangle', peak: 0.075, attack: 0.06, release: dur });
      var lfo = audioCtx.createOscillator();
      var lfoGain = audioCtx.createGain();
      lfo.frequency.value = 5.2;
      lfoGain.gain.value = 4.5;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      lfo.start(t);
      track(lfo, t + dur + 0.1);
    }

    /* Sehr dezenter Hi-Hat-Tupfer aus gefiltertem Rauschen. */
    function hat(t) {
      var len = Math.floor(audioCtx.sampleRate * 0.05);
      var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);

      var src = audioCtx.createBufferSource();
      src.buffer = buf;
      var hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      var g = audioCtx.createGain();
      g.gain.value = 0.05;

      src.connect(hp); hp.connect(g); g.connect(bus);
      src.start(t);
    }

    function scheduleStep(n, t) {
      var barIndex = Math.floor(n / 8) % progression.length;
      var slot = progression[barIndex];
      var inBar = n % 8;

      /* Pad: liegt satt auf der Eins jedes Takts. */
      if (inBar === 0) {
        for (var i = 0; i < slot.chord.length; i++) {
          voice({
            midi: slot.chord[i], time: t, type: 'triangle',
            peak: 0.045, attack: 0.9, release: beat * 3.4,
            detune: (i - 1.5) * 5
          });
        }
      }

      /* Bass: Grundton auf 1, Quinte auf 3. */
      if (inBar === 0 || inBar === 4) {
        voice({
          midi: inBar === 0 ? slot.bass : slot.bass + 7,
          time: t, type: 'sine', peak: 0.12, attack: 0.02, release: beat * 1.1
        });
      }

      /* Lead: spielt gern, aber nicht ununterbrochen. */
      if (inBar % 2 === 0 && Math.random() < 0.68) {
        var note = slot.scale[Math.floor(Math.random() * slot.scale.length)] + 12;
        leadVoice(note, t, beat * (Math.random() < 0.3 ? 1.4 : 0.75));
      }

      /* Hi-Hat auf den Achteln dazwischen. */
      if (inBar % 2 === 1) hat(t);
    }

    function tick() {
      while (nextNoteTime < audioCtx.currentTime + LOOKAHEAD) {
        scheduleStep(step, nextNoteTime);
        nextNoteTime += beat / 2;   // Achtel
        step++;
      }
    }

    this.start = function () {
      if (timer) return;
      nextNoteTime = audioCtx.currentTime + 0.15;
      step = 0;
      tick();
      timer = global.setInterval(tick, TICK);
    };

    this.stop = function () {
      if (timer) { global.clearInterval(timer); timer = null; }
      var now = audioCtx.currentTime;
      for (var i = nodes.length - 1; i >= 0; i--) {
        try { nodes[i].stop(now); } catch (e) { /* lief schon aus */ }
      }
      nodes.length = 0;
    };
  }

  /* ══════════════════════════════════════════════════════════════════════
     Audio-Kette aufbauen
     ══════════════════════════════════════════════════════════════════════ */
  function ensureContext() {
    if (ctx) return true;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    return true;
  }

  function fadeMaster(to, seconds) {
    if (!master) return;
    var now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.linearRampToValueAtTime(to, now + seconds);
  }

  /* ══════════════════════════════════════════════════════════════════════
     Öffentliche API
     ══════════════════════════════════════════════════════════════════════ */
  var TTTMusic = {

    init: function (musicConfig) {
      cfg = musicConfig || {};
      if (cfg.mode === 'off') return;

      /* Zuletzt eingestellte Lautstärke wiederherstellen. */
      var gemerkt = ladeVolume();
      userVolume = gemerkt !== null ? gemerkt
                 : (typeof cfg.volume === 'number' ? cfg.volume : 0.35);

      if (cfg.mode === 'url' && cfg.musicUrl) {
        audioEl = new global.Audio(cfg.musicUrl);
        audioEl.loop = cfg.loop !== false;
        audioEl.preload = 'auto';
        audioEl.volume = targetVolume();
      }

      if (cfg.autoplay !== false && !wasMuted() && userVolume > 0) {
        // Erst versuchen. Wird es blockiert, meldet sich der Knopf.
        this.play();
      } else {
        emit();
      }

      /* Fällt Autoplay aus, startet die erste Interaktion die Musik. */
      var self = this;
      var kick = function () {
        if (blocked && !playing && !wasMuted() && userVolume > 0) self.play();
        global.removeEventListener('pointerdown', kick);
        global.removeEventListener('keydown', kick);
      };
      global.addEventListener('pointerdown', kick);
      global.addEventListener('keydown', kick);
    },

    play: function () {
      if (cfg.mode === 'off') return;

      /* Variante A: eigene Datei */
      if (audioEl) {
        audioEl.volume = targetVolume();
        var p = audioEl.play();
        if (p && typeof p.then === 'function') {
          p.then(function () {
            playing = true; blocked = false; remember(false); emit();
          })['catch'](function () {
            playing = false; blocked = true; emit();
          });
        } else {
          playing = true; blocked = false; emit();
        }
        return;
      }

      /* Variante B: Fahrstuhlmusik aus dem Nichts */
      if (!ensureContext()) { blocked = true; emit(); return; }

      var finish = function () {
        if (!engine) engine = new ElevatorEngine(ctx, master);
        engine.start();
        fadeMaster(targetVolume(), 1.6);
        playing = true; blocked = false; remember(false); emit();
      };

      if (ctx.state === 'suspended') {
        var r = ctx.resume();
        if (r && typeof r.then === 'function') {
          r.then(finish)['catch'](function () { blocked = true; emit(); });
        } else { finish(); }
      } else {
        finish();
      }
    },

    stop: function () {
      if (audioEl) { audioEl.pause(); }
      if (engine) {
        fadeMaster(0.0001, 0.5);
        var e = engine;
        global.setTimeout(function () { e.stop(); }, 560);
        engine = null;
      }
      playing = false;
      remember(true);
      emit();
    },

    toggle: function () {
      if (playing) this.stop(); else this.play();
      return playing;
    },

    /* GMod liefert den Lautstärkeregler des Spielers über GameDetails. */
    setGameVolume: function (v) {
      if (typeof v !== 'number' || isNaN(v)) return;
      gameVolume = clamp01(v);
      if (audioEl) audioEl.volume = targetVolume();
      if (playing && master) fadeMaster(targetVolume(), 0.4);
    },

    /* ── Lautstärkeregler auf der Seite ─────────────────────────────────────
       v = 0..1. Auf 0 gezogen hört die Musik auf, beim Hochziehen fängt sie
       von selbst wieder an — genau das, was man von einem Regler erwartet.
       ───────────────────────────────────────────────────────────────────── */
    setVolume: function (v, merken) {
      if (typeof v !== 'number' || isNaN(v)) return;
      userVolume = clamp01(v);
      if (merken !== false) merkeVolume(userVolume);

      if (userVolume === 0) {
        if (playing) this.stop();
        return;
      }

      if (audioEl) audioEl.volume = targetVolume();
      if (playing && master) fadeMaster(targetVolume(), 0.12);
      if (!playing) this.play();
    },

    getVolume: function () {
      return userVolume !== null ? userVolume
           : (typeof cfg.volume === 'number' ? cfg.volume : 0.35);
    },

    isPlaying: function () { return playing; },
    isBlocked: function () { return blocked; },
    onChange:  function (cb) { if (typeof cb === 'function') { listeners.push(cb); cb(playing, blocked); } }
  };

  global.TTTMusic = TTTMusic;

})(window);
