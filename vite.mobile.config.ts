import {defineConfig} from 'vite'
import path from 'node:path'

export default defineConfig({
 root:path.resolve('src/mobile-transfer'),
 base:'/',
 build:{
  outDir:path.resolve('out/mobile-transfer'),
  emptyOutDir:true,
  rollupOptions:{
   input:{
    main:path.resolve('src/mobile-transfer/index.html'),
    'hash-worker':path.resolve('src/mobile-transfer/hash-worker.ts')
   },
   output:{
    entryFileNames:'[name].js',
    assetFileNames:'style.css'
   }
  }
 }
})
