import type { OcrLine, OcrWord } from './types'

/** Minúsculas, sin tildes, sin signos raros y con espacios simples: base para comparar etiquetas. */
export const normText = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%.,:/\s-]/g, ' ').replace(/\s+/g, ' ').trim()

/** Distancia de edición (Levenshtein) entre dos cadenas cortas. */
export function distance(a: string, b: string): number {
  if (a === b) return 0
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

/**
 * Confusiones típicas del OCR entre letras y cifras dentro de un token numérico (O/o→0, l/I/|/!→1, S→5, B→8, Z→2),
 * solo si el token ya tiene al menos una cifra o parece un número (para no convertir palabras).
 */
export function fixNumericToken(tok: string): string {
  return tok.replace(/[Oo°]/g, '0').replace(/[lI|!]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2').replace(/,/g, '.')
}

/** ¿Parece un número una vez corregidas las confusiones? (≥1 cifra real o todo cifras/confusiones con decimal). */
const NUMERIC_TOKEN = /^[0-9OolI|!SBZ°]+(?:[.,][0-9OolI|!SBZ°]+)?$/

export interface NumberHit {
  value: number
  /** Texto original del token. */
  raw: string
  /** Parte numérica ya corregida (confusiones de OCR, coma→punto), p. ej. '95.219'. */
  digits: string
  /** Texto pegado detrás (unidad: 'kg', '%', 'kcal'…) normalizado. */
  unit: string
  /** Confianza del OCR para ese token (0..100) si se conoce. */
  confidence?: number
  /** Índice del token en la fila. */
  index: number
}

/** Palabras de una fila, con confianza opcional. */
export interface Cell {
  text: string
  confidence?: number
}

/**
 * Busca el primer número de la fila a partir de `from`, aceptando unidad pegada («95.2kg», «25.6%», «1899kcal») o separada
 * («95.2 kg»), coma decimal y confusiones de OCR. Un token como «kg» o «Alto» no cuenta como número.
 */
export function firstNumber(cells: Cell[], from = 0): NumberHit | null {
  for (let i = from; i < cells.length; i++) {
    const m = cells[i].text.match(/^([0-9OolI|!SBZ°]+(?:[.,][0-9OolI|!SBZ°]+)?)\s*([a-zA-Z%]*)$/)
    if (!m || !NUMERIC_TOKEN.test(m[1])) continue
    // Un token de solo letras-confusión (p. ej. «lO») sin ninguna cifra real es sospechoso: exige una cifra o coma/punto.
    if (!/[0-9]/.test(m[1]) && !/[.,]/.test(m[1])) continue
    const fixed = fixNumericToken(m[1])
    const value = Number(fixed)
    if (!Number.isFinite(value)) continue
    let unit = normText(m[2])
    // La unidad puede venir en la celda siguiente («95.2» «kg»).
    if (!unit && cells[i + 1] && /^(kg|%|kcal|x|r)$/i.test(cells[i + 1].text.trim())) unit = normText(cells[i + 1].text)
    return { value, raw: cells[i].text, digits: fixed, unit, confidence: cells[i].confidence, index: i }
  }
  return null
}

/** Convierte una línea de OCR en celdas (palabras con su confianza; si no hay palabras, trocea el texto). */
export function cellsOf(line: OcrLine): Cell[] {
  if (line.words?.length) return line.words.map((w: OcrWord) => ({ text: w.text, confidence: w.confidence }))
  return line.text.split(/\s+/).filter(Boolean).map((t) => ({ text: t, confidence: line.confidence }))
}

/**
 * Reconstruye las filas visuales a partir de las palabras con caja: agrupa por altura (centro vertical) y ordena por x.
 * Así, aunque el motor separe «etiqueta» y «valor» en líneas distintas (columnas de la tabla), se vuelven a unir.
 * Si no hay cajas suficientes, devuelve las líneas tal cual.
 */
export function visualRows(lines: OcrLine[]): Cell[][] {
  const words = lines.flatMap((l) => l.words ?? []).filter((w) => w.bbox && w.text.trim())
  const total = lines.reduce((n, l) => n + (l.words?.length ?? 0), 0)
  if (!words.length || words.length < total * 0.8) return lines.map(cellsOf)
  const sorted = [...words].sort((a, b) => (a.bbox![1] + a.bbox![3]) / 2 - (b.bbox![1] + b.bbox![3]) / 2)
  const heights = sorted.map((w) => w.bbox![3] - w.bbox![1]).sort((a, b) => a - b)
  const tol = Math.max(4, (heights[Math.floor(heights.length / 2)] || 10) * 0.6)
  const rows: { y: number; words: typeof words }[] = []
  for (const w of sorted) {
    const y = (w.bbox![1] + w.bbox![3]) / 2
    const row = rows.find((r) => Math.abs(r.y - y) <= tol)
    if (row) {
      row.words.push(w)
      row.y = (row.y * (row.words.length - 1) + y) / row.words.length
    } else rows.push({ y, words: [w] })
  }
  return rows.sort((a, b) => a.y - b.y).map((r) => r.words.sort((a, b) => a.bbox![0] - b.bbox![0]).map((w) => ({ text: w.text, confidence: w.confidence })))
}
