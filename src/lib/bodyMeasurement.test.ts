import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { GymDB } from '../db/db'
import { MEASUREMENT_FIELDS, MEASUREMENT_KEYS, outOfRange, pickMeasurement } from './bodyMeasurement'
import { getMeasurement, saveMeasurement, setBodyWeight } from './bodyWeight'
import { availableMetrics, measurementSeries } from './measurements'

let n = 0
const device = () => new GymDB(`bm-${n++}`, { indexedDB, IDBKeyRange })

// Datos SINTÉTICOS (inventados): no son de ninguna persona real.
const FULL = {
  weightKg: 80, bmi: 24.5, bodyFatPct: 20, musclePct: 60, leanMassKg: 64, subcutaneousFatPct: 16, visceralFat: 8,
  bodyWaterPct: 55, skeletalMusclePct: 45, muscleMassKg: 60, boneMassKg: 3.2, proteinPct: 17, bmr: 1700, bodyAge: 35,
}

describe('metadatos de los indicadores', () => {
  it('hay 14 indicadores, claves únicas y rangos coherentes', () => {
    expect(MEASUREMENT_FIELDS).toHaveLength(14)
    expect(new Set(MEASUREMENT_KEYS).size).toBe(14)
    for (const f of MEASUREMENT_FIELDS) expect(f.min).toBeLessThan(f.max)
    expect(outOfRange(FULL)).toEqual([])
  })
  it('pickMeasurement descarta null, undefined, texto y campos ajenos', () => {
    expect(pickMeasurement({ weightKg: 80, bmi: null, bodyFatPct: '20', foo: 1 } as never)).toEqual({ weightKg: 80 })
    expect(pickMeasurement(null)).toEqual({})
  })
})

describe('saveMeasurement', () => {
  it('guarda peso + los 13 indicadores en una sola fila por día', async () => {
    const d = device()
    const row = await saveMeasurement('2026-10-04', FULL, { time: '14:26', source: 'fitdays' }, d)
    expect(row).toMatchObject({ id: 'bw-2026-10-04', date: '2026-10-04', ...FULL, measuredAt: '14:26', source: 'fitdays', note: '' })
    expect(await d.bodyWeights.count()).toBe(1)
    expect(await d.outbox.count()).toBe(1)
  })

  it('merge (por defecto): el peso manual se conserva si la importación no lo trae, y viceversa', async () => {
    const d = device()
    await setBodyWeight('2026-10-04', 80.5, 'en ayunas', d)
    const { weightKg: _w, ...onlyComposition } = FULL
    const merged = await saveMeasurement('2026-10-04', onlyComposition, { time: '14:26', source: 'fitdays' }, d)
    expect(merged).toMatchObject({ weightKg: 80.5, note: 'en ayunas', bodyFatPct: 20, bmr: 1700, source: 'fitdays' })
    // Después un peso manual NO borra la composición del día.
    const edited = await setBodyWeight('2026-10-04', 79.9, undefined, d)
    expect(edited).toMatchObject({ weightKg: 79.9, bodyFatPct: 20, bmr: 1700, measuredAt: '14:26', note: 'en ayunas' })
    // Y una importación con peso y solo algunos indicadores complementa lo anterior.
    const more = await saveMeasurement('2026-10-04', { weightKg: 80, bmi: 24.6 }, {}, d)
    expect(more).toMatchObject({ weightKg: 80, bmi: 24.6, bodyFatPct: 20, measuredAt: '14:26' })
  })

  it('replace: la composición pasa a ser solo la nueva (los demás indicadores se quitan con null) pero peso y nota se conservan', async () => {
    const d = device()
    await saveMeasurement('2026-10-04', FULL, { note: 'nota' }, d)
    const r = await saveMeasurement('2026-10-04', { bmi: 25, bodyFatPct: 21 }, { mode: 'replace' }, d)
    expect(r).toMatchObject({ weightKg: 80, note: 'nota', bmi: 25, bodyFatPct: 21, bmr: null, muscleMassKg: null, bodyAge: null })
    expect(pickMeasurement(r as never)).toEqual({ weightKg: 80, bmi: 25, bodyFatPct: 21 }) // null = ausente para quien lee
  })

  it('valida rangos, hora, fecha y exige peso', async () => {
    const d = device()
    await expect(saveMeasurement('2026-10-04', { weightKg: 80, bodyFatPct: 90 }, {}, d)).rejects.toThrow(/Grasa corporal/)
    await expect(saveMeasurement('2026-10-04', { weightKg: 600 }, {}, d)).rejects.toThrow(RangeError)
    await expect(saveMeasurement('2026-10-04', { bmi: 25 }, {}, d)).rejects.toThrow(/peso/)
    await expect(saveMeasurement('2026-10-04', { weightKg: 80 }, { time: '25:61' }, d)).rejects.toThrow(/Hora/)
    await expect(saveMeasurement('2026-02-30', { weightKg: 80 }, {}, d)).rejects.toThrow(/Fecha/)
    expect(await d.bodyWeights.count()).toBe(0)
  })

  it('getMeasurement avisa de que ya existe una medición ese día (y no ve las borradas)', async () => {
    const d = device()
    expect(await getMeasurement('2026-10-04', d)).toBeUndefined()
    await saveMeasurement('2026-10-04', FULL, {}, d)
    expect(await getMeasurement('2026-10-04', d)).toMatchObject({ weightKg: 80 })
    const row = (await d.bodyWeights.get('bw-2026-10-04'))!
    await d.bodyWeights.put({ ...row, deletedAt: 5 })
    expect(await getMeasurement('2026-10-04', d)).toBeUndefined()
  })

  it('un día borrado se recupera al guardar sin arrastrar la composición vieja', async () => {
    const d = device()
    await saveMeasurement('2026-10-04', FULL, {}, d)
    const row = (await d.bodyWeights.get('bw-2026-10-04'))!
    await d.bodyWeights.put({ ...row, deletedAt: 5 })
    const again = await saveMeasurement('2026-10-04', { weightKg: 78 }, {}, d)
    expect(again).toMatchObject({ weightKg: 78, deletedAt: null })
    expect(again.bodyFatPct).toBeUndefined()
  })
})

describe('series para las gráficas', () => {
  it('solo incluye los días con dato del indicador y ordena por fecha', async () => {
    const d = device()
    await saveMeasurement('2026-10-02', { weightKg: 81, bodyFatPct: 21 }, {}, d)
    await saveMeasurement('2026-10-01', { weightKg: 82 }, {}, d)
    await saveMeasurement('2026-10-03', { weightKg: 80, bodyFatPct: 20 }, { mode: 'replace' }, d)
    const rows = await d.bodyWeights.toArray()
    expect(measurementSeries(rows, 'bodyFatPct')).toEqual([{ date: '2026-10-02', value: 21 }, { date: '2026-10-03', value: 20 }])
    expect(measurementSeries(rows, 'weightKg').map((p) => p.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
    expect(availableMetrics(rows)).toEqual(['weightKg', 'bodyFatPct'])
  })
})
