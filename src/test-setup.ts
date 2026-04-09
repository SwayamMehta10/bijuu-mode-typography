/**
 * Vitest setup. Polyfills `OffscreenCanvas` for the Node test environment so
 * that `@chenglou/pretext`'s `getMeasureContext()` can run without a browser.
 *
 * Why a polyfill instead of jsdom + node-canvas:
 *   - jsdom doesn't ship a real canvas; you'd still need node-canvas (~25MB,
 *     binary deps) just to get measureText().
 *   - The four critical Day-1 tests on `iterateClusters` verify CLUSTER
 *     BOUNDARIES, not actual font metrics. Any deterministic measureText is
 *     enough — the boundaries come from `Intl.Segmenter`, which Node has.
 *
 * The mock returns width = (UTF-16 code unit length) * 7 — a stable, monotonic
 * function that's enough for Pretext's internal sanity checks. Real width
 * verification happens at runtime in the browser.
 */

class MockTextMetrics {
  constructor(public width: number) {}
}

class MockCanvasRenderingContext2D {
  font = '10px sans-serif'
  measureText(s: string): MockTextMetrics {
    return new MockTextMetrics(s.length * 7)
  }
}

class MockOffscreenCanvas {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_w: number, _h: number) {}
  getContext(kind: string): MockCanvasRenderingContext2D | null {
    if (kind !== '2d') return null
    return new MockCanvasRenderingContext2D()
  }
}

// Install on globalThis only if missing (so a real browser env in the future
// would still use the real canvas).
if (typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas === 'undefined') {
  ;(globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = MockOffscreenCanvas
}
