// Copia a public/ocr los ficheros de OCR autoalojados (worker, núcleo WASM LSTM e idioma español) desde node_modules.
// Se ejecuta antes de `dev` y `build`; public/ocr no se sube a git. Todo se sirve del mismo origen (sin CDN).
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'ocr')
const nm = (...p) => join(root, 'node_modules', ...p)

const CORE = ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']
const files = [
  [nm('tesseract.js', 'dist', 'worker.min.js'), join(out, 'worker.min.js')],
  ...CORE.map((f) => [nm('tesseract.js-core', f), join(out, 'core', f)]),
  [nm('@tesseract.js-data', 'spa', '4.0.0_best_int', 'spa.traineddata.gz'), join(out, 'lang', 'spa.traineddata.gz')],
]

if (!files.every(([src]) => existsSync(src))) {
  console.warn('[ocr] Faltan paquetes de OCR en node_modules (tesseract.js, tesseract.js-core, @tesseract.js-data/spa): se omite la copia.')
  process.exit(0)
}
rmSync(out, { recursive: true, force: true })
for (const [src, dst] of files) {
  mkdirSync(dirname(dst), { recursive: true })
  copyFileSync(src, dst)
}
const size = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(join(d, e.name)) : statSync(join(d, e.name)).size), 0)
console.log(`[ocr] ${files.length} ficheros copiados a public/ocr (${(size(out) / 1e6).toFixed(1)} MB)`)
