/* ══════════════════════════════════════════════════════════════════════════
   TTT LOADINGSCREEN — KONFIGURATION
   Das ist die einzige Datei, die du als Admin anfassen musst.
   ══════════════════════════════════════════════════════════════════════════ */

window.TTT_CONFIG = {

  /* ─────────────────────────────────────────────────────────────────────────
     1) SERVER
     Wird normalerweise von Garry's Mod selbst überschrieben (GameDetails).
     Diese Werte sind nur der Fallback, falls die Seite im Browser aufgerufen
     wird (z. B. beim Testen).
     ───────────────────────────────────────────────────────────────────────── */
  serverName: 'Trouble in Terrorist Town',
  fallbackGamemode: 'terrortown',
  fallbackMaxPlayers: 10,

  /* ─────────────────────────────────────────────────────────────────────────
     2) REGELN
     Beliebig erweiterbar. `traitor: true` markiert die Regel rot mit Stempel.
     ───────────────────────────────────────────────────────────────────────── */
  rules: [
    { text: 'Fässer-Kills sind erlaubt.',        note: 'Physik ist keine Straftat.' },
    { text: 'Granaten-Kills sind erlaubt.',      note: 'Wer stehen bleibt, hat sich entschieden.' },
    { text: 'Crowbar-Schubs-Kills sind erlaubt.', note: 'Sanfter Schubs. Harte Landung.' },
    { text: 'freshmaster ist immer Traitor.',    note: 'Auch wenn er Innocent ist. Besonders dann.', traitor: true },
    { text: 'I-Try ist immer Traitor.',          note: 'Der Name ist ein Geständnis.',               traitor: true }
  ],

  /* ─────────────────────────────────────────────────────────────────────────
     3) MAP-VORSCHAUBILDER
     Key = exakter Mapname (klein geschrieben, ohne .bsp), Value = Bild-URL.
     Relative Pfade funktionieren (z. B. 'img/maps/ttt_minecraft_b5.jpg').

     Ist eine Map hier NICHT eingetragen, wird automatisch nach
     `img/maps/<mapname>.jpg` gesucht. Existiert auch das nicht, zeigt der
     Screen eine stylische "kein Bildmaterial"-Karte — nichts geht kaputt.
     ───────────────────────────────────────────────────────────────────────── */
  mapImages: {
    // 'ttt_minecraft_b5' : 'img/maps/ttt_minecraft_b5.jpg',
    // 'ttt_rooftops_a3'  : 'img/maps/ttt_rooftops_a3.jpg',
    // 'ttt_bb_bank'      : 'https://cdn.deine-domain.de/maps/bank.jpg'
  },

  /* ─────────────────────────────────────────────────────────────────────────
     3b) AUTOMATIK: VORSCHAUBILDER AUS DER STEAM-WORKSHOP-SAMMLUNG

     Statt Bilder von Hand abzulegen, kannst du sie einmalig aus deiner
     Workshop-Sammlung ziehen lassen:

         node scripts/fetch-workshop-maps.mjs <sammlungs-id>

     Das Skript schreibt js/maps.json und der Ladebildschirm bedient sich dort
     automatisch. Nach jeder Änderung an der Sammlung einmal neu ausführen.

     Auf '' setzen schaltet die Automatik ab.
     ───────────────────────────────────────────────────────────────────────── */
  workshopIndex: 'js/maps.json',

  /* ─────────────────────────────────────────────────────────────────────────
     3c) LIVE-SUCHE FÜR UNBEKANNTE MAPS

     Findet sich im Index nichts, kann der Ladebildschirm das Vorschaubild
     live im Workshop suchen. Damit bekommt auch eine Map, die du heute erst
     abonniert hast, sofort ein Bild — ohne dass du irgendetwas neu erzeugst.

     Dafür brauchst du eine der beiden mitgelieferten Mini-Schnittstellen
     (kein Steam-API-Key nötig):

        proxy/map-preview.php           → 'proxy/map-preview.php?map={map}'
        proxy/map-preview-function.js   → '/map-preview?map={map}'
                                          (Cloudflare Pages / Netlify)

     Leer lassen schaltet die Live-Suche ab; dann bleibt es beim Index.
     ───────────────────────────────────────────────────────────────────────── */
  mapLookupEndpoint: '/map-preview?map={map}',
  mapImageFolder: 'img/maps/',      // automatische Suche: <folder><mapname>.jpg
  mapImageExtensions: ['jpg', 'png', 'webp'],

  /* Optionale eigene Sprüche pro Map (sonst zufälliger Standardspruch). */
  mapHints: {
    // 'ttt_minecraft_b5': 'Ja, der Traitor kann die Wand wegbauen.'
  },

  /* ─────────────────────────────────────────────────────────────────────────
     4) MUSIK
     mode: 'elevator'  → prozedural erzeugte Fahrstuhlmusik (Standard).
                         Keine Datei, kein Download, keine GEMA-Diskussion.
           'url'       → eigene Datei/Stream aus `musicUrl`.
           'off'       → gar keine Musik.
     ───────────────────────────────────────────────────────────────────────── */
  music: {
    mode: 'elevator',
    musicUrl: '',                 // z. B. 'https://cdn.deine-domain.de/lobby.mp3'
    loop: true,
    volume: 0.35,                 // 0.0 – 1.0 (Grundlautstärke)
    respectGameVolume: true,      // GMod-Lautstärkeregler des Spielers beachten
    autoplay: true,               // startet automatisch (Fallback-Button, falls blockiert)
    rememberChoice: true          // Mute-Entscheidung im localStorage merken
  },

  /* ─────────────────────────────────────────────────────────────────────────
     5) SPIELERPROFIL
     Ohne Zusatzaufwand zeigt der Screen: SteamID64, Profil-Link, einen
     generierten Avatar und ein (humoristisches) Täterprofil.

     Willst du den echten Steam-Namen + Avatar, brauchst du einen kleinen
     Server-Proxy (proxy/steam.php liegt bei). Dann hier eintragen:
        profileEndpoint: 'proxy/steam.php?steamid={steamid}'
     Erwartete Antwort: {"name":"...","avatar":"https://..."}
     ───────────────────────────────────────────────────────────────────────── */
  profileEndpoint: '',

  /* ─────────────────────────────────────────────────────────────────────────
     6) TIPPS (rotierender Ticker unten)
     ───────────────────────────────────────────────────────────────────────── */
  tips: [
    'Ein Fass ist kein Möbelstück. Ein Fass ist eine Meinung.',
    '"Ich war die ganze Zeit bei dir" ist kein Alibi, sondern ein Motiv.',
    'Wer im Traitor-Raum steht, ist statistisch selten Innocent.',
    'Der Detective ist nicht dein Freund. Der Detective ist deine Lebensversicherung.',
    'Ungetestete Leichen sind wie ungelesene AGB: irgendwann rächt sich das.',
    'Discmord-Kommunikation ist Metagaming. Schweigen ist Gold.',
    'Wenn alle rennen, renn mit. Fragen kannst du im Jenseits stellen.',
    'Die Crowbar ist keine Waffe. Die Crowbar ist ein Vorschlag.',
    'C4 mit 45 Sekunden ist Kunst. C4 mit 10 Sekunden ist Panik.',
    'freshmaster ist Traitor. Das ist keine Regel, das ist Naturgesetz.',
    'Falls du das hier liest: der Ladebalken bewegt sich schneller, wenn du nicht hinschaust.'
  ],
  tipInterval: 7000,              // ms

  /* ─────────────────────────────────────────────────────────────────────────
     7) LADEBALKEN-TEXTE
     Werden abhängig vom Fortschritt angezeigt (rein kosmetisch).
     Der echte Server-Status steht immer klein darunter.
     ───────────────────────────────────────────────────────────────────────── */
  phases: [
    [  0, 'Verbindung wird aufgebaut' ],
    [  8, 'Tatort wird abgesperrt' ],
    [ 20, 'Fässer werden strategisch platziert' ],
    [ 35, 'Brechstangen werden geschärft' ],
    [ 50, 'Verdachtsmomente werden verteilt' ],
    [ 65, 'Traitor-Räume werden abgeschlossen' ],
    [ 78, 'Karma wird neu gewürfelt' ],
    [ 90, 'Letzte Leichen werden versteckt' ],
    [ 98, 'Gleich geht es los. Wirklich.' ]
  ]
};
