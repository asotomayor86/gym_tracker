import type { BodyMeasurement, MeasurementKey } from '../bodyMeasurement'

/** Línea de texto reconocida por el OCR (con su caja si el motor la da). */
export interface OcrWord {
  text: string
  /** Confianza 0..100 del motor. */
  confidence: number
  /** Caja en píxeles: x0, y0, x1, y1. */
  bbox?: [number, number, number, number]
}
export interface OcrLine {
  text: string
  confidence: number
  bbox?: [number, number, number, number]
  words: OcrWord[]
}
export interface OcrResult {
  lines: OcrLine[]
  /** Texto completo, por si el importador prefiere trabajar sobre él. */
  text: string
  /** Confianza media 0..100. */
  confidence: number
}

/** Estado de cada indicador tras el análisis. 'doubtful' = hay valor pero la UI debe pedir revisarlo. */
export type FieldStatus = 'detected' | 'doubtful' | 'missing'

export interface FieldReview {
  status: FieldStatus
  /** Valor propuesto (solo si status es 'detected' o 'doubtful'). */
  value?: number
  /** Texto que leyó el OCR para ese indicador (para enseñarlo al revisar). */
  raw?: string
  /** Motivo de la duda, en español. */
  reason?: string
}

/** Lo que devuelve un importador: valores + avisos; todavía sin guardar nada. */
export interface ParsedMeasurement {
  importerId: string
  /** Fecha YYYY-MM-DD y hora HH:mm detectadas (null si no se pudieron leer). */
  date: string | null
  time: string | null
  fields: Record<MeasurementKey, FieldReview>
  /** Avisos generales en español (p. ej. incoherencias entre indicadores). */
  warnings: string[]
}

/** Resultado revisable que ve la interfaz. */
export interface ImportReview extends ParsedMeasurement {
  /** Valores propuestos (detected + doubtful) listos para rellenar el formulario editable. */
  values: BodyMeasurement
  /** Indicadores con valor pero dudoso, y los que faltan. */
  doubtful: MeasurementKey[]
  missing: MeasurementKey[]
  /** Confianza global 0..1 (OCR + coherencia). */
  confidence: number
}

export interface Importer {
  id: string
  name: string
  /** 0..1: cuánto se parece el texto OCR al formato que sabe leer. */
  detect(lines: OcrLine[]): number
  parse(lines: OcrLine[], now?: Date): ParsedMeasurement
}

export type ImportErrorCode = 'unreadable' | 'not-recognized' | 'engine-failed'
export class ImportError extends Error {
  code: ImportErrorCode
  constructor(code: ImportErrorCode, message: string) {
    super(message)
    this.name = 'ImportError'
    this.code = code
  }
}

export interface OcrProgress {
  stage: 'engine' | 'reading'
  /** 0..1 */
  fraction: number
}
