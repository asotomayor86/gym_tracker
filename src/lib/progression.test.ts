import { describe, expect, it } from 'vitest'
import { suggestNext } from './progression'
import { kgToLb, lbToKg } from './units'

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

describe('units', () => {
  it('ida y vuelta', () => expect(lbToKg(kgToLb(80))).toBeCloseTo(80))
})
