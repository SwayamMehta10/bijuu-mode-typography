/**
 * The four critical Day-1 tests on `iterateClusters`. These are load-bearing
 * for the entire Pretext-exclusivity pitch — if any one of them fails, the
 * D1 Rasengan demo cannot honestly claim that Pretext does what naive
 * `ctx.measureText` + per-char iteration cannot.
 *
 * Strategy: assert cluster STRINGS, not widths. Widths come from a deterministic
 * mock canvas in test-setup.ts and aren't meaningful here. The cluster strings
 * are what prove correctness — they show the conjuncts, combining marks, and
 * ZWJ sequences are kept atomic.
 *
 * "Expected" cluster lists are computed against `Intl.Segmenter` directly so
 * the tests stay portable across ICU versions: we're verifying that Pretext's
 * iteration agrees with the platform's grapheme segmentation, not pinning a
 * specific cluster table.
 */

import { describe, it, expect } from 'vitest'
import { clustersOf } from './pretext-util'

const FONT = '18px Inter'

function expectedClusters(s: string): string[] {
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return [...seg.segment(s)].map((g) => g.segment)
}

describe('iterateClusters — the four Day-1 critical cases', () => {
  it('Devanagari conjunct: स्ते stays as one cluster inside नमस्ते', () => {
    const text = 'नमस्ते'
    const clusters = clustersOf(text, FONT).map((c) => c.text)

    // Three grapheme clusters — न, म, स्ते — even though the UTF-16 length is 6.
    // The third cluster MUST contain the virama-joined स + त + े matra as one
    // unit, not split into orphaned codepoints.
    expect(clusters).toEqual(expectedClusters(text))
    expect(clusters).toHaveLength(3)
    expect(clusters[2]).toBe('स्ते')
    expect(clusters[2]!.length).toBeGreaterThan(1) // multi-codepoint cluster

    // Hard receipt: the virama (U+094D) and the matra (U+0947) are NEVER
    // emitted as standalone clusters. That's the whole point.
    expect(clusters).not.toContain('\u094D')
    expect(clusters).not.toContain('\u0947')
  })

  it('Thai combining marks: tone marks stack onto consonants, not orphaned', () => {
    // นินจา = ninja in Thai. Cluster boundaries (Intl.Segmenter, Unicode 15+):
    //   ["นิ", "น", "จ", "า"] — the vowel mark ิ stays with its base consonant น.
    const text = 'นินจา'
    const clusters = clustersOf(text, FONT).map((c) => c.text)

    expect(clusters).toEqual(expectedClusters(text))
    expect(clusters).toHaveLength(4)
    expect(clusters[0]).toBe('นิ')

    // The combining vowel mark ิ (U+0E34) and tone marks must never appear
    // as their own cluster. If naive per-char iteration is happening, ิ
    // would show up as cluster 1 alone — that's the failure mode this test
    // is guarding against.
    expect(clusters).not.toContain('\u0E34')
    expect(clusters).not.toContain('\u0E48') // mai ek tone mark
    expect(clusters).not.toContain('\u0E49') // mai tho tone mark
  })

  it('ZWJ emoji family: 👨‍👩‍👧 is one cluster, not three people + two ZWJs', () => {
    // Family: man + ZWJ + woman + ZWJ + girl. UTF-16 length is 8 code units
    // (4 surrogate pairs interleaved with 2 ZWJs). One grapheme cluster.
    const text = '👨\u200D👩\u200D👧'
    const clusters = clustersOf(text, FONT).map((c) => c.text)

    expect(clusters).toEqual(expectedClusters(text))
    expect(clusters).toHaveLength(1)
    expect(clusters[0]).toBe(text)

    // Hard receipt: the ZWJ codepoint (U+200D) must never appear as its own
    // cluster, and neither should the individual person emojis split out.
    expect(clusters).not.toContain('\u200D')
    expect(clusters).not.toContain('👨')
    expect(clusters).not.toContain('👩')
    expect(clusters).not.toContain('👧')
  })

  it('Plain Latin "Hello": one cluster per character, in order', () => {
    // The boring baseline. If this regresses, everything else is moot.
    const text = 'Hello'
    const clusters = clustersOf(text, FONT).map((c) => c.text)

    expect(clusters).toEqual(['H', 'e', 'l', 'l', 'o'])
    expect(clusters).toEqual(expectedClusters(text))

    // And every cluster has a positive width under the (mocked) measurement.
    const widths = clustersOf(text, FONT).map((c) => c.width)
    expect(widths.every((w) => w > 0)).toBe(true)
  })
})
