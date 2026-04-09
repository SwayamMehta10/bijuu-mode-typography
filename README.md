# Bijuu Mode Typography

> Type any text. It renders inside a Naruto Tailed Beast silhouette, every line hugging the curve. Built with [@chenglou/pretext](https://github.com/chenglou/pretext)'s per-line variable-width layout.
>
> **CSS literally cannot do this.**

<!-- Hero PNG goes here once the demo is built -->
<!-- ![Bijuu Mode Typography hero](assets/hero.png) -->

**Live demo:** _(deploy URL goes here once shipped)_

## What this is

A text-typography demo that exploits a Pretext primitive (`layoutNextLineRange`) most people don't know exists: per-line variable-width layout. You give it a `maxWidth` per line, and it walks the text accordingly. Stack a different `maxWidth` for every y-coordinate of an arbitrary silhouette and you get text that flows _inside_ a shape, every line hugging the contour.

The result is a Naruto character made entirely of a Wikipedia article. Pause anywhere in the build animation and the frame is a tweet.

## How it works

Three steps:

1. **Scanline extraction.** Rasterize an SVG silhouette to an offscreen canvas, scan each y-row left-to-right and right-to-left to find the leftmost and rightmost opaque pixel. Store the per-row `{ left, right, width }` table. This is a one-time setup pass — about 5ms for a 800×800 silhouette.

2. **Per-line layout via Pretext.** Walk the scanline table top to bottom. For each row that's wide enough to fit a word, call [`layoutNextLineRange(prepared, cursor, scanlines[y].width)`](https://github.com/chenglou/pretext) — Pretext returns the next line that fits in that exact width, plus an updated cursor. Render the line at `(scanlines[y].left, y)` and advance `y` by the line height. Repeat until either the text or the silhouette runs out.

3. **Animate the build.** Pre-compute the entire layout once at init, then progressively reveal lines over a 5-second animation. Add a chakra glow on the silhouette outline, hold for 2 seconds, push in for 1 second. Export as PNG (hero frame) or `.webm` via `MediaRecorder` (10-second video).

The whole thing runs in the browser at 60fps. No SVG `<text>` tricks, no DOM, no off-the-shelf "text-on-path" library — those approaches all break in different ways. This is straight Pretext + canvas 2D.

## Why Pretext

Pretext is [Cheng Lou's](https://github.com/chenglou) text measurement and layout library, written in TypeScript, runs in the browser. The [README](https://github.com/chenglou/pretext) lists its primitives — the one this demo exploits is `layoutNextLineRange`, which lets you walk text one line at a time with a different `maxWidth` per line. Most layout libraries (CSS included) assume one rectangular container with one fixed width. Pretext is one of very few that lets you change the constraint per line, which is exactly what flowing text inside a shape requires.

It also handles grapheme clustering correctly — Devanagari conjuncts, Thai combining marks, ZWJ emoji families, and CJK kanji all measure as atomic units. So you can fill the silhouette with Wikipedia in any language and the script-specific shaping stays correct. (See [`src/shared/pretext-util.test.ts`](src/shared/pretext-util.test.ts) for the four critical cluster correctness tests.)

## Quick start

```bash
npm install
npm run dev
# open http://localhost:5173/bijuu.html
```

```bash
npm test           # run unit tests once
npm run test:watch # watch mode
npm run build      # production build (typecheck + Vite)
```

## Project layout

```
.
├── bijuu.html                          the demo entry point
├── public/
│   ├── silhouettes/
│   │   ├── konoha-leaf.svg             default V1 silhouette
│   │   └── circle.svg                  fallback for pipeline smoke testing
│   └── articles/
│       └── naruto.txt                  default content fill
├── src/
│   ├── shared/                         cross-cutting helpers
│   │   ├── canvas.ts                   setupCanvas() — DPR-correct init
│   │   ├── fonts.ts                    loadFonts() / loadFontsWithBanner()
│   │   ├── scripts.ts                  detectScripts() / pickFontForScripts()
│   │   ├── pretext-util.ts             iterateClusters() — Pretext API abstraction
│   │   └── png-export.ts               exportCanvasAsPng()
│   └── demos/
│       └── bijuu/
│           ├── main.ts                 entry: layout pass + animation loop
│           ├── scanlines.ts            silhouette → scanline table extractor
│           └── scanlines.test.ts       extractor unit tests
└── vite.config.ts                      single-page Vite config
```

## Forking — make your own silhouette

The silhouette is a single SVG file. To swap it:

1. Drop your SVG into [`public/silhouettes/`](public/silhouettes/) — any name, any aspect ratio, but it should be **near-convex** (each y-row should have a single contiguous opaque interval). Hand-traced character art works great. Forehead protectors, kunai, swirl emblems all work too.
2. Update one line in [`src/demos/bijuu/main.ts`](src/demos/bijuu/main.ts) — change the `extractScanlines` call to point at your file.
3. Reload.

If you want to swap the article too, edit [`public/articles/naruto.txt`](public/articles/naruto.txt) or add a new file and point at it. The longer the article, the denser the silhouette fill.

## Credit

- [Cheng Lou](https://github.com/chenglou) (@_chenglou on X) for [Pretext](https://github.com/chenglou/pretext), the layout primitive that makes this demo possible
- Naruto silhouettes traced from reference, no copyrighted assets used directly

## License

[MIT](LICENSE) — fork it, ship your own version, post it on X.
