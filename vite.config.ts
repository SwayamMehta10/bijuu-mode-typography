import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// Single-demo Vite config: bijuu.html is the demo entry point, index.html is
// a thin landing that redirects to /bijuu.html so the deploy URL works at root.
// Using import.meta.url avoids needing @types/node just for `path` + `__dirname`.
const r = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: r('./index.html'),
        bijuu: r('./bijuu.html'),
      },
    },
  },
  server: {
    port: 5173,
    open: '/bijuu.html',
  },
})
