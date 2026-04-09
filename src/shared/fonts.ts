/**
 * Load webfonts via the FontFace API and wait for them to be ready before any
 * Pretext `prepare()` call. If `prepare()` runs before the font is loaded,
 * widths will be measured against the fallback and the layout will be wrong.
 *
 * Hard rule (per the design doc): no `system-ui`. Pretext's README warns it is
 * layout-unsafe on macOS because the resolved font differs from what canvas
 * measures.
 */

export interface FontSpec {
  family: string
  url: string
  weight?: string
  style?: string
}

export class FontLoadError extends Error {
  constructor(message: string, public readonly family: string) {
    super(message)
    this.name = 'FontLoadError'
  }
}

/**
 * Load all the given font families. Resolves when all are ready, rejects on
 * any failure. Caller is responsible for catching the rejection and showing
 * a user-visible error banner (see issue 8 in the eng review).
 */
export async function loadFonts(specs: FontSpec[]): Promise<void> {
  const fontFaces = specs.map((spec) => {
    const ff = new FontFace(spec.family, `url(${spec.url})`, {
      weight: spec.weight ?? 'normal',
      style: spec.style ?? 'normal',
    })
    return { spec, ff }
  })

  for (const { spec, ff } of fontFaces) {
    try {
      const loaded = await ff.load()
      document.fonts.add(loaded)
    } catch (err) {
      throw new FontLoadError(
        `Failed to load font ${spec.family} from ${spec.url}: ${err instanceof Error ? err.message : String(err)}`,
        spec.family,
      )
    }
  }

  await document.fonts.ready
}

/**
 * Convenience: wraps loadFonts() in a try/catch that shows the inline error
 * banner if the load fails. Used by all three demo entry points.
 */
export async function loadFontsWithBanner(
  specs: FontSpec[],
  bannerEl: HTMLElement | null,
): Promise<boolean> {
  try {
    await loadFonts(specs)
    return true
  } catch (err) {
    console.error(err)
    if (bannerEl) bannerEl.classList.add('shown')
    return false
  }
}
