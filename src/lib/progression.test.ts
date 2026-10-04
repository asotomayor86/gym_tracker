import { describe, expect, it } from 'vitest'
import { suggestNext } from './progression'
import { roundTo } from './units'

const s = (effort: any, weightKg = 50, reps = 10) => ({ effort, weightKg, reps })

describe('suggestNext', () => {
  it('sin datos devuelve null', () => expect(suggestNext([])).toBeNull())
  it('todo fácil sube peso', () =>
    expect(suggestNext([s('easy_done'), s('easy_done')])?.weightKg).toBe(52.5))
  it('costó mantiene', () =>
    expect(suggestNext([s('easy_done'), s('hard_done')])?.weightKg).toBe(50))
  it('casi mantiene', () => expect(suggestNext([s('failed_close')])?.weightKg).toBe(50))
  it('fallo baja', () => expect(suggestNext([s('failed')])!.weightKg).toBeLessThan(50))
})

describe('roundTo', () => {
  it('redondea al paso más cercano (0,5 por defecto)', () => {
    expect(roundTo(52.3)).toBe(52.5)
    expect(roundTo(52.2)).toBe(52)
    expect(roundTo(52.3, 2.5)).toBe(52.5)
    expect(roundTo(0)).toBe(0)
  })
})
