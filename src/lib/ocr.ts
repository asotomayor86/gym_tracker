import { parseDateTime } from './importers/fitdaysEs'
import { ImportError, type OcrLine, type OcrProgress, type OcrResult } from './importers/types'

/**
 * OCR local con tesseract.js, TODO autoalojado en el mismo origen (/ocr/…: sin CDN, compatible con la CSP) y cargado
 * de forma perezosa SOLO al importar (la librería y los datos no entran en el bundle inicial ni en el precache del SW).
 * La imagen no sale del dispositivo: se procesa en un worker y no se guarda.
 */
export const OCR_BASE = '/ocr'

// ───────────── Lógica pura (probada con un worker falso) ─────────────

interface TessBbox { x0: number; y0: number; x1: number; y1: number }
interface TessWord { text: string; confidence: number; bbox: TessBbox }
interface TessLine { text: string; confidence: number; bbox: TessBbox; words: TessWord[] }
export interface TessData {
  text: string
  confidence: number
  blocks?: { paragraphs: { lines: TessLine[] }[] }[] | null
}

const box = (b: TessBbox): [number, number, number, number] => [b.x0, b.y0, b.x1, b.y1]

/** Resultado de tesseract.js → líneas del contrato de importación (con cajas por línea y palabra). */
export function linesFromTesseract(data: TessData): OcrLine[] {
  return (data.blocks ?? [])
    .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
    .map((l) => ({
      text: l.text.trim(), confidence: l.confidence, bbox: box(l.bbox),
      words: l.words.map((w) => ({ text: w.text, confidence: w.confidence, bbox: box(w.bbox) })),
    }))
    .filter((l) => l.text)
}

/**
 * La línea de fecha y hora («14:26 04/10/2026»), pequeña y gris sobre un degradado, es lo que peor lee el OCR general
 * (sale algo como «142604/10/20%6»). Se localiza como la línea de la parte alta con muchas cifras y separadores.
 */
export function findDateTimeLine(lines: OcrLine[], imageHeight?: number): OcrLine | undefined {
  const limit = imageHeight ? imageHeight * 0.3 : Infinity
  return lines.find((l) => (l.text.match(/\d/g) ?? []).length >= 6 && /[/:]/.test(l.text) && (l.bbox ? l.bbox[1] < limit : true))
}

/** ¿El texto de la línea ya trae una fecha y una hora válidas? */
export const hasDateTime = (text: string) => {
  const r = parseDateTime(text)
  return !!r.date && !!r.time
}

export interface RefineWorker {
  setParameters(p: Record<string, unknown>): Promise<unknown>
  recognize(image: unknown, opts?: { rectangle?: { left: number; top: number; width: number; height: number } }): Promise<{ data: { text: string; confidence: number } }>
}

/**
 * Segunda pasada sobre la línea de fecha/hora: solo cifras y separadores (lista blanca) en una única línea.
 * Si lee una fecha y hora válidas, sustituye el texto de esa línea. Siempre restaura los parámetros del worker.
 */
export async function refineDateTime(worker: RefineWorker, image: unknown, lines: OcrLine[], imageHeight: number | undefined, psmSingleLine: unknown, psmAuto: unknown): Promise<OcrLine[]> {
  const cand = findDateTimeLine(lines, imageHeight)
  if (!cand?.bbox || hasDateTime(cand.text)) return lines
  const [x0, y0, x1, y1] = cand.bbox
  const pad = 14
  try {
    await worker.setParameters({ tessedit_char_whitelist: '0123456789:/ .', tessedit_pageseg_mode: psmSingleLine })
    const { data } = await worker.recognize(image, {
      rectangle: { left: Math.max(0, x0 - pad), top: Math.max(0, y0 - pad), width: x1 - x0 + 2 * pad, height: y1 - y0 + 2 * pad },
    })
    const text = data.text.trim()
    if (!hasDateTime(text)) return lines
    return lines.map((l) => (l === cand ? { ...l, text, confidence: data.confidence, words: text.split(/\s+/).map((w) => ({ text: w, confidence: data.confidence })) } : l))
  } finally {
    await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: psmAuto })
  }
}

/** Escala sugerida: las imágenes pequeñas se amplían hasta ~1200 px de ancho (el OCR lee mejor texto grande); las grandes se limitan. */
export function targetScale(width: number, height: number): number {
  const maxSide = Math.max(width, height)
  if (width < 1000) return Math.min(1200 / width, 4000 / maxSide)
  if (maxSide > 4000) return 4000 / maxSide
  return 1
}

// ───────────── Motor (navegador) ─────────────

type Worker = import('tesseract.js').Worker
let workerPromise: Promise<Worker> | null = null
let progressSink: ((p: OcrProgress) => void) | undefined

/** Estado de tesseract.js → progreso 'engine' (carga del motor y del idioma) o 'reading' (reconocimiento). */
export function mapProgress(status: string, progress: number): OcrProgress | null {
  const f = Math.min(1, Math.max(0, progress || 0))
  if (status === 'recognizing text') return { stage: 'reading', fraction: f }
  if (status === 'loading tesseract core') return { stage: 'engine', fraction: f * 0.4 }
  if (status === 'initializing tesseract') return { stage: 'engine', fraction: 0.4 + f * 0.1 }
  if (status === 'loading language traineddata') return { stage: 'engine', fraction: 0.5 + f * 0.4 }
  if (status === 'initializing api') return { stage: 'engine', fraction: 0.9 + f * 0.1 }
  return null
}

async function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const { createWorker } = await import('tesseract.js') // carga perezosa: trozo aparte del bundle
    return createWorker('spa', 1, {
      workerPath: `${OCR_BASE}/worker.min.js`,
      corePath: `${OCR_BASE}/core`,
      langPath: `${OCR_BASE}/lang`,
      gzip: true,
      workerBlobURL: false, // el worker se carga desde el mismo origen (worker-src 'self', sin blob:)
      logger: (m) => {
        const p = mapProgress(m.status, m.progress)
        if (p) progressSink?.(p)
      },
    })
  })().catch((e) => {
    workerPromise = null // permite reintentar (p. ej. sin red la primera vez)
    throw e
  })
  return workerPromise
}

/** Libera el worker (memoria del WASM). Se vuelve a crear en la siguiente importación. */
export async function disposeOcr() {
  const p = workerPromise
  workerPromise = null
  if (p) await (await p).terminate().catch(() => {})
}

/** Decodifica y, si hace falta, reescala la imagen. Lanza ImportError('unreadable') si no es una imagen válida. */
async function prepare(file: Blob): Promise<{ image: Blob; height: number }> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file)
  } catch {
    throw new ImportError('unreadable', 'No se pudo abrir la imagen. Elige una captura en JPG o PNG.')
  }
  const scale = targetScale(bmp.width, bmp.height)
  if (scale === 1) {
    const h = bmp.height
    bmp.close()
    return { image: file, height: h }
  }
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = new OffscreenCanvas(w, h)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return { image: await canvas.convertToBlob({ type: 'image/png' }), height: h }
}

/**
 * Reconoce el texto de una imagen (spa) y devuelve líneas/palabras con cajas y confianza. Funciona sin red tras la
 * primera descarga del motor y del idioma (el SW cachea /ocr y tesseract.js guarda el idioma en IndexedDB).
 */
export async function ocrImage(file: Blob, onProgress?: (p: OcrProgress) => void): Promise<OcrResult> {
  progressSink = onProgress
  try {
    onProgress?.({ stage: 'engine', fraction: 0 })
    const { image, height } = await prepare(file)
    let worker: Worker
    try {
      worker = await getWorker()
    } catch {
      throw new ImportError('engine-failed', 'No se pudo cargar el lector de texto. La primera vez necesita conexión para descargarlo (unos 6 MB).')
    }
    onProgress?.({ stage: 'reading', fraction: 0 })
    const { data } = await worker.recognize(image, {}, { blocks: true })
    const { PSM } = await import('tesseract.js')
    let lines = linesFromTesseract(data as unknown as TessData)
    lines = await refineDateTime(worker as unknown as RefineWorker, image, lines, height, PSM.SINGLE_LINE, PSM.AUTO)
    onProgress?.({ stage: 'reading', fraction: 1 })
    return { lines, text: lines.map((l) => l.text).join('\n'), confidence: data.confidence }
  } finally {
    progressSink = undefined
  }
}
