import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { GymDB } from '../db/db'
import {
  bodyWeightRange, liveBodyWeights, movingAverage, removeBodyWeight, setBodyWeight, todayLocal, weightTrend,
} from './bodyWeight'

let n = 0
const device = () => new GymDB(`bw-${n++}`, { indexedDB, IDBKeyRange })

describe('guardado del peso', () => {
  it('un registro por día: guardar de nuevo edita el mismo (id determinista) y encola una sola entrada', async () => {
    const d = device()
    await setBodyWeight('2026-10-04', 80.5, 'en ayunas', d)
    await setBodyWeight('2026-10-04', 80.2, undefined, d) // sin nota: conserva la anterior
    const rows = await d.bodyWeights.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'bw-2026-10-04', date: '2026-10-04', weightKg: 80.2, note: 'en ayunas' })
    expect(await d.outbox.count()).toBe(1)
    await setBodyWeight('2026-10-04', 80.2, '', d) // nota vacía explícita la borra
    expect((await d.bodyWeights.get('bw-2026-10-04'))!.note).toBe('')
  })

  it('valida el rango (20–400 kg) y la fecha', async () => {
    const d = device()
    for (const kg of [19.9, 400.1, NaN, Infinity]) await expect(setBodyWeight('2026-10-04', kg, '', d)).rejects.toThrow(RangeError)
    for (const date of ['2026-13-01', '2026-02-30', 'hoy', '2026-1-1']) await expect(setBodyWeight(date, 80, '', d)).rejects.toThrow(RangeError)
    expect(await d.bodyWeights.count()).toBe(0)
  })

  it('borrado lógico, y volver a guardar el día lo recupera sin conservar la nota vieja', async () => {
    const d = device()
    await setBodyWeight('2026-10-04', 80, 'a', d)
    await removeBodyWeight('2026-10-04', d)
    expect(await liveBodyWeights(d)).toEqual([])
    expect((await d.bodyWeights.get('bw-2026-10-04'))!.deletedAt).toBeTruthy()
    const back = await setBodyWeight('2026-10-04', 79, undefined, d)
    expect(back).toMatchObject({ deletedAt: null, note: '' })
    expect(await liveBodyWeights(d)).toHaveLength(1)
  })

  it('liveBodyWeights devuelve los registros por fecha ascendente', async () => {
    const d = device()
    for (const day of ['2026-10-03', '2026-10-01', '2026-10-02']) await setBodyWeight(day, 80, '', d)
    expect((await liveBodyWeights(d)).map((r) => r.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
  })

  it('todayLocal usa la fecha local', () => {
    expect(todayLocal(new Date(2026, 9, 4, 23, 59))).toBe('2026-10-04')
    expect(todayLocal(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })
})

describe('movingAverage', () => {
  const p = (date: string, weightKg: number) => ({ date, weightKg })

  it('promedia los últimos 7 días naturales y solo cuenta los días con registro', () => {
    const avg = movingAverage([p('2026-10-01', 80), p('2026-10-02', 82), p('2026-10-10', 78)], 7)
    expect(avg).toEqual([
      { date: '2026-10-01', avg: 80 },
      { date: '2026-10-02', avg: 81 },
      { date: '2026-10-10', avg: 78 }, // 10-01 y 10-02 quedan fuera de la ventana de 7 días
    ])
  })

  it('la ventana incluye el día actual y los 6 anteriores (no 7 anteriores)', () => {
    const avg = movingAverage([p('2026-10-01', 70), p('2026-10-07', 80), p('2026-10-08', 90)], 7)
    expect(avg[1].avg).toBe(75) // 01..07: entra el 01
    expect(avg[2].avg).toBe(85) // 02..08: ya no entra el 01
  })

  it('no depende del orden de entrada y es estable con un solo punto', () => {
    expect(movingAverage([p('2026-10-02', 82), p('2026-10-01', 80)]).map((a) => a.date)).toEqual(['2026-10-01', '2026-10-02'])
    expect(movingAverage([p('2026-10-01', 80)])).toEqual([{ date: '2026-10-01', avg: 80 }])
    expect(movingAverage([])).toEqual([])
  })

  it('cruza el cambio de hora y de mes sin errores de un día', () => {
    const avg = movingAverage([p('2026-03-28', 80), p('2026-03-29', 80), p('2026-04-03', 86)], 7)
    expect(avg[2].avg).toBeCloseTo(82, 5) // 28/03, 29/03 y 03/04 caen en 7 días naturales
  })
})

describe('weightTrend y rango', () => {
  const p = (date: string, weightKg: number) => ({ date, weightKg })

  it('pendiente por regresión: 0,1 kg/día = 0,7 kg/semana', () => {
    const points = Array.from({ length: 11 }, (_, i) => p(`2026-10-${String(i + 1).padStart(2, '0')}`, 80 - i * 0.1))
    expect(weightTrend(points)).toEqual({ deltaKg: -1, perWeekKg: -0.7 })
  })

  it('solo mira los últimos `days` días y devuelve null sin datos suficientes', () => {
    expect(weightTrend([p('2026-10-01', 80)])).toBeNull()
    expect(weightTrend([p('2026-10-01', 80), p('2026-10-01', 81)])).toBeNull()
    expect(weightTrend([p('2026-08-01', 100), p('2026-10-01', 80), p('2026-10-08', 80)], 30)).toEqual({ deltaKg: 0, perWeekKg: 0 })
    expect(weightTrend([p('2026-08-01', 100), p('2026-10-08', 80)], 30)).toBeNull()
  })

  it('bodyWeightRange: mínimo, máximo, primero y último', () => {
    expect(bodyWeightRange([])).toBeNull()
    const r = bodyWeightRange([p('2026-10-03', 79), p('2026-10-01', 82), p('2026-10-02', 80)])!
    expect(r).toMatchObject({ min: 79, max: 82, minDate: '2026-10-03', maxDate: '2026-10-01', first: { date: '2026-10-01' }, last: { date: '2026-10-03' } })
  })
})
