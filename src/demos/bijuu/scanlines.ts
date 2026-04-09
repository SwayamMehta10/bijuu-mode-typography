/**
 * Scanline extractor — turns an SVG silhouette into a per-row {left, right, width}
 * lookup table that the Bijuu layout loop uses to drive `layoutNextLineRange`.
 *
 * Two entry points:
 *
 *   extractScanlines(svgUrl, options)
 *     Browser path. Loads the SVG, rasterizes it to an offscreen canvas at
 *     min(naturalSize, maxRes), reads ImageData, then delegates to the pure
 *     extractor below. This is the path the demo actually uses.
 *
 *   extractScanlinesFromImageData(data, options)
 *     Pure function. Takes a width × height × 4 (RGBA) Uint8ClampedArray and
 *     returns the scanline table. Has zero browser dependencies and is the
 *     entry point the unit tests inject through, so we don't need jsdom or
 *     node-canvas just to verify the scanline math.
 *
 * V1 design constraints:
 *   - Single contiguous opaque interval per row. If a row has multiple
 *     intervals (silhouette is non-convex), we log a warning and pick the
 *     widest interval. True multi-interval layout (text routing through
 *     disjoint regions) is V2 scope.
 *   - Rows narrower than `minLineWidth` are marked unusable (skipped in the
 *     layout loop) — too narrow to fit a single word.
 *   - Alpha threshold for "opaque" is fixed at 128. SVG renderers may
 *     anti-alias edges; this threshold cuts cleanly through the AA fringe.
 */

export interface ScanlineRow {
  /** First opaque x-pixel in this row */
  left: number
  /** Last opaque x-pixel in this row (inclusive) */
  right: number
  /** right - left + 1 — width of the usable interval in pixels */
  width: number
  /** True if width >= minLineWidth and the row should be used by the layout */
  usable: boolean
}

export interface Scanlines {
  /** Length === height. Index by y-pixel. */
  rows: ScanlineRow[]
  /** First y where a usable row exists (inclusive). 0 if none. */
  top: number
  /** Last y where a usable row exists (inclusive). 0 if none. */
  bottom: number
  /** Canvas width in pixels */
  width: number
  /** Canvas height in pixels */
  height: number
}

export interface ExtractOptions {
  /** Cap the rasterized canvas size to this many pixels per side. Default 1024. */
  maxRes?: number
  /** Skip rows narrower than this. Default 40px. */
  minLineWidth?: number
}

const ALPHA_OPAQUE_THRESHOLD = 128

/**
 * Pure function — takes raw RGBA pixel data and produces the scanline table.
 * Zero browser dependencies. Used directly by tests.
 */
export function extractScanlinesFromImageData(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: ExtractOptions = {},
): Scanlines {
  const minLineWidth = options.minLineWidth ?? 40
  const rows: ScanlineRow[] = []

  let top = -1
  let bottom = -1

  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4

    // Walk the row collecting opaque intervals, so we can detect multi-interval
    // (non-convex) rows and warn before silently picking the widest.
    const intervals: { start: number; end: number }[] = []
    let intervalStart = -1

    for (let x = 0; x < width; x++) {
      const alpha = pixels[rowStart + x * 4 + 3]!
      const isOpaque = alpha >= ALPHA_OPAQUE_THRESHOLD
      if (isOpaque && intervalStart === -1) {
        intervalStart = x
      } else if (!isOpaque && intervalStart !== -1) {
        intervals.push({ start: intervalStart, end: x - 1 })
        intervalStart = -1
      }
    }
    if (intervalStart !== -1) {
      intervals.push({ start: intervalStart, end: width - 1 })
    }

    if (intervals.length === 0) {
      rows.push({ left: 0, right: 0, width: 0, usable: false })
      continue
    }

    // V1 multi-interval guard: pick the widest contiguous interval and warn.
    // True multi-interval layout is V2 scope.
    let chosen = intervals[0]!
    if (intervals.length > 1) {
      console.warn(
        `[scanlines] non-convex row at y=${y} (${intervals.length} intervals); picking widest`,
      )
      for (const iv of intervals) {
        if (iv.end - iv.start > chosen.end - chosen.start) chosen = iv
      }
    }

    const rowWidth = chosen.end - chosen.start + 1
    const usable = rowWidth >= minLineWidth
    rows.push({ left: chosen.start, right: chosen.end, width: rowWidth, usable })

    if (usable) {
      if (top === -1) top = y
      bottom = y
    }
  }

  return {
    rows,
    top: top === -1 ? 0 : top,
    bottom: bottom === -1 ? 0 : bottom,
    width,
    height,
  }
}

/**
 * Browser path — loads an SVG URL, rasterizes it, and extracts the scanline table.
 *
 * Why this is browser-only: it uses `Image`, `OffscreenCanvas`, and `getImageData`,
 * which all require a real DOM. The pure variant above is what tests use.
 */
export async function extractScanlines(
  svgUrl: string,
  options: ExtractOptions = {},
): Promise<Scanlines> {
  const maxRes = options.maxRes ?? 1024

  // Load the SVG into an Image element. SVGs decode at their viewBox size by
  // default, but we want a controlled raster size, so we set width/height
  // explicitly after natural-size inspection.
  const img = new Image()
  img.src = svgUrl
  await img.decode()

  const natural = Math.max(img.naturalWidth, img.naturalHeight, 1)
  const scale = natural > maxRes ? maxRes / natural : 1
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))

  const offscreen = new OffscreenCanvas(w, h)
  const ctx = offscreen.getContext('2d')
  if (!ctx) throw new Error('extractScanlines: 2D context not available')
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  const imageData = ctx.getImageData(0, 0, w, h)

  return extractScanlinesFromImageData(imageData.data, w, h, options)
}
