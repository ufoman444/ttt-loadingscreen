/* ══════════════════════════════════════════════════════════════════════════
   ZUORDNUNG: WORKSHOP-ADDON → MAPNAME

   Steam verrät nicht, welche .bsp in einem Addon steckt — es gibt schlicht
   keinen Endpunkt dafür. Der Mapname muss deshalb aus Tag, Titel und
   Beschreibung erschlossen werden. Das ist Erfahrungswissen, kein Algorithmus,
   und genau deshalb liegt es hier isoliert und unter Test (tests/mapnames.test.mjs).
   ══════════════════════════════════════════════════════════════════════════ */

/** Übliche Map-Präfixe in Source-Spielen. Erweitern, falls eines fehlt. */
export const PREFIXE = ['ttt', 'gm', 'de', 'cs', 'zs', 'ph', 'dm', 'rp', 'mu', 'ba', 'aim', 'surf', 'jb'];

/** Erkennt Mapnamen wie `ttt_minecraft_b5` in freiem Text. */
export const MAP_RE = new RegExp(
  String.raw`\b((?:${PREFIXE.join('|')})_[a-z0-9][a-z0-9_\-]{2,60})\b`, 'gi'
);

const PREFIX_RE = new RegExp(String.raw`\b(${PREFIXE.join('|')})\b`, 'g');

/**
 * Reduziert einen Namen auf Kleinbuchstaben und Ziffern.
 * @param {string} s
 * @returns {string}
 */
export function normalisieren(s) {
  return String(s).toLowerCase().replace(/\.bsp$/, '').replace(/[^a-z0-9]/g, '');
}

/**
 * Reduziert Titel und Mapname auf ihren Kern — Präfixe und Zierrat fallen weg:
 * "[TTT] Juniper Lodge" → "juniperlodge", "ttt_clue" → "clue".
 *
 * Wichtig ist die Reihenfolge: erst alles Trennende zu Leerzeichen machen,
 * dann die Präfixe entfernen. Andernfalls greift die Wortgrenze hinter einem
 * Unterstrich nicht und "ttt_archives" behielte sein Präfix.
 * @param {string} s
 * @returns {string}
 */
export function kern(s) {
  return String(s).toLowerCase()
    .replace(/\.bsp$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(PREFIX_RE, ' ')
    .replace(/\s+/g, '');
}

/**
 * Entscheidet, ob ein in der Beschreibung gefundener Mapname wirklich zu diesem
 * Addon gehört. Ohne diese Prüfung reißt "[TTT] GSF Assault" die fremde Map
 * `cs_assault` an sich, die es nur als benötigten Inhalt erwähnt.
 *
 * Der Vergleich ist vorne verankert: "archives" passt zu "archivesge5v1b",
 * aber "assault" nicht zu "gsfassault".
 * @param {string} mapname
 * @param {string} titel Addon-Titel
 * @returns {boolean}
 */
export function passtZumTitel(mapname, titel) {
  const a = kern(mapname), b = kern(titel);
  if (a.length < 4 || b.length < 4) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Prüft, ob ein Addon überhaupt eine Map ist. Garry's Mod vergibt das Tag
 * kleingeschrieben ("map"), andere Quellen schreiben es groß — daher der
 * Vergleich ohne Rücksicht auf Groß- und Kleinschreibung.
 * @param {{tags?: Array<{tag: string}>}} item
 * @returns {boolean}
 */
export function istMap(item) {
  return (item.tags || []).some(t => String(t.tag).toLowerCase() === 'map');
}

/**
 * Erschließt die Mapnamen eines Addons.
 *
 * Zuerst zählt der Titel, dann — falls erlaubt — die Beschreibung, aber nur
 * mit Treffern, die zum Titel passen. Bleibt nichts übrig, ist das Addon immer
 * noch über seinen normalisierten Titel auffindbar; das signalisiert
 * `sicher: false`.
 * @param {{title?: string, description?: string}} item
 * @param {{strikt?: boolean}} [optionen] `strikt` ignoriert die Beschreibung
 * @returns {{namen: string[], quelle: 'titel'|'beschreibung'|'titel-normalisiert', sicher: boolean}}
 */
export function mapnamenFinden(item, optionen = {}) {
  const titel = item.title || '';
  const beschreibung = (item.description || '').slice(0, 2000);

  const ausTitel = [...titel.matchAll(MAP_RE)].map(m => m[1].toLowerCase());
  if (ausTitel.length) return { namen: [...new Set(ausTitel)], quelle: 'titel', sicher: true };

  if (!optionen.strikt) {
    const ausBeschreibung = [...new Set([...beschreibung.matchAll(MAP_RE)].map(m => m[1].toLowerCase()))]
      .filter(n => passtZumTitel(n, titel));
    if (ausBeschreibung.length) return { namen: ausBeschreibung, quelle: 'beschreibung', sicher: true };
  }

  return { namen: [], quelle: 'titel-normalisiert', sicher: false };
}
