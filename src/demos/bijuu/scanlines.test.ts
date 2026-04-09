/**
 * Scanline extractor tests.
 *
 * These test the pure `extractScanlinesFromImageData` function with hand-crafted
 * RGBA pixel arrays — no SVG loading, no canvas, no jsdom. The shapes are
 * synthesized in code so each test asserts a specific scanline behavior in
 * isolation.
 *
 * The browser-only `extractScanlines(svgUrl)` is exercised manually in the
 * demo. Trying to test it in node would require either jsdom + node-canvas
 * (~25MB binary deps) or a Playwright harness — both worse than just
 * verifying the math in pure functions.
 */

import { describe, it, expect, vi } from 'vitest'
import { extractScanlinesFromImageData } from './scanlines'

/**
 * Build a width × height RGBA pixel buffer from a `mask` callback.
 * mask(x, y) returns true if the pixel is opaque, false if transparent.
 * Opaque pixels are filled with full black; transparent pixels are zero.
 */
function makePixels(
  width: number,
  height: number,
  mask: (x: number, y: number) => boolean,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask(x, y)) {
        const idx = (y * width + x) * 4
        data[idx] = 0 // R
        data[idx + 1] = 0 // G
        data[idx + 2] = 0 // B
        data[idx + 3] = 255 // A
      }
    }
  }
  return data
}

describe('extractScanlinesFromImageData', () => {
  it('square: every row has identical width matching the square size', () => {
    // 100x100 canvas, 60x60 black square centered at (20..79, 20..79)
    const w = 100
    const h = 100
    const pixels = makePixels(w, h, (x, y) => x >= 20 && x <= 79 && y >= 20 && y <= 79)

    const sl = extractScanlinesFromImageData(pixels, w, h, { minLineWidth: 40 })

    expect(sl.width).toBe(100)
    expect(sl.height).toBe(100)
    expect(sl.top).toBe(20)
    expect(sl.bottom).toBe(79)

    // All rows inside the square have width 60 (60 >= minLineWidth=40 → usable)
    for (let y = 20; y <= 79; y++) {
      expect(sl.rows[y]!.left).toBe(20)
      expect(sl.rows[y]!.right).toBe(79)
      expect(sl.rows[y]!.width).toBe(60)
      expect(sl.rows[y]!.usable).toBe(true)
    }
    // Rows above and below are empty / unusable
    expect(sl.rows[0]!.usable).toBe(false)
    expect(sl.rows[99]!.usable).toBe(false)
  })

  it('circle: middle rows are widest, top and bottom rows narrow or unusable', () => {
    // 100x100 canvas, circle radius 40 centered at (50, 50)
    const w = 100
    const h = 100
    const cx = 50
    const cy = 50
    const r = 40
    const pixels = makePixels(w, h, (x, y) => {
      const dx = x - cx
      const dy = y - cy
      return dx * dx + dy * dy <= r * r
    })

    const sl = extractScanlinesFromImageData(pixels, w, h, { minLineWidth: 40 })

    // The middle row (y=50) should be the widest — full diameter ≈ 81 pixels
    const midRow = sl.rows[50]!
    expect(midRow.usable).toBe(true)
    expect(midRow.width).toBeGreaterThanOrEqual(80)
    expect(midRow.left).toBeLessThanOrEqual(11)
    expect(midRow.right).toBeGreaterThanOrEqual(89)

    // The widest row in the table should be the middle row, by construction
    let widestY = -1
    let widestW = -1
    for (let y = 0; y < h; y++) {
      if (sl.rows[y]!.width > widestW) {
        widestW = sl.rows[y]!.width
        widestY = y
      }
    }
    // For a circle with even diameter the widest row falls at y=50 ± 1
    expect(Math.abs(widestY - 50)).toBeLessThanOrEqual(1)

    // Top and bottom of the circle have very narrow rows that get marked unusable
    // The first and last few rows (y near 10 or y near 90) are < 40px wide
    expect(sl.rows[10]!.usable).toBe(false)
    expect(sl.rows[90]!.usable).toBe(false)

    // top and bottom should bracket the usable rows
    expect(sl.top).toBeGreaterThan(10)
    expect(sl.top).toBeLessThan(50)
    expect(sl.bottom).toBeGreaterThan(50)
    expect(sl.bottom).toBeLessThan(90)
  })

  it('non-convex row: warns and picks the widest contiguous interval', () => {
    // 100x100 canvas. Single row (y=50) has TWO opaque intervals:
    //   small interval x=10..14 (5px wide)
    //   large interval x=30..89 (60px wide)
    // The extractor must warn and pick the larger interval.
    const w = 100
    const h = 100
    const pixels = makePixels(w, h, (x, y) => {
      if (y !== 50) return false
      if (x >= 10 && x <= 14) return true
      if (x >= 30 && x <= 89) return true
      return false
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const sl = extractScanlinesFromImageData(pixels, w, h, { minLineWidth: 40 })

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]![0]).toContain('non-convex row at y=50')
    expect(warnSpy.mock.calls[0]![0]).toContain('2 intervals')

    // The chosen interval is the widest one (x=30..89, width=60)
    expect(sl.rows[50]!.left).toBe(30)
    expect(sl.rows[50]!.right).toBe(89)
    expect(sl.rows[50]!.width).toBe(60)
    expect(sl.rows[50]!.usable).toBe(true)

    warnSpy.mockRestore()
  })

  it('empty image: zero usable rows, top === bottom === 0', () => {
    // 50x50 canvas, all transparent
    const pixels = makePixels(50, 50, () => false)

    const sl = extractScanlinesFromImageData(pixels, 50, 50, { minLineWidth: 40 })

    expect(sl.top).toBe(0)
    expect(sl.bottom).toBe(0)
    expect(sl.width).toBe(50)
    expect(sl.height).toBe(50)
    for (const row of sl.rows) {
      expect(row.usable).toBe(false)
      expect(row.width).toBe(0)
    }
  })
})
