import { describe, expect, it } from 'vitest'
import type { BodyMeasurement } from './bodyMeasurement'
import { fieldsWithIssues, hasErrors, PLAUSIBLE, validate } from './measurementRules'

// Datos SINTÉTICOS (no corresponden a ninguna persona real), coherentes entre sí:
// peso 80, grasa 20 % → libre de grasa 64; hueso 3,2 → músculo 60,8 (76 % del peso); agua ≈ 0,73 × 80 % = 58;
// proteína = 80 − 58 − 4 = 18; IMC con 1,78 m = 25,25; BMR Katch-McArdle = 370 + 21,6 × 64 = 1752,4.
const OK: BodyMeasurement = {
  weightKg: 80,
  bmi: 25.3,
  bodyFatPct: 20,
  musclePct: 76,
  leanMassKg: 64,
  subcutaneousFatPct: 16.5,
  visceralFat: 8,
  bodyWaterPct: 58,
  skeletalMusclePct: 45,
  muscleMassKg: 60.8,
  boneMassKg: 3.2,
  proteinPct: 18,
  bmr: 1752,
  bodyAge: 35,
}
const issuesOf = (patch: Partial<BodyMeasurement>, ctx = {}) => validate({ ...OK, ...patch }, ctx)
const only = (patch: Partial<BodyMeasurement>, campo: string, ctx = {}) => issuesOf(patch, ctx).filter((i) => i.campo === campo)

describe('measurementRules.validate', () => {
  it('una medición coherente no da ningún problema (con y sin altura y edad)', () => {
    expect(validate(OK)).toEqual([])
    expect(validate(OK, { heightM: 1.78, age: 36 })).toEqual([])
  })

  it('todos los campos son opcionales: solo el peso, o nada', () => {
    expect(validate({ weightKg: 70 })).toEqual([])
    expect(validate({})).toEqual([])
    expect(validate({ bodyFatPct: 22 })).toEqual([])
  })

  it('cada indicador fuera de su rango plausible es un error con mensaje en español', () => {
    const bad: [keyof BodyMeasurement, number][] = [
      ['weightKg', 29], ['weightKg', 301], ['bmi', 9], ['bmi', 61], ['bodyFatPct', 2], ['bodyFatPct', 61],
      ['musclePct', 19], ['musclePct', 91], ['leanMassKg', 14], ['subcutaneousFatPct', 0.4], ['visceralFat', 0.5], ['visceralFat', 31],
      ['bodyWaterPct', 34], ['bodyWaterPct', 76], ['skeletalMusclePct', 19], ['skeletalMusclePct', 66], ['muscleMassKg', 9],
      ['boneMassKg', 0.9], ['boneMassKg', 6.1], ['proteinPct', 4], ['proteinPct', 31], ['bmr', 799], ['bmr', 4001], ['bodyAge', 9], ['bodyAge', 101],
    ]
    for (const [k, v] of bad) {
      const i = validate({ [k]: v }).filter((x) => x.campo === k)
      expect(i, `${k}=${v}`).toHaveLength(1)
      expect(i[0].nivel).toBe('error')
      expect(i[0].mensaje).toMatch(/fuera del rango plausible/)
    }
    // los límites exactos son válidos
    for (const k of Object.keys(PLAUSIBLE) as (keyof BodyMeasurement)[]) {
      const [lo, hi] = PLAUSIBLE[k]
      expect(validate({ [k]: lo }).filter((x) => x.campo === k && /rango/.test(x.mensaje))).toEqual([])
      expect(validate({ [k]: hi }).filter((x) => x.campo === k && /rango/.test(x.mensaje))).toEqual([])
    }
  })

  it('NaN, infinito y no numéricos son errores', () => {
    expect(validate({ weightKg: NaN })[0]).toMatchObject({ campo: 'weightKg', nivel: 'error' })
    expect(validate({ bmr: Infinity })[0]).toMatchObject({ campo: 'bmr', nivel: 'error' })
    expect(validate({ bodyAge: '35' as unknown as number })[0].mensaje).toMatch(/no es un número válido/)
  })

  it('masa libre de grasa ≈ peso × (1 − grasa): aviso y error por tramos', () => {
    expect(only({ leanMassKg: 64.8 }, 'leanMassKg')).toEqual([]) // dentro de la tolerancia
    expect(only({ leanMassKg: 66 }, 'leanMassKg')[0]?.nivel).toBe('aviso')
    expect(only({ leanMassKg: 72 }, 'leanMassKg')[0]?.nivel).toBe('error')
    expect(only({ leanMassKg: 72 }, 'leanMassKg')[0].mensaje).toMatch(/se esperaba ≈ 64,0 kg/)
  })

  it('masa libre de grasa no puede superar el peso', () => {
    const i = validate({ weightKg: 60, leanMassKg: 61 }).filter((x) => x.campo === 'leanMassKg')
    expect(i.some((x) => x.nivel === 'error' && /no puede superar el peso/.test(x.mensaje))).toBe(true)
  })

  it('masa muscular ≤ peso y ≤ libre de grasa; ≈ libre de grasa − hueso', () => {
    expect(only({ muscleMassKg: 85 }, 'muscleMassKg').some((x) => /superar el peso/.test(x.mensaje))).toBe(true)
    expect(only({ muscleMassKg: 66 }, 'muscleMassKg')[0]).toMatchObject({ nivel: 'error' })
    expect(only({ muscleMassKg: 66 }, 'muscleMassKg')[0].mensaje).toMatch(/masa libre de grasa/)
    expect(only({ muscleMassKg: 62.5 }, 'muscleMassKg')[0]?.nivel).toBe('aviso') // 1,7 kg de diferencia
    expect(only({ muscleMassKg: 61.5 }, 'muscleMassKg')).toEqual([])
  })

  it('frecuencia muscular % ≈ masa muscular / peso', () => {
    expect(only({ musclePct: 77.5 }, 'musclePct')).toEqual([])
    expect(only({ musclePct: 79 }, 'musclePct')[0]?.nivel).toBe('aviso')
    expect(only({ musclePct: 55 }, 'musclePct')[0]?.nivel).toBe('error')
  })

  it('músculo esquelético no supera la frecuencia muscular ni la masa muscular', () => {
    expect(only({ skeletalMusclePct: 60 }, 'skeletalMusclePct')).toEqual([])
    // por encima de la frecuencia muscular
    const a = only({ musclePct: 60, skeletalMusclePct: 62 }, 'skeletalMusclePct')
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ nivel: 'aviso' })
    expect(a[0].mensaje).toMatch(/frecuencia muscular/)
    // por encima de la masa muscular (65 % de 80 kg = 52 kg frente a 45 kg)
    const b = only({ muscleMassKg: 45, skeletalMusclePct: 65 }, 'skeletalMusclePct')
    expect(b.some((x) => x.nivel === 'aviso' && /supera la masa muscular/.test(x.mensaje))).toBe(true)
  })

  it('grasa subcutánea no puede superar la grasa total', () => {
    expect(only({ subcutaneousFatPct: 20.4 }, 'subcutaneousFatPct')).toEqual([]) // redondeo
    const i = only({ subcutaneousFatPct: 23 }, 'subcutaneousFatPct')
    expect(i[0]).toMatchObject({ nivel: 'error' })
    expect(i[0].mensaje).toMatch(/grasa corporal total/)
  })

  it('IMC con altura: ≈ peso/altura²', () => {
    expect(only({ bmi: 25.3 }, 'bmi', { heightM: 1.78 })).toEqual([])
    expect(only({ bmi: 26.1 }, 'bmi', { heightM: 1.78 })[0]?.nivel).toBe('aviso')
    expect(only({ bmi: 31 }, 'bmi', { heightM: 1.78 })[0]?.nivel).toBe('error')
    expect(only({ bmi: 25.3 }, 'bmi', { heightM: 3 })[0]?.nivel).toBe('aviso') // altura no plausible
  })

  it('IMC sin altura: la altura implícita debe ser humana', () => {
    expect(only({ bmi: 25.3 }, 'bmi')).toEqual([])
    expect(only({ bmi: 55 }, 'bmi')[0]?.nivel).toBe('aviso') // 1,21 m
    expect(only({ weightKg: 80, bmi: 10 }, 'bmi')[0]?.nivel).toBe('error') // 2,83 m
  })

  it('agua corporal: ≈ 73 % de la masa libre de grasa y nunca mayor que ella', () => {
    expect(only({ bodyWaterPct: 55 }, 'bodyWaterPct')).toEqual([])
    expect(only({ bodyWaterPct: 65 }, 'bodyWaterPct')[0]?.nivel).toBe('aviso')
    expect(only({ bodyWaterPct: 72 }, 'bodyWaterPct').some((x) => x.nivel === 'error')).toBe(true) // 72 % del peso, libre de grasa = 80 %
    expect(only({ bodyWaterPct: 40, leanMassKg: 64, bodyFatPct: 20 }, 'bodyWaterPct')[0]?.nivel).toBe('error') // muy baja
  })

  it('proteína % ≈ libre de grasa % − agua % − hueso %', () => {
    expect(only({ proteinPct: 19.5 }, 'proteinPct')).toEqual([])
    expect(only({ proteinPct: 22 }, 'proteinPct')[0]?.nivel).toBe('aviso')
    expect(only({ proteinPct: 28 }, 'proteinPct')[0]?.nivel).toBe('error')
  })

  it('BMR frente a Katch-McArdle: margen del 12 % (aviso) y 25 % (error)', () => {
    expect(only({ bmr: 1900 }, 'bmr')).toEqual([])
    const alto = only({ bmr: 2100 }, 'bmr')[0]
    expect(alto?.nivel).toBe('aviso')
    expect(alto.mensaje).toMatch(/alto/)
    expect(only({ bmr: 1400 }, 'bmr')[0]).toMatchObject({ nivel: 'aviso' })
    expect(only({ bmr: 2400 }, 'bmr')[0]).toMatchObject({ nivel: 'error' })
    expect(only({ bmr: 1200 }, 'bmr')[0]).toMatchObject({ nivel: 'error' })
  })

  it('edad corporal: aviso si se aleja más de 30 años de la real (solo con edad)', () => {
    expect(only({ bodyAge: 70 }, 'bodyAge')).toEqual([])
    expect(only({ bodyAge: 70 }, 'bodyAge', { age: 45 })).toEqual([]) // 25 años de diferencia
    expect(only({ bodyAge: 70 }, 'bodyAge', { age: 35 })[0]?.nivel).toBe('aviso') // 35 años de diferencia
  })

  it('un campo fuera de rango no dispara relaciones en cadena', () => {
    // peso 500 (error de rango): no se evalúan las reglas que lo usan
    const i = validate({ ...OK, weightKg: 500 })
    expect(i.filter((x) => x.campo === 'weightKg')).toHaveLength(1)
    expect(i.some((x) => x.campo === 'leanMassKg')).toBe(false)
  })

  it('helpers: hasErrors y fieldsWithIssues', () => {
    const i = validate({ ...OK, bmr: 1200, bodyAge: 101 })
    expect(hasErrors(i)).toBe(true)
    expect(fieldsWithIssues(i, 'error').sort()).toEqual(['bmr', 'bodyAge'])
    expect(hasErrors([])).toBe(false)
    expect(fieldsWithIssues(validate({ ...OK, bmr: 2100 }), 'aviso')).toEqual(['bmr'])
  })
})
