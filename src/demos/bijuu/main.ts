/**
 * Bijuu Mode Typography — entry point.
 *
 * Type any text → it renders inside a Naruto silhouette via Pretext's
 * `layoutNextLine` per-line variable-width layout. CSS literally cannot
 * route text along an arbitrary curved boundary like this.
 *
 * Pipeline (one-time setup):
 *   1. Load Bebas Neue + Inter via Google Fonts (in bijuu.html)
 *   2. await document.fonts.ready so Pretext measures the right glyphs
 *   3. Fetch the article text and the silhouette SVG
 *   4. Rasterize the SVG, extract scanlines (per-row {left, right, width})
 *   5. prepareWithSegments(article, font) once
 *   6. For each usable scanline row, layoutNextLine(prepared, cursor, row.width)
 *      → record the line text + position. Walk top to bottom until either text
 *      or silhouette is exhausted.
 *
 * Animation (60fps render loop):
 *   - wall      0.0–1.0s : article rendered as a plain wrapped wall of text
 *   - transition 1.0–1.5s : wall fades out, silhouette outline fades in
 *   - build     1.5–7.0s : pre-computed silhouette lines reveal progressively
 *   - hold      7.0–9.0s : all lines visible, chakra glow pulses on outline
 *   - pushIn    9.0–10s  : 5% camera scale-up for the hero frame finale
 *
 * Export:
 *   - Snap PNG   → exportCanvasAsPng() during the hold phase (peak hero frame)
 *   - Record WebM → MediaRecorder against canvas.captureStream(60), 10s loop
 */

import { setupCanvas } from '../../shared/canvas'
import { exportCanvasAsPng } from '../../shared/png-export'
import {
  prepareWithSegments,
  layoutNextLine,
  layoutWithLines,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'
import { extractScanlines, type Scanlines } from './scanlines'

// ─── Constants ──────────────────────────────────────────────────────────────

const CANVAS_SIZE = 800
const FONT_SIZE = 14
const LINE_HEIGHT = 16
const SILHOUETTE_URL = '/silhouettes/konoha-leaf.svg'
const ARTICLE_URL = '/articles/naruto.txt'
const PRIMARY_FONT = 'Bebas Neue'
const FALLBACK_FONT = 'Inter'

// Phase timeline (ms from animation start)
const PHASE_WALL_END = 1000
const PHASE_TRANSITION_END = 1500
const PHASE_BUILD_END = 7000
const PHASE_HOLD_END = 9000
const PHASE_PUSH_END = 10000
const TOTAL_DURATION_MS = 10000

// Visual constants
const BG_COLOR = '#050505'
const TEXT_COLOR = '#e8e8e8'
const GLOW_RGB_INNER = '120, 200, 160' // green-ish chakra
const GLOW_RGB_MID = '74, 158, 255' // blue chakra

// ─── Types ──────────────────────────────────────────────────────────────────

type Phase = 'wall' | 'transition' | 'build' | 'hold' | 'pushIn'

interface Line {
  text: string
  /** Baseline x in CSS pixels */
  x: number
  /** Baseline y in CSS pixels */
  y: number
}

// ─── DOM refs ───────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const errorBanner = document.getElementById('font-error')
const snapBtn = document.getElementById('snap') as HTMLButtonElement
const recordBtn = document.getElementById('record') as HTMLButtonElement
const replayBtn = document.getElementById('replay') as HTMLButtonElement

// ─── Mutable state ──────────────────────────────────────────────────────────

let ctx: CanvasRenderingContext2D
let scanlines: Scanlines
let silhouetteImage: HTMLImageElement | null = null
let silhouetteLines: Line[] = []
let wallLines: Line[] = []
let chosenFont = PRIMARY_FONT // resolved at init
let animationStartTime = 0
let recording = false
let recorder: MediaRecorder | null = null
let recordedChunks: Blob[] = []

// ─── Init ───────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  ctx = setupCanvas(canvas, CANVAS_SIZE, CANVAS_SIZE)

  // Wait for Google Fonts to actually load before any Pretext measurement.
  // Pretext measures via canvas.measureText, which only sees the font once
  // it's available to the browser. Without this await, the first frame
  // measures against the fallback and the layout shifts when the real font
  // loads.
  try {
    await document.fonts.ready
    // Verify Bebas Neue is actually available (Google Fonts can fail silently)
    const ok = document.fonts.check(`${FONT_SIZE}px "${PRIMARY_FONT}"`)
    chosenFont = ok ? PRIMARY_FONT : FALLBACK_FONT
    if (!ok && errorBanner) {
      console.warn(`[bijuu] ${PRIMARY_FONT} did not load — falling back to ${FALLBACK_FONT}`)
    }
  } catch (err) {
    console.error('[bijuu] document.fonts.ready failed:', err)
    if (errorBanner) errorBanner.classList.add('shown')
  }

  // Load article + silhouette in parallel
  const [article, sl, sigImg] = await Promise.all([
    fetch(ARTICLE_URL).then((r) => r.text()),
    extractScanlines(SILHOUETTE_URL, { maxRes: CANVAS_SIZE, minLineWidth: 40 }),
    loadImage(SILHOUETTE_URL),
  ])
  scanlines = sl
  silhouetteImage = sigImg

  // Compute layouts (ONCE, not per-frame)
  const fontStr = `${FONT_SIZE}px "${chosenFont}"`
  const prepared = prepareWithSegments(article, fontStr)

  silhouetteLines = computeSilhouetteLayout(prepared, scanlines)
  wallLines = computeWallLayout(prepared)

  // Wire up controls
  snapBtn.addEventListener('click', snapHero)
  recordBtn.addEventListener('click', startRecording)
  replayBtn.addEventListener('click', resetAnimation)

  // Start the animation loop
  resetAnimation()
  requestAnimationFrame(tick)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
    img.src = url
  })
}

// ─── Layout computation ─────────────────────────────────────────────────────

/**
 * Walk the scanline table top to bottom. For each usable row, ask Pretext
 * for the next line that fits in that exact width. Stop when text runs out
 * or the silhouette is filled.
 *
 * The cursor advances through the prepared text monotonically, so each
 * line continues where the previous left off — natural reading order, just
 * with each line at a different width.
 */
function computeSilhouetteLayout(prepared: PreparedTextWithSegments, sl: Scanlines): Line[] {
  const out: Line[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let y = sl.top

  while (y <= sl.bottom) {
    const row = sl.rows[y]
    if (!row || !row.usable) {
      y += 1
      continue
    }

    const line = layoutNextLine(prepared, cursor, row.width)
    if (line === null) break // text exhausted

    // Center the line within the row's usable interval — cleaner than
    // left-aligning when the text doesn't fill the full available width.
    const offsetX = (row.width - line.width) / 2
    out.push({
      text: line.text,
      x: row.left + offsetX,
      y: y + LINE_HEIGHT - 4, // baseline near the bottom of the line box
    })
    cursor = line.end
    y += LINE_HEIGHT
  }

  return out
}

/**
 * Lay out the article as a plain wrapped wall of text filling the canvas
 * (minus a small padding). Used in the wall phase before the silhouette
 * appears, to give the viewer a "before" beat that makes the silhouette
 * fill feel earned.
 */
function computeWallLayout(prepared: PreparedTextWithSegments): Line[] {
  const padding = 40
  const wallWidth = CANVAS_SIZE - padding * 2
  const result = layoutWithLines(prepared, wallWidth, LINE_HEIGHT)
  return result.lines.map((line, i) => ({
    text: line.text,
    x: padding,
    y: padding + (i + 1) * LINE_HEIGHT - 4,
  }))
}

// ─── Animation loop ─────────────────────────────────────────────────────────

function resetAnimation(): void {
  animationStartTime = performance.now()
}

function getElapsed(): number {
  return performance.now() - animationStartTime
}

function getPhase(elapsed: number): Phase {
  if (elapsed < PHASE_WALL_END) return 'wall'
  if (elapsed < PHASE_TRANSITION_END) return 'transition'
  if (elapsed < PHASE_BUILD_END) return 'build'
  if (elapsed < PHASE_HOLD_END) return 'hold'
  return 'pushIn'
}

function tick(_now: number): void {
  render()
  requestAnimationFrame(tick)
}

// ─── Render ─────────────────────────────────────────────────────────────────

function render(): void {
  const elapsed = Math.min(getElapsed(), TOTAL_DURATION_MS)
  const phase = getPhase(elapsed)

  // Clear and paint background
  ctx.save()
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

  // Apply pushIn transform for the final beat
  if (phase === 'pushIn') {
    const t = (elapsed - PHASE_HOLD_END) / (PHASE_PUSH_END - PHASE_HOLD_END)
    const scale = 1 + 0.05 * easeInOut(t)
    ctx.translate(CANVAS_SIZE / 2, CANVAS_SIZE / 2)
    ctx.scale(scale, scale)
    ctx.translate(-CANVAS_SIZE / 2, -CANVAS_SIZE / 2)
  }

  // Render order depends on phase
  switch (phase) {
    case 'wall': {
      const t = elapsed / PHASE_WALL_END
      // Slight fade-in from 0 → 1 over the first 200ms so the wall doesn't pop
      const wallAlpha = Math.min(1, t * 5)
      renderWall(wallAlpha)
      break
    }
    case 'transition': {
      const t = (elapsed - PHASE_WALL_END) / (PHASE_TRANSITION_END - PHASE_WALL_END)
      renderWall(1 - t)
      renderSilhouetteOutline(0.12 * t)
      break
    }
    case 'build': {
      renderSilhouetteOutline(0.12)
      const t = (elapsed - PHASE_TRANSITION_END) / (PHASE_BUILD_END - PHASE_TRANSITION_END)
      const revealedExact = t * silhouetteLines.length
      const revealedCount = Math.floor(revealedExact)
      const fadeAlpha = revealedExact - revealedCount
      renderLines(revealedCount, fadeAlpha)
      break
    }
    case 'hold': {
      const t = (elapsed - PHASE_BUILD_END) / (PHASE_HOLD_END - PHASE_BUILD_END)
      const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.5) // 1.5 cycles in 2s
      renderGlow(pulse)
      renderSilhouetteOutline(0.12 + 0.08 * pulse)
      renderLines(silhouetteLines.length, 0)
      break
    }
    case 'pushIn': {
      // Hold the final state with the pushIn transform applied above
      const pulse = 1.0
      renderGlow(pulse)
      renderSilhouetteOutline(0.2)
      renderLines(silhouetteLines.length, 0)
      break
    }
  }

  ctx.restore()
}

function renderWall(alpha: number): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#3a3a3a'
  ctx.font = `${FONT_SIZE}px "${chosenFont}", sans-serif`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  for (const line of wallLines) {
    if (line.y > CANVAS_SIZE - 20) break
    ctx.fillText(line.text, line.x, line.y)
  }
  ctx.restore()
}

function renderSilhouetteOutline(alpha: number): void {
  if (!silhouetteImage) return
  ctx.save()
  ctx.globalAlpha = alpha
  // Blit the rasterized silhouette as a low-alpha background tint so the
  // viewer can see the shape forming during the build phase
  ctx.drawImage(silhouetteImage, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
  ctx.restore()
}

function renderLines(revealedCount: number, fadeAlpha: number): void {
  ctx.save()
  ctx.fillStyle = TEXT_COLOR
  ctx.font = `${FONT_SIZE}px "${chosenFont}", sans-serif`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  // Fully revealed lines
  ctx.globalAlpha = 1
  const fullCount = Math.min(revealedCount, silhouetteLines.length)
  for (let i = 0; i < fullCount; i++) {
    const line = silhouetteLines[i]!
    ctx.fillText(line.text, line.x, line.y)
  }

  // The currently-fading-in line (if any)
  if (fadeAlpha > 0 && revealedCount < silhouetteLines.length) {
    ctx.globalAlpha = fadeAlpha
    const line = silhouetteLines[revealedCount]!
    ctx.fillText(line.text, line.x, line.y)
  }

  ctx.restore()
}

function renderGlow(intensity: number): void {
  // Compute the silhouette's bounding box from scanlines
  const bbox = silhouetteBoundingBox()
  if (!bbox) return
  const cx = (bbox.left + bbox.right) / 2
  const cy = (bbox.top + bbox.bottom) / 2
  const r = Math.max(bbox.right - bbox.left, bbox.bottom - bbox.top) * 0.7

  ctx.save()
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.4)
  grad.addColorStop(0.0, `rgba(${GLOW_RGB_INNER}, ${0.35 * intensity})`)
  grad.addColorStop(0.4, `rgba(${GLOW_RGB_MID}, ${0.18 * intensity})`)
  grad.addColorStop(1.0, `rgba(${GLOW_RGB_MID}, 0)`)
  ctx.fillStyle = grad
  ctx.fillRect(cx - r * 1.5, cy - r * 1.5, r * 3, r * 3)
  ctx.restore()
}

function silhouetteBoundingBox(): { left: number; right: number; top: number; bottom: number } | null {
  if (!scanlines) return null
  let left = Infinity
  let right = -Infinity
  for (let y = scanlines.top; y <= scanlines.bottom; y++) {
    const row = scanlines.rows[y]
    if (!row || !row.usable) continue
    if (row.left < left) left = row.left
    if (row.right > right) right = row.right
  }
  if (!isFinite(left)) return null
  return { left, right, top: scanlines.top, bottom: scanlines.bottom }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

// ─── Controls ───────────────────────────────────────────────────────────────

function snapHero(): void {
  // The best hero frame is during the hold phase. If we're in another phase,
  // just snap whatever's on screen — user controls the timing.
  exportCanvasAsPng(canvas, 'bijuu-hero.png')
}

function startRecording(): void {
  if (recording) return
  if (typeof MediaRecorder === 'undefined') {
    alert('Video recording not supported in this browser. Use OBS or your screen recorder. PNG export still works.')
    return
  }

  recording = true
  recordedChunks = []
  recordBtn.disabled = true
  recordBtn.textContent = 'Recording…'

  // Reset animation so the recording captures the full 10-second sequence
  resetAnimation()

  const stream = canvas.captureStream(60)
  // Try VP9 first (better quality), fall back to default WebM
  let mimeType = 'video/webm;codecs=vp9'
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm;codecs=vp8'
  }
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm'
  }

  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data)
  }
  recorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bijuu-mode-typography.webm'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 100)

    recording = false
    recordBtn.disabled = false
    recordBtn.textContent = 'Record 10s WebM'
  }

  recorder.start()
  // Stop after the full duration + a tiny tail buffer
  setTimeout(() => {
    if (recorder && recorder.state === 'recording') recorder.stop()
  }, TOTAL_DURATION_MS + 200)
}

// ─── Boot ───────────────────────────────────────────────────────────────────

void init().catch((err) => {
  console.error('[bijuu] init failed:', err)
  if (errorBanner) {
    errorBanner.textContent = `Init failed: ${err instanceof Error ? err.message : String(err)}`
    errorBanner.classList.add('shown')
  }
})
