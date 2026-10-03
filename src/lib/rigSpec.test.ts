import { describe, expect, it } from 'vitest'
import { ARM_REACH_TOTAL, CANVAS, LEG_REACH_TOTAL, SEAT, SEG, basePose, standingHipY, toNorm, toPx } from './rigSpec'

describe('rigSpec', () => {
  it('mantiene las proporciones de la ficha antropométrica', () => {
    expect(ARM_REACH_TOTAL).toBe(53)
    expect(LEG_REACH_TOTAL).toBe(78)
    expect(SEG.thigh).toBe(SEG.shin)
    const heightPx = SEG.ankleHeight + LEG_REACH_TOTAL * 0.985 + SEG.torso + 29 // hasta el vértice
    expect(heightPx / SEG.head).toBeGreaterThan(7.2)
    expect(heightPx / SEG.head).toBeLessThan(8)
  })

  it('deja el muslo horizontal en el asiento y el humanoide dentro del lienzo', () => {
    expect(CANVAS.floor - SEAT.hipY).toBe(45)
    const stand = basePose('de-pie', 0)
    expect(stand.shoulder[1]).toBeGreaterThan(0)
    expect(stand.hip[1]).toBeCloseTo(standingHipY())
    expect(basePose('sentado-reclinado', 45).ankle[1]).toBe(CANVAS.floor - SEG.ankleHeight)
  })

  it('convierte px y coordenadas normalizadas sin pérdida', () => {
    const p: [number, number] = [0.5, 0.4]
    const back = toNorm(toPx(p))
    expect(back[0]).toBeCloseTo(p[0])
    expect(back[1]).toBeCloseTo(p[1])
  })
})
