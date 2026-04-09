/**
 * Set up a canvas with correct devicePixelRatio scaling so the output is crisp
 * on retina displays. Pass CSS dimensions; the canvas backing store is sized
 * up by the DPR and the context is pre-scaled, so all subsequent drawing
 * operations can use logical CSS pixels.
 *
 * Returns the 2D context (already scaled).
 */
export function setupCanvas(
  el: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
): CanvasRenderingContext2D {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
  el.width = Math.round(cssWidth * dpr)
  el.height = Math.round(cssHeight * dpr)
  el.style.width = `${cssWidth}px`
  el.style.height = `${cssHeight}px`
  const ctx = el.getContext('2d')
  if (!ctx) throw new Error('setupCanvas: 2D context not available')
  ctx.scale(dpr, dpr)
  return ctx
}
