import {defineConfig} from 'vite'
import path from 'node:path'
export default defineConfig({root:path.resolve('src/mobile-transfer'),base:'/',build:{outDir:path.resolve('out/mobile-transfer'),emptyOutDir:true,rollupOptions:{output:{entryFileNames:'main.js',assetFileNames:'style.css'}}}})
