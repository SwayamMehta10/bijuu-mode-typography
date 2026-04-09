/**
 * D1 Rasengan Composer — entry point.
 *
 * Type any text. Each grapheme cluster spirals inward into a chakra ball.
 * The technical flex is unicode correctness via Pretext's grapheme-cluster
 * iteration: Devanagari conjuncts, Thai combining marks, ZWJ emoji families,
 * and CJK kanji all spiral as atomic units. `ctx.measureText` + per-char
 * iteration butchers all of these.
 *
 * Build steps follow the design doc:
 *   ~/.gstack/projects/Pretext/swaya-none-design-20260408-013304.md
 *   (search for "Saturday (Day 1) — D1 Rasengan Composer")
 */

import { setupCanvas } from '../../shared/canvas'
import { loadFontsWithBanner } from '../../shared/fonts'
import { clustersOf, type Cluster } from '../../shared/pretext-util'
import { detectScripts, pickFontForScripts } from '../../shared/scripts'

// ─── Tunables (per design doc Eng Review section) ──────────────────────────

const FONT_SIZE = 18

// Spiral target layout
const SPIRAL_R0 = 20
const SPIRAL_RADIAL_STEP = 22 // one line-height + a hair of gap
const SPIRAL_ANGULAR_PADDING = 0.02

// Spring physics — these are *60fps-frame* tunings, scaled by dtFactor below
const SPRING_K = 0.15
const SPRING_DAMPING = 0.82

// Input debounce
const INPUT_DEBOUNCE_MS = 150

// Launch animation
const LAUNCH_FORWARD = 0.6 // fraction of viewport width to drift forward
const DISINTEGRATE_SPEED = 8 // px/frame at 60fps after launch
const FADE_DURATION_MS = 500

// ─── DOM refs ───────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const errorBanner = document.getElementById('font-error')
const input = document.getElementById('input') as HTMLTextAreaElement
const launchBtn = document.getElementById('launch') as HTMLButtonElement
const exampleButtons = document.querySelectorAll<HTMLButtonElement>('.examples button')

// ─── State ──────────────────────────────────────────────────────────────────

interface Particle {
  text: string
  width: number
  // Position + velocity in CSS pixel space
  x: number
  y: number
  vx: number
  vy: number
  // Spiral target
  tx: number
  ty: number
  // Render
  font: string
  alpha: number
}

let particles: Particle[] = []
let viewWidth = window.innerWidth
let viewHeight = window.innerHeight
let centerX = viewWidth / 2
let centerY = viewHeight / 2
let phase: 'idle' | 'forming' | 'launched' = 'idle'
let launchStartedAt = 0
let lastFrameTime = performance.now()

let ctx = setupCanvas(canvas, viewWidth, viewHeight)

// ─── Font loading ───────────────────────────────────────────────────────────

// The font subsetting build step (design doc issue 4A) isn't wired yet —
// fonts will fall back to system defaults until then. The demo still
// functions; widths will be slightly off vs. the intended typography.
void loadFontsWithBanner(
  [
    // Subset URLs go here once `pyftsubset`/`glyphhanger` step is built.
    // { family: 'Inter', url: '/fonts/inter-subset.woff2' },
    // { family: 'Noto Sans Devanagari', url: '/fonts/noto-deva-subset.woff2' },
    // { family: 'Noto Sans Thai', url: '/fonts/noto-thai-subset.woff2' },
    // { family: 'Noto Sans JP', url: '/fonts/noto-jp-subset.woff2' },
  ],
  errorBanner,
).then(() => {
  // Boot from URL params if any, otherwise wait for input.
  const params = new URLSearchParams(window.location.search)
  const initialText = params.get('text')
  if (initialText) {
    input.value = initialText
    spawnFromText(initialText, fontFor(initialText))
  }
  requestAnimationFrame(tick)
})

// ─── Input pipeline ─────────────────────────────────────────────────────────

function fontFor(text: string): string {
  const family = pickFontForScripts(detectScripts(text))
  return `${FONT_SIZE}px "${family}"`
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
input.addEventListener('input', () => {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const text = input.value
    spawnFromText(text, fontFor(text))
  }, INPUT_DEBOUNCE_MS)
})

for (const btn of exampleButtons) {
  btn.addEventListener('click', () => {
    const text = btn.dataset.example ?? ''
    const family = btn.dataset.font ?? 'Inter'
    input.value = text
    spawnFromText(text, `${FONT_SIZE}px "${family}"`)
  })
}

launchBtn.addEventListener('click', () => {
  if (particles.length === 0) return
  launch()
})

window.addEventListener('resize', () => {
  viewWidth = window.innerWidth
  viewHeight = window.innerHeight
  centerX = viewWidth / 2
  centerY = viewHeight / 2
  ctx = setupCanvas(canvas, viewWidth, viewHeight)
  // Re-target the existing spiral so it stays centered.
  if (particles.length > 0) layoutSpiral(particles)
})

// ─── Cluster spawn + spiral layout ──────────────────────────────────────────

function spawnFromText(text: string, font: string): void {
  if (text.length === 0) {
    particles = []
    phase = 'idle'
    return
  }

  let clusters: Cluster[]
  try {
    clusters = clustersOf(text, font)
  } catch (err) {
    console.error('[rasengan] prepareWithSegments failed:', err)
    return
  }

  // Filter out pure-whitespace clusters — they have width but no glyphs to
  // spiral, and including them puts visible gaps in the chakra ball.
  const visible = clusters.filter((c) => c.text.trim().length > 0)
  if (visible.length === 0) {
    particles = []
    phase = 'idle'
    return
  }

  // Single-cluster guard (design doc): just park it at center, no spiral.
  if (visible.length === 1) {
    const only = visible[0]!
    particles = [
      {
        text: only.text,
        width: only.width,
        x: centerX,
        y: centerY,
        vx: 0,
        vy: 0,
        tx: centerX,
        ty: centerY,
        font,
        alpha: 1,
      },
    ]
    phase = 'forming'
    return
  }

  // Build particles, preserving any existing position so re-typing doesn't
  // teleport — clusters at the same index visually morph instead of jumping.
  const inputRect = input.getBoundingClientRect()
  const startX = inputRect.left + inputRect.width / 2
  const startY = inputRect.top + inputRect.height / 2

  const next: Particle[] = visible.map((c, i) => {
    const prev = particles[i]
    return {
      text: c.text,
      width: c.width,
      x: prev?.x ?? startX,
      y: prev?.y ?? startY,
      vx: prev?.vx ?? 0,
      vy: prev?.vy ?? 0,
      tx: 0,
      ty: 0,
      font,
      alpha: 1,
    }
  })

  layoutSpiral(next)
  particles = next
  phase = 'forming'
  launchStartedAt = 0
}

/**
 * Place spiral targets for an array of particles. Explicit-turnIndex math
 * (per eng review): `r = r0 + radialStep * floor(θ / 2π)` recomputed each
 * iteration so float drift over many clusters can't accumulate.
 */
function layoutSpiral(ps: Particle[]): void {
  let theta = 0
  let r = SPIRAL_R0
  for (const p of ps) {
    // Angular step proportional to width-on-arc, plus a small padding.
    const dTheta = p.width / Math.max(r, 1) + SPIRAL_ANGULAR_PADDING
    theta += dTheta
    const turnIndex = Math.floor(theta / (2 * Math.PI))
    r = SPIRAL_R0 + SPIRAL_RADIAL_STEP * turnIndex
    p.tx = centerX + r * Math.cos(theta)
    p.ty = centerY + r * Math.sin(theta)
  }
}

// ─── Launch / disintegrate ──────────────────────────────────────────────────

function launch(): void {
  if (phase === 'launched') return
  phase = 'launched'
  launchStartedAt = performance.now()

  // Push every particle's target forward and scatter outward.
  for (const p of particles) {
    const angle = Math.atan2(p.ty - centerY, p.tx - centerX)
    p.vx += Math.cos(angle) * DISINTEGRATE_SPEED + viewWidth * LAUNCH_FORWARD * 0.01
    p.vy += Math.sin(angle) * DISINTEGRATE_SPEED
    // Disable spring by parking the target way off-screen — friction takes over.
    p.tx = p.x + Math.cos(angle) * 2000
    p.ty = p.y + Math.sin(angle) * 2000
  }
}

// ─── Physics + render loop ──────────────────────────────────────────────────

function tick(now: number): void {
  const rawDt = (now - lastFrameTime) / 1000
  lastFrameTime = now
  // Clamp dt — backgrounded tabs can produce multi-second gaps.
  const dt = Math.min(rawDt, 1 / 30)
  // dtFactor: 1.0 at 60fps, ~2.0 at 30fps, capped at 4 to keep springs sane.
  const f = Math.min(dt * 60, 4)
  const dampingF = Math.pow(SPRING_DAMPING, f)

  for (const p of particles) {
    const ax = (p.tx - p.x) * SPRING_K
    const ay = (p.ty - p.y) * SPRING_K
    p.vx = (p.vx + ax * f) * dampingF
    p.vy = (p.vy + ay * f) * dampingF
    p.x += p.vx * f
    p.y += p.vy * f
  }

  if (phase === 'launched') {
    const elapsed = now - launchStartedAt
    const a = Math.max(0, 1 - elapsed / FADE_DURATION_MS)
    for (const p of particles) p.alpha = a
    if (elapsed > FADE_DURATION_MS) {
      particles = []
      phase = 'idle'
    }
  }

  render()
  requestAnimationFrame(tick)
}

function render(): void {
  ctx.clearRect(0, 0, viewWidth, viewHeight)

  // Subtle chakra glow centered on the ball.
  if (particles.length > 0 && phase !== 'launched') {
    const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 140)
    glow.addColorStop(0, 'rgba(74, 158, 255, 0.35)')
    glow.addColorStop(1, 'rgba(74, 158, 255, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(centerX - 160, centerY - 160, 320, 320)
  }

  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const p of particles) {
    ctx.globalAlpha = p.alpha
    ctx.font = p.font
    ctx.fillStyle = '#cfe8ff'
    ctx.fillText(p.text, p.x, p.y)
  }
  ctx.globalAlpha = 1
}
