/**
 * Bijuu Mode Typography — entry point.
 *
 * STATUS: SCAFFOLD ONLY. Sunday PM build tasks live in the design doc:
 *   ~/.gstack/projects/Pretext/swaya-none-design-20260408-013304.md
 *   (search for "Sunday PM (Day 3) — Bijuu Mode Typography")
 *
 * Key implementation:
 *   - extractScanlines() in src/demos/bijuu/scanlines.ts (rasterize SVG to
 *     1024x1024 cap, scan rows for left/right edges, log warning + pick
 *     widest interval if any row has multiple intervals — see Eng Review)
 *   - Layout loop with layoutNextLineRange + cursor advance
 *   - PNG export
 *   - Single near-convex silhouette for V1 (Shukaku side profile or fallback)
 */

import { setupCanvas } from '../../shared/canvas'
import { loadFontsWithBanner } from '../../shared/fonts'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const errorBanner = document.getElementById('font-error')

setupCanvas(canvas, 800, 800)

void loadFontsWithBanner(
  [
    // TODO: subsetted Bebas Neue or Inter Display
  ],
  errorBanner,
).then(() => {
  console.log('[bijuu] fonts ready, ready to fill silhouette')
  // TODO: load silhouette SVG, extract scanlines, wire up article input
})
