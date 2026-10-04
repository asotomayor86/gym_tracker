/**
 * Regresión anatómica PERMANENTE de los esquemas animados: para cada ficha se muestrea el ciclo completo
 * (120 fotogramas: ida y vuelta) con `poseAt` (la MISMA función pura que usa ExerciseDiagram para dibujar) y se exige:
 *  a) rodilla: solo flexiona (hacia atrás), sin hiperextensión > 5° y ≤ 140°;
 *  b) codo: solo flexiona (hacia delante), sin hiperextensión > 5° y ≤ 150°;
 *  c) hombro −60…180° y cadera −20…120°;
 *  d) tobillo (plantarflexión) ≤ 50°;
 *  e) CONTINUIDAD: sin cambios bruscos entre fotogramas (detecta inversiones del IK, como la rodilla de los gemelos);
 *  f) nada bajo el suelo, cabeza dentro del lienzo, manos en la barra cuando el cuerpo cuelga;
 *  g) los ángulos que calcula este test A PARTIR DE LAS POSICIONES coinciden con los `joints` que devuelve poseAt
 *     (doble comprobación independiente: si el rig cambiara su convención de signos, se vería aquí).
 * Los mensajes dicen ficha, articulación y fotograma.
 */
import { describe, expect, it } from 'vitest'
import { dist, jointViolations, type P, poseAt, type RigPose } from '../components/android/geom'
import { GUIDES } from './exerciseGuides'
import { SEED } from './seed'
import type { MovementDiagram } from './guideTypes'
import { CANVAS, SPECIAL, toPx } from './rigSpec'

const FLOOR = CANVAS.floor
const N = 60 // fotogramas por mitad (ida y vuelta → 120)

// ── ángulos con signo calculados desde las posiciones (positivo = sentido anatómico normal; el humanoide mira a +x) ──
const deg = (rad: number) => (rad * 180) / Math.PI
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]]
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0]
const dotp = (a: P, b: P) => a[0] * b[0] + a[1] * b[1]
const unit = (v: P): P => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l] }
/** Rodilla: flexión positiva (la pierna se dobla hacia atrás). */
const kneeFlex = (q: RigPose) => { const t = sub(q.knee, q.hip), sh = sub(q.ankle, q.knee); return deg(Math.atan2(cross(t, sh), dotp(t, sh))) }
/** Codo: flexión positiva (el antebrazo se dobla hacia delante). */
const elbowFlex = (q: RigPose) => { const u = sub(q.elbow, q.shoulder), f = sub(q.wrist, q.elbow); return -deg(Math.atan2(cross(u, f), dotp(u, f))) }
/** Hombro/cadera: ángulo respecto al eje "hacia abajo" del tronco, positivo hacia delante (brazo por encima de la cabeza sigue por encima de 180°). */
const swing = (down: P, v: P) => {
  const a = -deg(Math.atan2(cross(unit(down), unit(v)), dotp(unit(down), unit(v))))
  return a < -120 ? a + 360 : a
}
// el eje del tronco se toma de la geometría (cadera→hombro), no de q.torsoUp, que se comprueba aparte
const torsoDownOf = (q: RigPose): P => sub(q.hip, q.shoulder)
const shoulderAngle = (q: RigPose) => swing(torsoDownOf(q), sub(q.elbow, q.shoulder))
const hipAngle = (q: RigPose) => swing(torsoDownOf(q), sub(q.knee, q.hip))

const frames = (): { p: number; label: string }[] =>
  Array.from({ length: 2 * N }, (_, k) => (k < N ? { p: k / N, label: `ida ${k}` } : { p: 1 - (k - N) / N, label: `vuelta ${k - N}` }))

interface Issue { ficha: string; articulacion: string; fotograma: string; detalle: string }
/** Mutación de la pose, solo para las pruebas de sensibilidad. */
type Mutate = (q: RigPose, p: number, label: string) => RigPose

function checkCycle(d: MovementDiagram, ficha: string, mutate?: Mutate): Issue[] {
  const issues: Issue[] = []
  const bad = (articulacion: string, fotograma: string, detalle: string) => { if (issues.length < 6) issues.push({ ficha, articulacion, fotograma, detalle }) }
  const leg = d.limb === 'pierna'
  const frontalLeg = leg && (d.pose === 'sentado' || d.pose === 'sentado-reclinado') && Math.abs(toPx(d.to)[1] - toPx(d.from)[1]) < 2 && Math.abs(toPx(d.to)[0] - toPx(d.from)[0]) > 3
  let prev: { f: string; q: RigPose; knee: number; elbow: number; sh: number; hip: number } | null = null
  for (const { p, label } of frames()) {
    const raw = poseAt(d, p)
    const q = mutate ? mutate(raw, p, label) : raw
    const knee = kneeFlex(q), elbow = elbowFlex(q), sh = shoulderAngle(q), hip = hipAngle(q)
    const f = `${label} (p=${p.toFixed(2)})`
    // g) coherencia con los ángulos que declara el rig (solo sin mutar)
    if (!mutate && q.plane === 'lateral') {
      const j = q.joints
      const unwrap = (a: number) => (a < -120 ? a + 360 : a)
      if (!frontalLeg && Math.abs(j.knee.deg - knee) > 0.6) bad('rodilla', f, `el rig dice ${j.knee.deg.toFixed(1)}° y la geometría ${knee.toFixed(1)}° (convención de signos distinta)`)
      if (Math.abs(j.elbow.deg - elbow) > 0.6) bad('codo', f, `el rig dice ${j.elbow.deg.toFixed(1)}° y la geometría ${elbow.toFixed(1)}°`)
      if (Math.abs(unwrap(j.hip.deg) - hip) > 0.6) bad('cadera', f, `el rig dice ${j.hip.deg.toFixed(1)}° y la geometría ${hip.toFixed(1)}°`)
      if (Math.abs(unwrap(j.shoulder.deg) - sh) > 0.6) bad('hombro', f, `el rig dice ${j.shoulder.deg.toFixed(1)}° y la geometría ${sh.toFixed(1)}°`)
    }
    // a) rodilla
    if (!frontalLeg) {
      if (knee < -5) bad('rodilla', f, `hiperextensión/inversión: ${knee.toFixed(1)}° (mín −5°)`)
      if (knee > 140) bad('rodilla', f, `flexión excesiva: ${knee.toFixed(1)}° (máx 140°)`)
    }
    // b) codo (en vista frontal solo se comprueba el giro del antebrazo)
    if (q.plane === 'lateral') {
      if (elbow < -5) bad('codo', f, `hiperextensión/inversión: ${elbow.toFixed(1)}° (mín −5°)`)
      if (elbow > 150) bad('codo', f, `flexión excesiva: ${elbow.toFixed(1)}° (máx 150°)`)
      // c) hombro
      if (sh < -60 || sh > 180) bad('hombro', f, `${sh.toFixed(1)}° fuera de −60…180°`)
    } else if (q.frontalElbowDeg !== undefined && Math.abs(q.frontalElbowDeg) > 150) {
      bad('codo (frontal)', f, `giro del antebrazo ${q.frontalElbowDeg.toFixed(1)}° (máx 150°)`)
    }
    if (!frontalLeg && (hip < -20 || hip > 120)) bad('cadera', f, `${hip.toFixed(1)}° fuera de −20…120°`)
    // d) tobillo
    if (q.plantarDeg > 50) bad('tobillo', f, `plantarflexión ${q.plantarDeg.toFixed(1)}° (máx 50°)`)
    // f) suelo, cabeza, manos en agarre
    for (const [name, pt] of [['mano', q.wrist], ['pie', q.ankle], ['codo', q.elbow], ['rodilla', q.knee]] as const) {
      if (pt[1] > FLOOR + 0.5) bad(name, f, `bajo el suelo: y=${pt[1].toFixed(1)} (suelo ${FLOOR})`)
    }
    if (q.headTop < 0) bad('cabeza', f, `fuera del lienzo: y=${q.headTop.toFixed(1)}`)
    if (q.target && dist(q.wrist, q.target) > 2) bad('mano', f, `a ${dist(q.wrist, q.target).toFixed(1)} px de la barra`)
    // e) continuidad con el fotograma anterior
    if (prev) {
      const step = (name: string, a: number, b: number, max: number) => {
        if (Math.abs(a - b) > max) bad(name, f, `salto de ${(b - a).toFixed(1)}° respecto a ${prev!.f} (máx ${max}°/fotograma)`)
        if (Math.sign(a) !== Math.sign(b) && Math.abs(a) > 8 && Math.abs(b) > 8) bad(name, f, `cambio de signo ${a.toFixed(1)}° → ${b.toFixed(1)}° (inversión)`)
      }
      if (!frontalLeg) step('rodilla', prev.knee, knee, 8)
      if (q.plane === 'lateral') { step('codo', prev.elbow, elbow, 8); step('hombro', prev.sh, sh, 8) }
      step('cadera', prev.hip, hip, 8)
      // en vista frontal el brazo se dibuja con otra construcción: el IK lateral del brazo no se usa
      const joints: [string, P, P][] = [['rodilla (posición)', prev.q.knee, q.knee]]
      if (q.plane === 'lateral') joints.push(['codo (posición)', prev.q.elbow, q.elbow])
      for (const [name, a, b] of joints) {
        if (dist(a, b) > 6) bad(name, f, `salta ${dist(a, b).toFixed(1)} px entre fotogramas`)
      }
    }
    prev = { f, q, knee, elbow, sh, hip }
  }
  return issues
}

const fmt = (issues: Issue[]) => issues.map((i) => `${i.ficha} · ${i.articulacion} · fotograma ${i.fotograma}: ${i.detalle}`).join('\n')

/** Refleja la rodilla respecto al eje cadera→tobillo: la pierna se dobla hacia el lado contrario (el bug de los gemelos en prensa). */
const mirrorKnee = (q: RigPose): RigPose => {
  const ax = sub(q.ankle, q.hip), l2 = dotp(ax, ax) || 1
  const m = sub(q.knee, q.hip), t = dotp(m, ax) / l2
  const foot: P = [ax[0] * t, ax[1] * t]
  return { ...q, knee: [q.hip[0] + 2 * foot[0] - m[0], q.hip[1] + 2 * foot[1] - m[1]] }
}

describe('anatomía del ciclo completo (120 fotogramas por ficha)', () => {
  it('todas las fichas respetan rangos, sentido de giro y continuidad', () => {
    const all = GUIDES.flatMap((g) => checkCycle(g.diagram, g.key))
    expect(all.length, '\n' + fmt(all)).toBe(0)
  })

  it('torsoUp apunta de la cadera al hombro en todas las poses (la cabeza se dibuja a lo largo de torsoUp)', () => {
    const bad: string[] = []
    for (const g of GUIDES) {
      for (const p of [0, 0.5, 1]) {
        const q = poseAt(g.diagram, p)
        const geo = unit(sub(q.shoulder, q.hip)), up = unit(q.torsoUp)
        if (dotp(geo, up) < 0.98) bad.push(`${g.key} · pose ${g.diagram.pose} · p=${p}: torsoUp=(${up[0].toFixed(2)}, ${up[1].toFixed(2)}) pero hombro−cadera=(${geo[0].toFixed(2)}, ${geo[1].toFixed(2)})`)
      }
    }
    expect(bad.length, String.fromCharCode(10) + bad.join(String.fromCharCode(10))).toBe(0)
  })

  it('cubre todas las fichas del catálogo con 120 fotogramas cada una', () => {
    expect(GUIDES.length).toBe(SEED.length)
    expect(frames().length).toBe(120)
  })

  it('jointViolations del rig tampoco encuentra nada (rangos, hiperextensión y saltos)', () => {
    const all = GUIDES.flatMap((g) => jointViolations(g.diagram).map((v) => `${g.key} · ${v.joint} · p=${v.p.toFixed(2)}: ${v.deg.toFixed(1)}° (${v.reason})`))
    expect(all.length, '\n' + all.join('\n')).toBe(0)
  })

  it('el pie de los gemelos gira como máximo SPECIAL.calf.maxPlantarflexionDeg y la rodilla no se mueve', () => {
    for (const key of ['Elevación de gemelos en prensa', 'Elevación de gemelos sentado']) {
      const d = GUIDES.find((g) => g.key === key)!.diagram
      const k0 = kneeFlex(poseAt(d, 0)), k1 = kneeFlex(poseAt(d, 1))
      expect(Math.abs(k1 - k0), `${key}: la rodilla cambia ${(k1 - k0).toFixed(1)}°`).toBeLessThan(1)
      expect(poseAt(d, 1).plantarDeg).toBeLessThanOrEqual(SPECIAL.calf.maxPlantarflexionDeg)
    }
  })

  // Prueba de sensibilidad: si la rodilla se doblara al lado contrario (el bug de los gemelos en prensa),
  // el test debe fallar. Si esto deja de detectarse, el test ya no protege nada.
  it('detecta una rodilla invertida (sensibilidad)', () => {
    for (const key of ['Elevación de gemelos en prensa', 'Prensa de piernas', 'Extensión de cuádriceps', 'Hack squat']) {
      const g = GUIDES.find((x) => x.key === key)!
      const issues = checkCycle(g.diagram, g.key, (q) => mirrorKnee(q))
      expect(issues.some((i) => i.articulacion.startsWith('rodilla')), `${key}: no detectó la rodilla invertida`).toBe(true)
    }
  })

  it('detecta un salto brusco del IK a mitad de ciclo (sensibilidad)', () => {
    const g = GUIDES.find((x) => x.key === 'Extensión de cuádriceps')!
    const issues = checkCycle(g.diagram, g.key, (q, p) => (p > 0.5 ? mirrorKnee(q) : q))
    expect(issues.length).toBeGreaterThan(0)
  })

  it('detecta un codo hiperextendido o invertido (sensibilidad)', () => {
    const g = GUIDES.find((x) => x.key === 'Press de pecho en máquina')!
    const flip = (q: RigPose): RigPose => {
      const ax = sub(q.wrist, q.shoulder), l2 = dotp(ax, ax) || 1
      const m = sub(q.elbow, q.shoulder), t = dotp(m, ax) / l2
      const foot: P = [ax[0] * t, ax[1] * t]
      return { ...q, elbow: [q.shoulder[0] + 2 * foot[0] - m[0], q.shoulder[1] + 2 * foot[1] - m[1]] }
    }
    expect(checkCycle(g.diagram, g.key, flip).some((i) => i.articulacion.startsWith('codo'))).toBe(true)
  })
})
