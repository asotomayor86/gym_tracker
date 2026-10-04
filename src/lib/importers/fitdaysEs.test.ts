import { describe, expect, it } from 'vitest'
import { MEASUREMENT_KEYS, type BodyMeasurement } from '../bodyMeasurement'
import { validate } from '../measurementRules'
import { ImportError, analyzeOcr, fitdaysEs, linesFromText } from './index'
import type { OcrLine } from './types'

// Datos SINTÉTICOS e internamente coherentes (inventados; no corresponden a ninguna persona real).
const SYN: Required<BodyMeasurement> = {
  weightKg: 80, bmi: 25, bodyFatPct: 20, musclePct: 76.3, leanMassKg: 64, subcutaneousFatPct: 16, visceralFat: 9,
  bodyWaterPct: 57, skeletalMusclePct: 45, muscleMassKg: 61, boneMassKg: 3, proteinPct: 19, bmr: 1750, bodyAge: 38,
}
const NOW = new Date(2026, 9, 10, 12)

const HEADER = 'Maria\n14:26 04/10/2026\n80.0 kg 25.0 20.0 %\nPeso IMC Grasa Corporal\nIndicador Valor Estandar'
const ROWS: [string, string][] = [
  ['Peso', '80.0kg Alto'], ['IMC', '25.0 Alto'], ['Grasa Corporal', '20.0% Sobrepeso'], ['Frecuencia muscular', '76.3% Excelente'],
  ['Pérdida de grasa', '64.0kg'], ['Grasa subcutanea', '16.0% Alto'], ['Grasa Visceral', '9.0 Alto'], ['Agua Corporal', '57.0% Estándar'],
  ['Músculo esquelético', '45.0% Bajo'], ['Masa Muscular', '61.0kg Excelente'], ['Masa Esquelética', '3.0kg Estándar'],
  ['Proteína', '19.0% Estándar'], ['BMR', '1750kcal Excelente'], ['Edad Corporal', '38 Alto'],
]
const FOOTER = 'Fitdays\nconoce completamente tu cuerpo'
const text = (rows = ROWS, header = HEADER) => [header, ...rows.map(([l, v]) => `${l} ${v}`), FOOTER].join('\n')

describe('el conjunto sintético es coherente', () => {
  it('pasa las reglas de plausibilidad sin avisos', () => {
    expect(validate(SYN)).toEqual([])
  })
})

describe('fitdays-es: texto limpio', () => {
  it('lee los 14 indicadores, fecha y hora; ignora la columna «Estándar» y las cabeceras', () => {
    const r = analyzeOcr(linesFromText(text()), NOW)
    expect(r.importerId).toBe('fitdays-es')
    expect(r.values).toEqual(SYN)
    expect(r.doubtful).toEqual([])
    expect(r.missing).toEqual([])
    expect(MEASUREMENT_KEYS.every((k) => r.fields[k].status === 'detected')).toBe(true)
    expect([r.date, r.time]).toEqual(['2026-10-04', '14:26'])
    expect(r.warnings).toEqual([])
    expect(r.confidence).toBeGreaterThan(0.9)
    expect(r.fields.bmr.raw).toBe('1750kcal')
  })

  it('detect da una puntuación alta para el formato y baja para otro texto', () => {
    expect(fitdaysEs.detect(linesFromText(text()))).toBeGreaterThan(0.9)
    expect(fitdaysEs.detect(linesFromText('Lista de la compra\nleche 1.5 l\npan 2 uds\nhuevos 12'))).toBeLessThan(0.2)
  })
})

describe('fitdays-es: ruido típico del OCR', () => {
  it('tolera acentos perdidos, mayúsculas, errores de letra, O/0, l/1, coma decimal y etiqueta pegada al valor', () => {
    const noisy = text([
      ['PESO', '8O.Okg'], ['lMC', '25,0'], ['Grasa Corporaí', '2O,0%'], ['Frecuencia muscuIar', '76.3%'],
      ['Perdida de grasa', '64.0kg'], ['Grasa subcutanea', '16.0 %'], ['Grasa Viscera1', '9.0'], ['Agua Corporal', '57.0%'],
      ['Musculo esqueletico', '45.0%'], ['Masa Muscular', '61.0 kg'], ['Masa Esqueletica', '3.0kg'], ['Proteina', '19,0%'],
      ['BMR', '175Okcal'], ['Edad Corporal', '38'],
    ])
    const r = analyzeOcr(linesFromText(noisy), NOW)
    expect(r.values).toEqual(SYN)
    // Las etiquetas con errores se marcan para revisión; las exactas no.
    expect(r.fields.bodyFatPct.status).toBe('doubtful')
    expect(r.fields.weightKg.status).toBe('detected')
    expect(r.fields.bmi.status).toBe('doubtful') // «lMC» leído con error
  })

  it('une la etiqueta y el valor aunque el motor los devuelva en líneas distintas (cajas)', () => {
    const word = (t: string, x: number, y: number, conf = 90) => ({ text: t, confidence: conf, bbox: [x, y, x + 60, y + 20] as [number, number, number, number] })
    const lines: OcrLine[] = []
    ROWS.forEach(([label, value], i) => {
      const y = 200 + i * 40
      // Columnas separadas: el motor las devuelve como líneas distintas, y la de la derecha en primer lugar.
      lines.push({ text: value, confidence: 90, bbox: [400, y, 560, y + 20], words: value.split(' ').map((v, j) => word(v, 400 + j * 70, y + (i % 2 ? 2 : -2))) })
      lines.push({ text: label, confidence: 90, bbox: [20, y, 300, y + 20], words: label.split(' ').map((w, j) => word(w, 20 + j * 80, y)) })
    })
    lines.push({ text: 'Indicador Valor Estandar', confidence: 90, words: [word('Indicador', 20, 150), word('Valor', 400, 150), word('Estandar', 600, 150)] })
    const r = analyzeOcr(lines, NOW)
    expect(r.values).toEqual(SYN)
    expect(r.doubtful).toEqual([])
  })

  it('etiqueta pegada al valor sin espacio («Peso80.0kg») cuando es el único número de la fila', () => {
    const rows = ROWS.map(([l, v]): [string, string] => (l === 'Peso' ? ['Peso80.0kg', 'Alto'] : [l, v]))
    expect(analyzeOcr(linesFromText(text(rows)), NOW).fields.weightKg).toMatchObject({ status: 'detected', value: 80 })
  })

  it('un punto decimal perdido se corrige y se marca como dudoso', () => {
    const rows = ROWS.map(([l, v]): [string, string] => (l === 'Peso' ? ['Peso', '800kg Alto'] : [l, v]))
    const r = analyzeOcr(linesFromText(text(rows)), NOW)
    expect(r.fields.weightKg).toMatchObject({ status: 'doubtful', value: 80, raw: '800kg' })
    expect(r.fields.weightKg.reason).toMatch(/decimal/)
  })

  it('cifras de la unidad que se cuelan en el número («80.019» por «80.0kg») se recortan y se marcan', () => {
    const rows = ROWS.map(([l, v]): [string, string] => (l === 'Peso' ? ['Peso', '80.019 Alto'] : [l, v]))
    expect(analyzeOcr(linesFromText(text(rows)), NOW).fields.weightKg).toMatchObject({ status: 'doubtful', value: 80 })
  })

  it('una unidad mal leída pero parecida («rg» por «kg») no se marca; una distinta sí', () => {
    const ok = ROWS.map(([l, v]): [string, string] => (l === 'Masa Muscular' ? [l, '61.0rg Excelente'] : [l, v]))
    expect(analyzeOcr(linesFromText(text(ok)), NOW).fields.muscleMassKg.status).toBe('detected')
  })

  it('un valor fuera de rango se marca como dudoso sin inventar otro', () => {
    const rows = ROWS.map(([l, v]): [string, string] => (l === 'Agua Corporal' ? [l, '5.0% Estándar'] : [l, v]))
    const r = analyzeOcr(linesFromText(text(rows)), NOW)
    expect(r.fields.bodyWaterPct).toMatchObject({ status: 'doubtful', value: 5 })
    expect(r.doubtful).toContain('bodyWaterPct')
  })

  it('confianza baja del OCR en el valor → dudoso', () => {
    const lines = linesFromText(text())
    for (const l of lines) if (l.text.startsWith('BMR')) l.words = l.words.map((w) => (/\d/.test(w.text) ? { ...w, confidence: 40 } : w))
    const r = analyzeOcr(lines, NOW)
    expect(r.fields.bmr).toMatchObject({ status: 'doubtful', value: 1750 })
    expect(r.fields.bmr.reason).toMatch(/poco segura/)
  })

  it('unidad que no corresponde al indicador → dudoso', () => {
    const rows = ROWS.map(([l, v]): [string, string] => (l === 'Proteína' ? [l, '19.0kg'] : [l, v]))
    expect(analyzeOcr(linesFromText(text(rows)), NOW).fields.proteinPct.status).toBe('doubtful')
  })
})

describe('fitdays-es: campos que faltan y alternativas', () => {
  it('los indicadores que no aparecen quedan como «missing» y el resto se lee bien', () => {
    const rows = ROWS.filter(([l]) => !['Proteína', 'BMR', 'Edad Corporal'].includes(l))
    const r = analyzeOcr(linesFromText(text(rows)), NOW)
    expect(r.missing).toEqual(['proteinPct', 'bmr', 'bodyAge'])
    expect(r.values.weightKg).toBe(80)
    expect(r.values.bmr).toBeUndefined()
    expect(r.confidence).toBeLessThan(analyzeOcr(linesFromText(text()), NOW).confidence)
  })

  it('si el peso, el IMC o la grasa no están en la tabla se toman de la tarjeta resumen, siempre como dudosos', () => {
    const rows = ROWS.filter(([l]) => !['Peso', 'IMC', 'Grasa Corporal'].includes(l))
    const r = analyzeOcr(linesFromText(text(rows)), NOW)
    expect(r.values).toMatchObject({ weightKg: 80, bmi: 25, bodyFatPct: 20 })
    expect(r.fields.weightKg).toMatchObject({ status: 'doubtful' })
    expect(r.fields.weightKg.reason).toMatch(/resumen/)
  })

  it('la etiqueta «Peso» del encabezado sin valor no se confunde con la fila de la tabla', () => {
    const r = analyzeOcr(linesFromText(text()), NOW)
    expect(r.fields.weightKg).toMatchObject({ status: 'detected', value: 80 })
  })
})

describe('coherencia entre indicadores', () => {
  it('un valor incoherente con los demás marca el campo como dudoso y añade el aviso', () => {
    const rows = ROWS.map(([l, v]): [string, string] => (l === 'Pérdida de grasa' ? [l, '40.0kg'] : [l, v])) // masa libre de grasa incompatible con peso y % de grasa
    const r = analyzeOcr(linesFromText(text(rows)), NOW)
    expect(r.fields.leanMassKg.status).toBe('doubtful')
    expect(r.warnings.length).toBeGreaterThan(0)
  })
})

describe('fecha y hora', () => {
  it('lee «hh:mm dd/mm/aaaa» con confusiones de OCR', () => {
    const r = analyzeOcr(linesFromText(text(ROWS, HEADER.replace('14:26 04/10/2026', 'l4:26 O4/lO/2O26'))), NOW)
    expect([r.date, r.time]).toEqual(['2026-10-04', '14:26'])
  })
  it('fecha imposible o futura → null con aviso; hora válida se mantiene', () => {
    const bad = analyzeOcr(linesFromText(text(ROWS, HEADER.replace('04/10/2026', '31/02/2026'))), NOW)
    expect(bad.date).toBeNull()
    expect(bad.time).toBe('14:26')
    expect(bad.warnings.join(' ')).toMatch(/fecha/)
    const future = analyzeOcr(linesFromText(text(ROWS, HEADER.replace('04/10/2026', '04/12/2027'))), NOW)
    expect(future.date).toBeNull()
  })
  it('sin fecha en la imagen → null (la interfaz la pedirá)', () => {
    const r = analyzeOcr(linesFromText(text(ROWS, 'Maria\n80.0 kg 25.0 20.0 %\nIndicador Valor Estandar')), NOW)
    expect([r.date, r.time]).toEqual([null, null])
  })
})

describe('errores tipados', () => {
  it('sin texto → unreadable; otro tipo de imagen → not-recognized', () => {
    expect(() => analyzeOcr([], NOW)).toThrow(ImportError)
    try {
      analyzeOcr(linesFromText('   '), NOW)
    } catch (e) {
      expect((e as ImportError).code).toBe('unreadable')
    }
    try {
      analyzeOcr(linesFromText('Receta de tortilla\n4 huevos\n2 patatas\nsal'), NOW)
      throw new Error('debía fallar')
    } catch (e) {
      expect((e as ImportError).code).toBe('not-recognized')
    }
  })
  it('acepta también un OcrResult completo con su confianza global', () => {
    const lines = linesFromText(text())
    const r = analyzeOcr({ lines, text: text(), confidence: 50 }, NOW)
    expect(r.confidence).toBeLessThan(analyzeOcr(lines, NOW).confidence + 0.01)
  })
})
