import { MEASUREMENT_KEYS, fieldOf, inRange, type BodyMeasurement, type MeasurementKey } from '../bodyMeasurement'
import { validate } from '../measurementRules'
import { distance, firstNumber, normText, visualRows, type Cell } from './text'
import type { FieldReview, Importer, OcrLine, ParsedMeasurement } from './types'

/**
 * Importador de la captura de resultados de Fitdays en español (tarjeta resumen + tabla Indicador | Valor | Estándar).
 * Trabaja sobre las filas visuales del OCR: empareja cada indicador por su ETIQUETA (tolerando errores de OCR), toma el
 * número de la misma fila y valida rangos y coherencia. La columna «Estándar» (Alto, Bajo…) se ignora.
 */

/** Etiqueta normalizada (sin tildes, minúsculas) → indicador. Orden de la tabla de la báscula. */
const LABELS: { key: MeasurementKey; label: string; unit: '' | 'kg' | '%' | 'kcal' }[] = [
  { key: 'weightKg', label: 'peso', unit: 'kg' },
  { key: 'bmi', label: 'imc', unit: '' },
  { key: 'bodyFatPct', label: 'grasa corporal', unit: '%' },
  { key: 'musclePct', label: 'frecuencia muscular', unit: '%' },
  { key: 'leanMassKg', label: 'perdida de grasa', unit: 'kg' },
  { key: 'subcutaneousFatPct', label: 'grasa subcutanea', unit: '%' },
  { key: 'visceralFat', label: 'grasa visceral', unit: '' },
  { key: 'bodyWaterPct', label: 'agua corporal', unit: '%' },
  { key: 'skeletalMusclePct', label: 'musculo esqueletico', unit: '%' },
  { key: 'muscleMassKg', label: 'masa muscular', unit: 'kg' },
  { key: 'boneMassKg', label: 'masa esqueletica', unit: 'kg' },
  { key: 'proteinPct', label: 'proteina', unit: '%' },
  { key: 'bmr', label: 'bmr', unit: 'kcal' },
  { key: 'bodyAge', label: 'edad corporal', unit: '' },
]

/** Confianza del OCR (0..100) por debajo de la cual el valor se marca como dudoso. */
const LOW_CONFIDENCE = 60

/** Tolerancia de edición para emparejar una etiqueta, según su longitud. */
const tolerance = (len: number) => (len >= 12 ? 2 : len >= 6 ? 1 : 0)

const NUM_START = /^[0-9OolI|!SBZ°]+(?:[.,][0-9OolI|!SBZ°]+)?[a-zA-Z%]*$/
const isNumericCell = (t: string) => NUM_START.test(t) && (/[0-9]/.test(t) || /[.,]/.test(t))

/**
 * Separa «Peso95.2kg» en «Peso» y «95.2kg» (letras seguidas de cifras pegadas), pero SOLO si la fila no tiene ya otro
 * número suelto: en «Grasa Viscera1 9.0» el «1» es una «l» mal leída, no un valor.
 */
const splitGlued = (cells: Cell[]): Cell[] => {
  if (cells.some((c) => isNumericCell(c.text))) return cells
  return cells.flatMap((c) => {
    const m = c.text.match(/^([A-Za-zÁÉÍÓÚáéíóúñÑ]{3,})(\d.*)$/)
    return m ? [{ ...c, text: m[1] }, { ...c, text: m[2] }] : [c]
  })
}

interface Candidate {
  key: MeasurementKey
  value: number
  raw: string
  unit: string
  /** Parte numérica corregida tal como la leyó el OCR (p. ej. '95.219'). */
  digits?: string
  confidence?: number
  score: number
  /** Distancia de edición de la etiqueta (0 = exacta). */
  dist: number
}

function matchLabel(text: string): { entry: (typeof LABELS)[number]; dist: number } | null {
  let best: { entry: (typeof LABELS)[number]; dist: number } | null = null
  let tie = false
  for (const entry of LABELS) {
    const d = distance(text, entry.label)
    const ok = entry.label.length === 3 ? d <= 1 && text.length === 3 : d <= tolerance(entry.label.length)
    if (!ok) continue
    if (!best || d < best.dist) {
      best = { entry, dist: d }
      tie = false
    } else if (d === best.dist) tie = true
  }
  return best && !tie ? best : null
}

/** Filas del texto OCR: cada fila = celdas (palabras) de izquierda a derecha. */
const rowsOf = (lines: OcrLine[]) => visualRows(lines).map(splitGlued).filter((r) => r.length)

/** Cuántos indicadores distintos se reconocen por su etiqueta (para detect). */
function labelsFound(rows: Cell[][]): Set<MeasurementKey> {
  const found = new Set<MeasurementKey>()
  for (const row of rows) {
    const k = row.findIndex((c) => isNumericCell(c.text))
    const labelText = normText((k === -1 ? row : row.slice(0, k)).map((c) => c.text).join(' '))
    if (!labelText) continue
    const m = matchLabel(labelText)
    if (m) found.add(m.entry.key)
  }
  return found
}

const pad = (n: number) => String(n).padStart(2, '0')
const DIG = '[0-9OolI|!]'

/** Fecha dd/mm/aaaa y hora hh:mm (en cualquier orden y con confusiones de OCR). */
export function parseDateTime(text: string, now = new Date()): { date: string | null; time: string | null; warnings: string[] } {
  const warnings: string[] = []
  const fix = (s: string) => Number(s.replace(/[Oo]/g, '0').replace(/[lI|!]/g, '1'))
  let time: string | null = null
  let date: string | null = null
  const t = text.match(new RegExp(`(?<![0-9/.:-])(${DIG}{1,2})\\s*[:;.]\\s*(${DIG}{2})(?![0-9/.:-])`))
  if (t) {
    const [h, m] = [fix(t[1]), fix(t[2])]
    if (h < 24 && m < 60) time = `${pad(h)}:${pad(m)}`
  }
  const d = text.match(new RegExp(`(${DIG}{1,2})\\s*[/.\\-]\\s*(${DIG}{1,2})\\s*[/.\\-]\\s*([0-9OolI|!SB]{4})`))
  if (d) {
    const [dd, mm] = [fix(d[1]), fix(d[2])]
    const yyyy = fix(d[3].replace(/S/g, '5').replace(/B/g, '8'))
    const ok = new Date(Date.UTC(yyyy, mm - 1, dd))
    if (mm >= 1 && mm <= 12 && ok.getUTCDate() === dd && ok.getUTCMonth() === mm - 1 && yyyy >= 2015 && yyyy <= now.getFullYear() + 1) {
      const iso = `${yyyy}-${pad(mm)}-${pad(dd)}`
      if (Date.UTC(yyyy, mm - 1, dd) > now.getTime() + 2 * 86_400_000) warnings.push('La fecha leída está en el futuro: revísala.')
      else date = iso
    } else warnings.push('No se pudo leer bien la fecha de la medición.')
  }
  return { date, time, warnings }
}

function review(c: Candidate | undefined, unit: string): FieldReview {
  if (!c) return { status: 'missing' }
  const f = fieldOf(c.key)
  let value = c.value
  let reason: string | undefined
  // Cifras de más tras el decimal: la unidad pegada («kg» leída como «19») se coló en el número: «95.219» → «95.2».
  if (f.decimals > 0 && c.digits?.includes('.')) {
    const [int, dec = ''] = c.digits.split('.')
    if (dec.length > f.decimals) {
      value = Number(`${int}.${dec.slice(0, f.decimals)}`)
      reason = 'Se ignoraron cifras sobrantes pegadas al número (¿la unidad mal leída?): revisa el valor.'
    }
  }
  // Punto decimal perdido: «952» en vez de «95.2».
  if (!inRange(c.key, value) && f.decimals > 0 && !reason) {
    for (const div of [10, 100]) {
      if (inRange(c.key, value / div)) {
        value = Math.round((value / div) * 10) / 10
        reason = 'Posible punto decimal perdido: revisa el valor.'
        break
      }
    }
  }
  if (!inRange(c.key, value)) return { status: 'doubtful', value, raw: c.raw, reason: 'Valor fuera de lo habitual: revísalo.' }
  // La unidad se compara con tolerancia (el OCR lee «kg» como «rg» o «ka», «%» como «x»).
  if (c.unit && unit && distance(c.unit, unit) > 1) reason ??= `La unidad leída («${c.unit}») no coincide con la esperada (${unit}).`
  if (c.confidence !== undefined && c.confidence < LOW_CONFIDENCE) reason ??= 'Lectura poco segura: revísalo.'
  if (c.dist > 0) reason ??= 'La etiqueta se leyó con errores: revisa que sea este indicador.'
  return reason ? { status: 'doubtful', value, raw: c.raw, reason } : { status: 'detected', value, raw: c.raw }
}

function parse(lines: OcrLine[], now = new Date()): ParsedMeasurement {
  const rows = rowsOf(lines)
  const candidates = new Map<MeasurementKey, Candidate>()
  const summary: { value: number; raw: string; unit: string; confidence?: number }[] = []
  let firstLabelRow = Infinity

  rows.forEach((row, ri) => {
    const k = row.findIndex((c) => isNumericCell(c.text))
    if (k === -1) return
    const labelText = normText(row.slice(0, k).map((c) => c.text).join(' '))
    const hit = firstNumber(row, k)
    if (!hit) return
    const m = labelText ? matchLabel(labelText) : null
    if (!m) {
      // Fila sin etiqueta reconocible con números: puede ser la tarjeta resumen (peso kg · IMC · grasa %).
      if (!labelText) {
        let from = 0
        for (let n = 0; n < 3; n++) {
          const h = firstNumber(row, from)
          if (!h) break
          summary.push({ value: h.value, raw: h.raw, unit: h.unit, confidence: h.confidence })
          from = h.index + 1
        }
      }
      return
    }
    firstLabelRow = Math.min(firstLabelRow, ri)
    const cand: Candidate = {
      key: m.entry.key, value: hit.value, digits: hit.digits, raw: `${hit.raw}${hit.unit && !/[a-z%]$/i.test(hit.raw) ? ` ${hit.unit}` : ''}`.trim(), unit: hit.unit,
      confidence: hit.confidence, dist: m.dist, score: (m.dist === 0 ? 100 : 50) + (hit.unit === m.entry.unit ? 20 : 0) + (hit.confidence ?? 80) / 10,
    }
    const prev = candidates.get(cand.key)
    if (!prev || cand.score > prev.score) candidates.set(cand.key, cand)
  })

  // Tarjeta resumen como alternativa para peso, IMC y grasa si la tabla no los dio (siempre dudosos).
  const fallback = new Map<MeasurementKey, Candidate>()
  for (const s of summary) {
    const key: MeasurementKey | null = s.unit === 'kg' ? 'weightKg' : s.unit === '%' ? 'bodyFatPct' : s.unit === '' || s.unit === 'x' ? 'bmi' : null
    if (key && !candidates.has(key) && !fallback.has(key)) {
      fallback.set(key, { key, value: s.value, raw: s.raw, unit: s.unit, confidence: s.confidence, dist: 1, score: 0 })
    }
  }

  const fields = {} as Record<MeasurementKey, FieldReview>
  for (const entry of LABELS) {
    const fromTable = candidates.get(entry.key)
    const r = review(fromTable ?? fallback.get(entry.key), entry.unit)
    if (!fromTable && fallback.has(entry.key) && r.status !== 'missing') {
      fields[entry.key] = { ...r, status: 'doubtful', reason: 'Leído del resumen superior (no estaba en la tabla): revísalo.' }
    } else fields[entry.key] = r
  }

  // Coherencia entre indicadores (reglas de plausibilidad): marca como dudosos los implicados.
  const warnings: string[] = []
  const values: BodyMeasurement = {}
  for (const k of MEASUREMENT_KEYS) if (fields[k].value !== undefined) values[k] = fields[k].value
  for (const issue of validate(values)) {
    warnings.push(issue.mensaje)
    const f = fields[issue.campo]
    if (f && f.status === 'detected') fields[issue.campo] = { ...f, status: 'doubtful', reason: issue.mensaje }
  }

  const text = rows.map((r) => r.map((c) => c.text).join(' ')).join('\n')
  const dt = parseDateTime(text, now)
  warnings.unshift(...dt.warnings)
  return { importerId: 'fitdays-es', date: dt.date, time: dt.time, fields, warnings }
}

function detect(lines: OcrLine[]): number {
  const rows = rowsOf(lines)
  const found = labelsFound(rows).size
  const text = normText(rows.map((r) => r.map((c) => c.text).join(' ')).join(' '))
  const hints = ['fitdays', 'indicador', 'estandar', 'conoce completamente'].filter((h) => text.includes(h)).length
  return Math.min(1, (Math.min(found, 9) / 9) * 0.85 + Math.min(hints, 1) * 0.15)
}

export const fitdaysEs: Importer = { id: 'fitdays-es', name: 'Fitdays (español)', detect, parse }
