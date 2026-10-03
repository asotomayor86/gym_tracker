import { describe, expect, it } from 'vitest'
import { GUIDES, findGuide } from './exerciseGuides'
import { SEED } from './seed'
import { MUSCLE_GROUPS } from './types'

describe('exerciseGuides', () => {
  it('hay una ficha por cada ejercicio del seed, y viceversa', () => {
    const seedNames = SEED.map(([n]) => n).sort()
    expect(GUIDES.map((x) => x.key).sort()).toEqual(seedNames)
  })

  it('findGuide ignora mayúsculas y tildes', () => {
    expect(findGuide('PRENSA DE PIERNAS')?.key).toBe('Prensa de piernas')
    expect(findGuide('curl de biceps en maquina')?.key).toBe('Curl de bíceps en máquina')
    expect(findGuide('no existe')).toBeUndefined()
  })

  it('cada ficha es coherente', () => {
    for (const x of GUIDES) {
      expect(x.primary.length, x.key).toBeGreaterThan(0)
      for (const m of [...x.primary, ...x.secondary]) expect(MUSCLE_GROUPS, x.key).toContain(m)
      expect(x.setup.length, x.key).toBeGreaterThan(0)
      expect(x.execution.length, x.key).toBeGreaterThan(0)
      expect(x.mistakes.length, x.key).toBeGreaterThan(0)
      expect(x.tips.length, x.key).toBeGreaterThan(0)
      for (const p of [x.diagram.from, x.diagram.to]) for (const v of p) expect(v >= 0 && v <= 1, x.key).toBe(true)
      expect(x.steps, x.key).toHaveLength(3)
      for (const t of x.steps ?? []) {
        const words = t.trim().split(/\s+/).length
        expect(words >= 2 && words <= 5, `${x.key}: "${t}"`).toBe(true)
      }
      for (const v of x.diagram.via ?? []) expect(v >= 0 && v <= 1, x.key).toBe(true)
      expect(x.diagram.from, x.key).not.toEqual(x.diagram.to)
      expect(x.diagram.backAngle >= 0 && x.diagram.backAngle <= 90, x.key).toBe(true)
    }
  })

  it('el grupo principal de la ficha coincide con el del seed', () => {
    for (const [name, primary] of SEED) expect(findGuide(name)?.primary, name).toContain(primary)
  })
})

// Espejo de las constantes de skeleton() en ExerciseDiagram.tsx: el punto que se anima (mano/pie)
// debe quedar dentro del alcance del brazo (51 px) o la pierna (78 px) sin hiperextender ni plegarse del todo.
type P = [number, number]
const FLOOR = 156, TORSO = 50
const rootOf = (pose: string, backAngle: number, leg: boolean): P => {
  const r = (backAngle * Math.PI) / 180
  const up: P = [-Math.sin(r), -Math.cos(r)]
  let hip: P, sh: P
  switch (pose) {
    case 'tumbado': hip = [92, 118]; sh = [hip[0] + up[0] * TORSO, hip[1] + up[1] * TORSO]; break
    case 'prono': hip = [100, 118]; sh = [hip[0] + TORSO, hip[1]]; break
    case 'de-pie': hip = [104, FLOOR - 77]; sh = [hip[0] + up[0] * TORSO, hip[1] + up[1] * TORSO]; break
    case 'colgado': sh = [108, 32]; hip = [108, 32 + TORSO]; break
    default: hip = [92, FLOOR - 36]; sh = [hip[0] + up[0] * TORSO, hip[1] + up[1] * TORSO]
  }
  return leg ? hip : sh
}

describe('alcance del rig', () => {
  it('from/via/to quedan dentro del alcance, sin estirar ni plegar del todo la extremidad', () => {
    for (const x of GUIDES) {
      const d = x.diagram
      const leg = d.limb === 'pierna'
      const root = rootOf(d.pose, d.backAngle, leg)
      const reach = leg ? 78 : 51
      const px = ([a, b]: P): P => [20 + a * 180, FLOOR - b * 150]
      const pts = [d.from, ...(d.via ? [d.via] : []), d.to].map((q) => px(q as P))
      for (const q of pts) {
        const ratio = Math.hypot(q[0] - root[0], q[1] - root[1]) / reach
        expect(ratio, `${x.key} (${ratio.toFixed(2)})`).toBeLessThanOrEqual(0.99)
        expect(ratio, `${x.key} (${ratio.toFixed(2)})`).toBeGreaterThanOrEqual(0.15)
      }
    }
  })
})

describe('codo alto', () => {
  it('laterales y pájaros llevan el codo arriba; face pull no (hombro imposible en vista lateral)', () => {
    for (const n of ['Elevaciones laterales en máquina', 'Elevaciones laterales en polea', 'Pájaros en peck deck (deltoides posterior)'])
      expect(findGuide(n)?.diagram.elbow, n).toBe('arriba')
    expect(findGuide('Face pull en polea')?.diagram.elbow).toBeUndefined()
    expect(findGuide('Curl de bíceps en polea')?.diagram.elbow).toBeUndefined()
    expect(findGuide('Face pull en polea')?.diagram.view).toBe('frontal')
    expect(findGuide('Jalón al pecho')?.diagram.view).toBeUndefined()
  })
})

describe('fases de carga y ritmo', () => {
  it('loadPhase es válido y solo bajar en sentadilla/hack es excéntrica en la ida', () => {
    for (const x of GUIDES) {
      expect(['ida', 'vuelta'], x.key).toContain(x.diagram.loadPhase)
      const squat = x.key === 'Hack squat' || x.key === 'Sentadilla en multipower'
      expect(x.diagram.loadPhase, x.key).toBe(squat ? 'vuelta' : 'ida')
    }
  })

  it('tempo: concéntrica 1-2,5 s y excéntrica 2-4 s (más lenta, nunca caída libre)', () => {
    for (const x of GUIDES) {
      expect(x.tempo, x.key).toBeDefined()
      const t = x.tempo!
      expect(t.concentricS >= 1 && t.concentricS <= 2.5, x.key).toBe(true)
      expect(t.eccentricS >= 2 && t.eccentricS <= 4, x.key).toBe(true)
      expect(t.eccentricS, x.key).toBeGreaterThan(t.concentricS)
      expect((t.pauseS ?? 0) <= 2, x.key).toBe(true)
      expect(x.tempoNote?.length, x.key).toBeGreaterThan(10)
    }
  })

  it('los isométricos no tienen fases ni ritmo', () => {
    for (const x of GUIDES.filter((g) => g.diagram.motion === 'isometrico')) {
      expect(x.tempo, x.key).toBeUndefined()
      expect(x.diagram.loadPhase, x.key).toBeUndefined()
    }
  })
})
