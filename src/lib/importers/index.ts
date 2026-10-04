import { MEASUREMENT_KEYS, type BodyMeasurement, type MeasurementKey } from '../bodyMeasurement'
import { fitdaysEs } from './fitdaysEs'
import { ImportError, type ImportReview, type Importer, type OcrLine, type OcrResult } from './types'

export * from './types'
export { fitdaysEs } from './fitdaysEs'

/** Importadores disponibles (se prueban todos y gana el que mejor reconoce el texto). */
export const IMPORTERS: Importer[] = [fitdaysEs]

/** Por debajo de esta puntuación de `detect` se considera que la imagen no es de ningún formato conocido. */
export const MIN_DETECT = 0.35

/** Texto plano → líneas (para pruebas y para motores que solo devuelven texto). */
export const linesFromText = (text: string, confidence = 90): OcrLine[] =>
  text.split('\n').map((t) => t.trim()).filter(Boolean).map((t) => ({ text: t, confidence, words: t.split(/\s+/).map((w) => ({ text: w, confidence })) }))

/**
 * Analiza el resultado del OCR con el importador que mejor lo reconozca y devuelve un resultado REVISABLE
 * (nada se guarda): valores por indicador con su estado, fecha/hora y avisos.
 */
export function analyzeOcr(ocr: OcrResult | OcrLine[], now = new Date()): ImportReview {
  const lines = Array.isArray(ocr) ? ocr : ocr.lines
  const ocrConfidence = Array.isArray(ocr) ? undefined : ocr.confidence
  if (!lines.length || !lines.some((l) => l.text.trim())) throw new ImportError('unreadable', 'No se ha podido leer texto en la imagen.')
  const ranked = IMPORTERS.map((imp) => ({ imp, score: imp.detect(lines) })).sort((a, b) => b.score - a.score)
  if (!ranked.length || ranked[0].score < MIN_DETECT) {
    throw new ImportError('not-recognized', 'La imagen no parece una captura de resultados de una báscula compatible (Fitdays en español).')
  }
  const parsed = ranked[0].imp.parse(lines, now)
  const values: BodyMeasurement = {}
  const doubtful: MeasurementKey[] = []
  const missing: MeasurementKey[] = []
  for (const k of MEASUREMENT_KEYS) {
    const f = parsed.fields[k]
    if (f.status === 'missing') missing.push(k)
    else {
      values[k] = f.value
      if (f.status === 'doubtful') doubtful.push(k)
    }
  }
  const solid = MEASUREMENT_KEYS.length - doubtful.length - missing.length
  const confidence = Math.round(((ocrConfidence !== undefined ? ocrConfidence / 100 : 0.8) * 0.4 + (solid / MEASUREMENT_KEYS.length) * 0.6) * 100) / 100
  return { ...parsed, values, doubtful, missing, confidence }
}
