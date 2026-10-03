import { describe, expect, it } from 'vitest'
import { GUIDES, findGuide } from './exerciseGuides'
import { SEED } from './seed'
import { MUSCLE_ID_GROUP, MUSCLE_IDS } from './guideTypes'
import { basePose, SEG, SPECIAL, toPx, type RigPose } from './rigSpec'
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

// Alcance y medidas: se leen de rigSpec.ts (las mismas constantes que usa el rig), sin copias.
const LEG = SEG.thigh + SEG.shin
const ARM = SEG.uarm + SEG.farm
const rootOf = (pose: RigPose, backAngle: number, leg: boolean): [number, number] => {
  const b = basePose(pose, backAngle)
  return leg ? b.hip : b.shoulder
}

describe('alcance del rig', () => {
  it('from/via/to quedan dentro del alcance, sin estirar ni plegar del todo la extremidad', () => {
    for (const x of GUIDES) {
      const d = x.diagram
      if (d.pose === 'colgado') continue // el rig mueve el cuerpo y coloca las manos con from/to absolutos (ver test siguiente)
      const leg = d.limb === 'pierna'
      const calf = leg && d.motion === 'elevacion'
      const root = rootOf(d.pose, d.backAngle, leg)
      const reach = leg ? LEG : ARM
      const pts = [d.from, ...(d.via ? [d.via] : []), d.to].map((q) => toPx(q))
      for (const q of pts) {
        const ratio = Math.hypot(q[0] - root[0], q[1] - root[1]) / reach
        // el rig recorta a REACH.*; el gemelo en prensa parte de la pierna recta (solo su dirección cuenta)
        expect(ratio, `${x.key} (${ratio.toFixed(2)})`).toBeLessThanOrEqual(calf ? 1.01 : 1.0)
        expect(ratio, `${x.key} (${ratio.toFixed(2)})`).toBeGreaterThanOrEqual(0.15)
      }
    }
  })

  it('colgado: las manos fijas dejan la cabeza dentro del lienzo y el brazo casi estirado', () => {
    const { rise, pullStart, dipStart } = SPECIAL.colgado
    const headTop = (shoulderY: number) => shoulderY - SEG.neckVisible - SEG.head
    for (const key of ['Fondos asistidos en máquina', 'Dominadas asistidas en máquina']) {
      const d = findGuide(key)!.diagram
      const A = toPx(d.from), B = toPx(d.to)
      const pull = d.motion === 'tiron'
      const hy = pull ? Math.min(A[1], B[1]) : Math.max(A[1], B[1])
      const top = pull ? hy + pullStart - rise : hy + dipStart - rise // hombro en el punto más alto
      expect(headTop(top), `${key}: cabeza`).toBeGreaterThanOrEqual(0)
      // distancia hombro-manos en el punto más estirado: dentro del alcance del brazo (+ 3 px de tolerancia)
      const far = pull ? hy + pullStart : hy - dipStart
      const stretch = pull ? far - hy : hy - (hy + dipStart - rise)
      expect(stretch, `${key}: brazo`).toBeLessThanOrEqual(ARM + 3)
    }
  })
})

describe('gemelos', () => {
  it('en prensa la pierna parte casi recta y solo se mueve el tobillo', () => {
    const g = findGuide('Elevación de gemelos en prensa')!
    const hip = basePose('sentado-reclinado', 45).hip
    const [fx, fy] = toPx(g.diagram.from)
    expect(Math.hypot(fx - hip[0], fy - hip[1]) / LEG).toBeGreaterThanOrEqual(0.99)
    expect(g.execution.join(' ')).toMatch(/solo los tobillos/)
    expect(g.steps?.[1]).toBe('Extiende los tobillos')
  })

  it('sentado parte con la rodilla a ~90° (muslo horizontal, pierna vertical)', () => {
    const g = findGuide('Elevación de gemelos sentado')!
    const hip = basePose('sentado', 10).hip
    const [fx] = toPx(g.diagram.from)
    expect(Math.abs(fx - (hip[0] + SEG.thigh))).toBeLessThanOrEqual(3)
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

describe('muscleIds', () => {
  it('cada ficha tiene ids válidos, coherentes con sus grupos', () => {
    for (const x of GUIDES) {
      expect(x.muscleIds, x.key).toBeDefined()
      const { primary, secondary } = x.muscleIds!
      expect(primary.length, x.key).toBeGreaterThan(0)
      for (const id of [...primary, ...secondary]) expect(MUSCLE_IDS, `${x.key}: ${id}`).toContain(id)
      expect(new Set([...primary, ...secondary]).size, `${x.key}: ids repetidos`).toBe(primary.length + secondary.length)
      const groups = new Set([...x.primary, ...x.secondary])
      // los ids principales pertenecen a algún grupo de la ficha, y al menos uno al principal
      for (const id of primary) {
        const g = MUSCLE_ID_GROUP[id]
        if (g) expect(groups.has(g), `${x.key}: ${id} → ${g}`).toBe(true)
      }
      expect(primary.some((id) => x.primary.includes(MUSCLE_ID_GROUP[id]!)), x.key).toBe(true)
      // todo grupo principal de la ficha queda representado
      for (const g of x.primary) {
        expect([...primary, ...secondary].some((id) => MUSCLE_ID_GROUP[id] === g), `${x.key}: ${g}`).toBe(true)
      }
    }
  })

  it('gemelos: sentado = sóleo principal, prensa = gastrocnemio principal', () => {
    expect(findGuide('Elevación de gemelos sentado')?.muscleIds?.primary).toEqual(['soleus'])
    expect(findGuide('Elevación de gemelos en prensa')?.muscleIds?.primary).toEqual(['gastroc', 'gastrocM'])
  })
})
