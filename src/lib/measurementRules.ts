/**
 * Reglas de PLAUSIBILIDAD y CONSISTENCIA de una medición de composición corporal (14 indicadores de báscula tipo Fitdays).
 * Módulo puro: sin Dexie, React ni red. `validate(m, ctx?)` devuelve una lista de {campo, nivel, mensaje}:
 *  - 'error': valor imposible o inconsistente de forma grosera (casi seguro un fallo de lectura/OCR o un dato erróneo);
 *  - 'aviso': dudoso pero posible (revisar antes de guardar).
 * Los rangos individuales son los de plausibilidad fisiológica; las relaciones cruzadas usan tolerancias en dos niveles
 * (hasta `aviso` se acepta; entre `aviso` y `error` se avisa; más allá es error).
 *
 * Relaciones comprobadas (las básculas de bioimpedancia las cumplen por construcción, salvo redondeo):
 *  - masa libre de grasa ≈ peso × (1 − grasa/100)
 *  - masa muscular ≈ masa libre de grasa − masa ósea, y ≤ masa libre de grasa ≤ peso
 *  - frecuencia muscular (%) ≈ masa muscular / peso
 *  - grasa subcutánea ≤ grasa corporal total
 *  - IMC ≈ peso / altura² (altura opcional; sin ella se comprueba que la altura implícita sea humana)
 *  - agua corporal ≈ 73 % de la masa libre de grasa (±), y nunca mayor que ella
 *  - proteína (%) ≈ masa libre de grasa (%) − agua (%) − masa ósea (%)
 *  - BMR ≈ Katch-McArdle (370 + 21,6 × masa libre de grasa), con margen
 * Todos los campos son opcionales: una regla solo se evalúa si tiene los campos que necesita.
 */
import type { BodyMeasurement, MeasurementKey } from './bodyMeasurement'

export type IssueLevel = 'error' | 'aviso'
export interface MeasurementIssue {
  campo: MeasurementKey
  nivel: IssueLevel
  mensaje: string
}
export interface MeasurementContext {
  /** Altura en metros (1,0–2,5). Opcional: activa la comprobación IMC ↔ peso/altura². */
  heightM?: number
  /** Edad real en años. Opcional: activa el aviso por edad corporal muy distinta. */
  age?: number
}

/** Rango de plausibilidad por indicador (fuera = error). Sin rango propio donde la regla es relativa (masa muscular). */
export const PLAUSIBLE: Readonly<Record<MeasurementKey, readonly [min: number, max: number]>> = {
  weightKg: [30, 300],
  bmi: [10, 60],
  bodyFatPct: [3, 60],
  musclePct: [20, 90],
  leanMassKg: [15, 250],
  subcutaneousFatPct: [0.5, 55],
  visceralFat: [1, 30],
  bodyWaterPct: [35, 75],
  skeletalMusclePct: [20, 65],
  muscleMassKg: [10, 220],
  boneMassKg: [1, 6],
  proteinPct: [5, 30],
  bmr: [800, 4000],
  bodyAge: [10, 100],
}

const LABEL: Readonly<Record<MeasurementKey, string>> = {
  weightKg: 'El peso',
  bmi: 'El IMC',
  bodyFatPct: 'La grasa corporal',
  musclePct: 'La frecuencia muscular',
  leanMassKg: 'La masa libre de grasa',
  subcutaneousFatPct: 'La grasa subcutánea',
  visceralFat: 'La grasa visceral',
  bodyWaterPct: 'El agua corporal',
  skeletalMusclePct: 'El músculo esquelético',
  muscleMassKg: 'La masa muscular',
  boneMassKg: 'La masa ósea',
  proteinPct: 'La proteína',
  bmr: 'El metabolismo basal',
  bodyAge: 'La edad corporal',
}
const UNIT: Readonly<Record<MeasurementKey, string>> = {
  weightKg: ' kg', bmi: '', bodyFatPct: ' %', musclePct: ' %', leanMassKg: ' kg', subcutaneousFatPct: ' %', visceralFat: '',
  bodyWaterPct: ' %', skeletalMusclePct: ' %', muscleMassKg: ' kg', boneMassKg: ' kg', proteinPct: ' %', bmr: ' kcal', bodyAge: ' años',
}

const fmt = (n: number, d = 1) => n.toFixed(d).replace('.', ',')
const show = (k: MeasurementKey, v: number) => `${fmt(v, k === 'bmr' || k === 'bodyAge' ? 0 : 1)}${UNIT[k]}`

/** Nivel según la distancia a lo esperado: ≤ aviso → ok (null); ≤ error → aviso; más → error. */
const tier = (diff: number, avisoTol: number, errorTol: number): IssueLevel | null => {
  const a = Math.abs(diff)
  return a <= avisoTol ? null : a <= errorTol ? 'aviso' : 'error'
}

export function validate(m: BodyMeasurement, ctx: MeasurementContext = {}): MeasurementIssue[] {
  const out: MeasurementIssue[] = []
  const add = (campo: MeasurementKey, nivel: IssueLevel, mensaje: string) => out.push({ campo, nivel, mensaje })
  const has = (k: MeasurementKey) => typeof m[k] === 'number'

  // ── 1. cada indicador: número válido y dentro de su rango plausible ──
  const bad = new Set<MeasurementKey>()
  for (const k of Object.keys(PLAUSIBLE) as MeasurementKey[]) {
    const v = m[k]
    if (v === undefined) continue
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      add(k, 'error', `${LABEL[k]} no es un número válido.`)
      bad.add(k)
      continue
    }
    const [lo, hi] = PLAUSIBLE[k]
    if (v < lo || v > hi) {
      add(k, 'error', `${LABEL[k]} (${show(k, v)}) está fuera del rango plausible (${fmt(lo, lo % 1 ? 1 : 0)}–${fmt(hi, 0)}${UNIT[k]}).`)
      bad.add(k)
    }
  }
  // las relaciones solo usan campos válidos
  const g = (k: MeasurementKey): number | undefined => (has(k) && !bad.has(k) ? (m[k] as number) : undefined)
  const w = g('weightKg'), fat = g('bodyFatPct'), lean = g('leanMassKg'), muscle = g('muscleMassKg'), bone = g('boneMassKg')
  const water = g('bodyWaterPct'), protein = g('proteinPct'), bmi = g('bmi'), bmr = g('bmr')

  // ── 2. masa libre de grasa ≈ peso × (1 − grasa%) ──
  if (w !== undefined && fat !== undefined && lean !== undefined) {
    const expected = w * (1 - fat / 100)
    const tol = 0.6 + 0.008 * w
    const lv = tier(lean - expected, tol, tol * 3)
    if (lv) add('leanMassKg', lv, `${LABEL.leanMassKg} (${show('leanMassKg', lean)}) no cuadra con el peso y la grasa: se esperaba ≈ ${fmt(expected)} kg.`)
  }
  if (w !== undefined && lean !== undefined && lean > w + 0.2) {
    add('leanMassKg', 'error', `${LABEL.leanMassKg} (${show('leanMassKg', lean)}) no puede superar el peso (${show('weightKg', w)}).`)
  }

  // ── 3. masa muscular: ≤ peso, ≤ libre de grasa, ≈ libre de grasa − ósea ──
  if (w !== undefined && muscle !== undefined && muscle > w) {
    add('muscleMassKg', 'error', `${LABEL.muscleMassKg} (${show('muscleMassKg', muscle)}) no puede superar el peso (${show('weightKg', w)}).`)
  }
  if (lean !== undefined && muscle !== undefined && muscle > lean + 0.3) {
    add('muscleMassKg', 'error', `${LABEL.muscleMassKg} (${show('muscleMassKg', muscle)}) no puede superar la masa libre de grasa (${show('leanMassKg', lean)}).`)
  } else if (lean !== undefined && muscle !== undefined && bone !== undefined) {
    const lv = tier(muscle - (lean - bone), 1.2, 4)
    if (lv) add('muscleMassKg', lv, `${LABEL.muscleMassKg} (${show('muscleMassKg', muscle)}) no cuadra con masa libre de grasa − masa ósea (≈ ${fmt(lean - bone)} kg).`)
  }

  // ── 4. frecuencia muscular % ≈ masa muscular / peso ──
  const musclePct = g('musclePct')
  if (w !== undefined && muscle !== undefined && musclePct !== undefined) {
    const lv = tier(musclePct - (muscle / w) * 100, 2, 5)
    if (lv) add('musclePct', lv, `${LABEL.musclePct} (${show('musclePct', musclePct)}) no cuadra con masa muscular / peso (≈ ${fmt((muscle / w) * 100)} %).`)
  }

  // ── 5. músculo esquelético: ≤ frecuencia muscular y ≤ masa muscular ──
  const skel = g('skeletalMusclePct')
  if (skel !== undefined && musclePct !== undefined && skel > musclePct + 1) {
    add('skeletalMusclePct', 'aviso', `${LABEL.skeletalMusclePct} (${show('skeletalMusclePct', skel)}) no debería superar la frecuencia muscular (${show('musclePct', musclePct)}).`)
  }
  if (skel !== undefined && w !== undefined && muscle !== undefined && (skel / 100) * w > muscle + 0.8) {
    add('skeletalMusclePct', 'aviso', `${LABEL.skeletalMusclePct} (≈ ${fmt((skel / 100) * w)} kg) supera la masa muscular (${show('muscleMassKg', muscle)}).`)
  }

  // ── 6. grasa subcutánea ≤ grasa total ──
  const sub = g('subcutaneousFatPct')
  if (sub !== undefined && fat !== undefined && sub > fat + 0.5) {
    add('subcutaneousFatPct', 'error', `${LABEL.subcutaneousFatPct} (${show('subcutaneousFatPct', sub)}) no puede superar la grasa corporal total (${show('bodyFatPct', fat)}).`)
  }

  // ── 7. IMC ↔ peso/altura² ──
  const h = ctx.heightM
  if (h !== undefined && Number.isFinite(h) && (h < 1 || h > 2.5)) {
    add('bmi', 'aviso', `La altura indicada (${fmt(h, 2)} m) no es plausible; no se comprueba el IMC con ella.`)
  } else if (w !== undefined && bmi !== undefined) {
    if (h !== undefined && Number.isFinite(h)) {
      const lv = tier(bmi - w / (h * h), 0.4, 1.2)
      if (lv) add('bmi', lv, `${LABEL.bmi} (${fmt(bmi)}) no cuadra con peso y altura (≈ ${fmt(w / (h * h))}).`)
    } else {
      const implied = Math.sqrt(w / bmi)
      if (implied < 1.0 || implied > 2.5) add('bmi', 'error', `${LABEL.bmi} (${fmt(bmi)}) con ese peso implica una altura de ${fmt(implied, 2)} m, imposible.`)
      else if (implied < 1.3 || implied > 2.15) add('bmi', 'aviso', `${LABEL.bmi} (${fmt(bmi)}) con ese peso implica una altura de ${fmt(implied, 2)} m, poco habitual.`)
    }
  }

  // ── 8. agua corporal ≈ 73 % de la masa libre de grasa, y ≤ ella ──
  if (w !== undefined && lean !== undefined && water !== undefined) {
    const leanPct = (lean / w) * 100
    if (water > leanPct + 1) {
      add('bodyWaterPct', 'error', `${LABEL.bodyWaterPct} (${show('bodyWaterPct', water)}) no puede superar la masa libre de grasa (${fmt(leanPct)} % del peso).`)
    } else {
      const lv = tier(water - 0.73 * leanPct, 6, 12)
      if (lv) add('bodyWaterPct', lv, `${LABEL.bodyWaterPct} (${show('bodyWaterPct', water)}) es poco habitual para esa masa libre de grasa (≈ ${fmt(0.73 * leanPct)} %).`)
    }
  }

  // ── 9. proteína % ≈ libre de grasa % − agua % − ósea % ──
  if (w !== undefined && lean !== undefined && water !== undefined && bone !== undefined && protein !== undefined) {
    const expected = (lean / w) * 100 - water - (bone / w) * 100
    const lv = tier(protein - expected, 3, 6)
    if (lv) add('proteinPct', lv, `${LABEL.proteinPct} (${show('proteinPct', protein)}) no cuadra con libre de grasa − agua − hueso (≈ ${fmt(expected)} %).`)
  }

  // ── 10. BMR ≈ Katch-McArdle (370 + 21,6 × libre de grasa) ──
  if (lean !== undefined && bmr !== undefined) {
    const expected = 370 + 21.6 * lean
    const lv = tier(bmr / expected - 1, 0.12, 0.25)
    if (lv) add('bmr', lv, `${LABEL.bmr} (${show('bmr', bmr)}) es ${bmr > expected ? 'alto' : 'bajo'} para esa masa libre de grasa (Katch-McArdle ≈ ${fmt(expected, 0)} kcal).`)
  }

  // ── 11. edad corporal frente a la real (opcional) ──
  const bodyAge = g('bodyAge')
  if (bodyAge !== undefined && ctx.age !== undefined && Number.isFinite(ctx.age) && Math.abs(bodyAge - ctx.age) > 30) {
    add('bodyAge', 'aviso', `${LABEL.bodyAge} (${show('bodyAge', bodyAge)}) se aleja más de 30 años de la edad real (${fmt(ctx.age, 0)}).`)
  }

  return out
}

export const hasErrors = (issues: readonly MeasurementIssue[]) => issues.some((i) => i.nivel === 'error')
/** Campos con algún problema del nivel indicado (o de cualquiera si no se indica). */
export const fieldsWithIssues = (issues: readonly MeasurementIssue[], nivel?: IssueLevel): MeasurementKey[] =>
  [...new Set(issues.filter((i) => !nivel || i.nivel === nivel).map((i) => i.campo))]
