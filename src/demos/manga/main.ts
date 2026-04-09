/**
 * D2 Manga Shrinkwrap — entry point.
 *
 * STATUS: SCAFFOLD ONLY. Sunday AM build tasks live in the design doc:
 *   ~/.gstack/projects/Pretext/swaya-none-design-20260408-013304.md
 *   (search for "Sunday AM (Day 2) — D2 Manga Shrinkwrap")
 *
 * Key implementation:
 *   - findOptimalWidth() in src/demos/manga/shrinkwrap.ts (binary search +
 *     balance tolerance + single-word guard, see Eng Review issue 5)
 *   - Side-by-side comparison: CSS fit-content vs Pretext shrinkwrap
 *   - PNG export
 */

import { loadFontsWithBanner } from '../../shared/fonts'

const errorBanner = document.getElementById('font-error')

void loadFontsWithBanner(
  [
    // TODO: subsetted Inter + a manga display font (Bangers / Permanent Marker)
  ],
  errorBanner,
).then(() => {
  console.log('[manga] fonts ready, ready to shrinkwrap')
  // TODO: wire up dialogue input, examples, comparison render, export
})
