/**
 * Abstraction layer over Pretext's API surface.
 *
 * Day-1 verification result (2026-04-08): Pretext exposes its prepared text as
 * a set of parallel arrays keyed by segment index. The shape relevant to
 * grapheme-cluster iteration is:
 *
 *   prepared.segments: string[]              — segment text (word, space, etc.)
 *   prepared.widths:   number[]              — measured width of each segment
 *   prepared.kinds:    SegmentBreakKind[]    — 'text' | 'space' | 'hard-break' | …
 *   prepared.breakableWidths: (number[] | null)[]
 *       — for word-like multi-grapheme segments, this holds per-grapheme widths
 *         (computed by Pretext via Intl.Segmenter at grapheme granularity).
 *         For single-char segments, single CJK graphemes, ZWJ emoji clusters,
 *         and non-text kinds, this entry is null.
 *
 * Outcome (Y, hybrid): walk segments and yield clusters. For text segments
 * with breakableWidths populated, walk the segment string with Intl.Segmenter
 * and pair each grapheme with the corresponding pre-measured width. For all
 * other visible segments (CJK per-char text segments, single-grapheme words,
 * spaces, ZWJ emoji families) yield the segment as one cluster with widths[i].
 * Control segments (hard-break, tab, soft-hyphen, zero-width-break) are
 * skipped — they have no glyphs to render.
 *
 * Why this is the right shape: Pretext's CJK path already breaks each
 * ideograph into its own segment with kinsoku punctuation merging, so
 * iterating CJK is "yield each segment". For Latin/Devanagari/Thai, the
 * cluster split lives in `breakableWidths`, which is exactly what we want.
 * No second canvas measurement, no per-cluster `prepareWithSegments` calls.
 */

import { prepareWithSegments, type PreparedTextWithSegments } from '@chenglou/pretext'

export interface Cluster {
  /** The grapheme cluster as a string (one user-perceived character) */
  text: string
  /** Width in CSS pixels under the prepared font */
  width: number
}

// Lazily constructed — Intl.Segmenter is heavy to instantiate, light to reuse.
let graphemeSegmenter: Intl.Segmenter | null = null
function getGraphemeSegmenter(): Intl.Segmenter {
  if (graphemeSegmenter === null) {
    graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  }
  return graphemeSegmenter
}

/**
 * Iterate over the grapheme clusters in a prepared Pretext text, yielding
 * each cluster's text and measured width. Control segments (line breaks,
 * tabs, soft hyphens, zero-width breaks) are skipped. Spaces are yielded as
 * single clusters so the caller can decide whether to render or filter them.
 */
export function* iterateClusters(prepared: PreparedTextWithSegments): Iterable<Cluster> {
  // Pretext's runtime objects are branded; access the parallel arrays through
  // an unbranded view to avoid fighting the opaque type.
  const view = prepared as unknown as {
    segments: string[]
    widths: number[]
    kinds: string[]
    breakableWidths: (number[] | null)[]
  }
  const { segments, widths, kinds, breakableWidths } = view

  for (let i = 0; i < segments.length; i++) {
    const segText = segments[i]!
    const kind = kinds[i]!
    const segWidth = widths[i]!

    // Skip control segments — they don't render glyphs.
    if (
      kind === 'hard-break' ||
      kind === 'tab' ||
      kind === 'soft-hyphen' ||
      kind === 'zero-width-break'
    ) {
      continue
    }

    // Spaces are atomic — one cluster per space segment.
    if (kind === 'space' || kind === 'preserved-space') {
      yield { text: segText, width: segWidth }
      continue
    }

    // Text segment. Use pre-computed per-grapheme widths if Pretext cached
    // them; otherwise treat the whole segment as a single cluster (CJK
    // per-char path, single-char words, ZWJ emoji families).
    const perGrapheme = breakableWidths[i]
    if (perGrapheme !== null && perGrapheme.length > 0) {
      const segmenter = getGraphemeSegmenter()
      let k = 0
      for (const gs of segmenter.segment(segText)) {
        const w = perGrapheme[k] ?? 0
        yield { text: gs.segment, width: w }
        k++
      }
      continue
    }

    yield { text: segText, width: segWidth }
  }
}

/**
 * Convenience: prepare + iterate in one call. The font argument follows
 * Pretext's font format (CSS shorthand: e.g. `"18px Inter"`).
 */
export function clustersOf(text: string, font: string): Cluster[] {
  const prepared = prepareWithSegments(text, font)
  return [...iterateClusters(prepared)]
}
