import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin({exclude:['remark-parse','unified']})], build: { rollupOptions: { input: {index:path.resolve('electron/main/index.ts'),'text-conversion-worker':path.resolve('electron/main/services/text-conversion/conversion.worker.ts')} } } },
  preload: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: { input: path.resolve('electron/preload/index.ts') } } },
  renderer: {
    root: '.',
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve('src') } },
    build: { outDir: 'out/renderer', rollupOptions: { input: path.resolve('index.html') } },
    server: { host: '127.0.0.1', port: 5173, strictPort: true }
  }
})
