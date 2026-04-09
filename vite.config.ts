import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// Multi-page build: each demo is its own HTML entry point with shared modules
// in src/shared/. Single deploy, one bundle per demo, shared chunk extracted.
// See design doc issue 1B. Using import.meta.url avoids needing @types/node
// just for `path` + `__dirname`.
const r = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: r('./index.html'),
        rasengan: r('./rasengan.html'),
        manga: r('./manga.html'),
        bijuu: r('./bijuu.html'),
      },
    },
  },
  server: {
    port: 5173,
    open: '/',
  },
})
