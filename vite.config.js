import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

// We use index.dev.html as the source HTML. The built deploy artifacts
// (index.html + assets/) live at the repo root and are committed so Pages
// can serve them directly from main. `npm run deploy` rebuilds + copies.
export default defineConfig({
  base: './',
  plugins: [wasm(), topLevelAwait()],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: 'index.dev.html',
    },
  },
  server: { open: '/index.dev.html' },
})
