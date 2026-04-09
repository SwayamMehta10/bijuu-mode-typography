/**
 * Detect which Unicode scripts are present in a string. Used by D1 to pick
 * the right font for free-form input (per design doc issue 2B).
 *
 * Returns a Set of ISO 15924 script tags. Common values:
 *   - 'Latn' (Latin)
 *   - 'Deva' (Devanagari)
 *   - 'Thai'
 *   - 'Hani' (Han / CJK ideographs — Japanese kanji and Chinese hanzi share this)
 *   - 'Hira' (Hiragana)
 *   - 'Kana' (Katakana)
 *   - 'Zyyy' (Common — punctuation, digits, symbols including most emoji)
 *   - 'Zinh' (Inherited — combining marks)
 *
 * Why this matters: Pretext's `prepareWithSegments(text, font)` takes a SINGLE
 * font per call. To measure correctly across multiple scripts, the demo either
 * has to (a) detect the scripts present and segment the input, or (b) use a
 * broad-coverage fallback font. The design doc chose option (b) for free-form
 * input and option (a) for the pre-filled example buttons. This function
 * supports both: detection of scripts present + a helper to pick the right
 * font for the dominant script.
 */

export type ScriptTag = string

/**
 * Returns the set of Unicode script tags present in the input.
 * Empty input returns an empty set.
 */
export function detectScripts(text: string): Set<ScriptTag> {
  const scripts = new Set<ScriptTag>()
  if (text.length === 0) return scripts

  // Iterate code points (not code units) so surrogate pairs and astral plane
  // characters are handled correctly.
  for (const ch of text) {
    const tag = scriptOf(ch)
    if (tag) scripts.add(tag)
  }
  return scripts
}

/**
 * Returns the script tag of a single code point, or null if no script
 * matches (e.g., for whitespace).
 *
 * Implementation note: ES2018 Unicode property escapes (`\p{Script=...}`) are
 * required. Modern browsers (Chrome 64+, Safari 11.1+, Firefox 78+) all support
 * them, so no polyfill needed for the demo's target audience.
 */
export function scriptOf(ch: string): ScriptTag | null {
  if (DEVA_RE.test(ch)) return 'Deva'
  if (THAI_RE.test(ch)) return 'Thai'
  if (HANI_RE.test(ch)) return 'Hani'
  if (HIRA_RE.test(ch)) return 'Hira'
  if (KANA_RE.test(ch)) return 'Kana'
  if (LATN_RE.test(ch)) return 'Latn'
  if (COMMON_RE.test(ch)) return 'Zyyy'
  if (INHERITED_RE.test(ch)) return 'Zinh'
  return null
}

// Pre-compiled regexes. Each must use the `u` flag for property escapes to
// work, and we test single characters so we don't need the global flag.
const DEVA_RE = /\p{Script=Devanagari}/u
const THAI_RE = /\p{Script=Thai}/u
const HANI_RE = /\p{Script=Han}/u
const HIRA_RE = /\p{Script=Hiragana}/u
const KANA_RE = /\p{Script=Katakana}/u
const LATN_RE = /\p{Script=Latin}/u
const COMMON_RE = /\p{Script=Common}/u
const INHERITED_RE = /\p{Script=Inherited}/u

/**
 * Pick the best font family for free-form input given the scripts detected.
 * The picker prefers script-tuned fonts when input is mostly one script, and
 * falls back to a broad-coverage font for mixed input.
 *
 * Per design doc issue 2B: this function is used for free-form typing only.
 * The pre-filled example buttons override with their own tuned font.
 */
export function pickFontForScripts(scripts: Set<ScriptTag>): string {
  // Strip out scripts that don't carry their own font (whitespace, marks).
  const meaningful = new Set(scripts)
  meaningful.delete('Zyyy')
  meaningful.delete('Zinh')

  if (meaningful.size === 0) return 'Inter' // empty or pure-emoji
  if (meaningful.size === 1) {
    const only = [...meaningful][0]
    if (only === 'Deva') return 'Noto Sans Devanagari'
    if (only === 'Thai') return 'Noto Sans Thai'
    if (only === 'Hani' || only === 'Hira' || only === 'Kana') return 'Noto Sans JP'
    return 'Inter'
  }
  // Mixed scripts: fall back to broad-coverage Noto Sans, or Noto Sans CJK
  // when CJK is present (CJK fonts are huge so we only load it on demand).
  if (meaningful.has('Hani') || meaningful.has('Hira') || meaningful.has('Kana')) {
    return 'Noto Sans JP'
  }
  return 'Noto Sans'
}
