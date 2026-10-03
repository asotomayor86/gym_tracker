/**
 * Especificación compartida del rig del humanoide (esquemas de ejercicio).
 * Solo constantes y posiciones base por pose: la usan el rig (ExerciseDiagram), los datos de las fichas
 * (exerciseGuides) y el test de alcance, para que todos trabajen con los mismos números.
 *
 * Fisionomía: androide atlético de ~6,4 cabezas, H ≈ 160 px, medido sobre la imagen de referencia (cadera al 53 %,
 * rodilla al 28 %, tobillo al 4 % de la altura; torso corto, piernas largas). Coordenadas SVG: x hacia delante, y hacia abajo; el humanoide mira hacia +x.
 * El lienzo pasa de 220×170 (suelo en y = 156) a 220×179 (suelo en y = 168).
 */

export const CANVAS = { w: 220, h: 179, floor: 168 } as const

/** Longitudes de segmento, articulación a articulación, en px. */
export const SEG = {
  head: 25, // vértice–punta de la máscara (≈6,4 cabezas por altura, como la figura de referencia)
  neckVisible: 9, // hombro–punta de la máscara
  torso: 43, // hombro–cadera (≈0,27 H)
  uarm: 26, // hombro–codo
  farm: 22, // codo–muñeca
  hand: 15, // muñeca–dedos
  thigh: 39, // cadera–rodilla
  shin: 39, // rodilla–tobillo
  footLength: 22, // talón–puntera
  ankleToToe: 17,
  ankleHeight: 6, // eje del tobillo sobre el suelo
} as const

export const ARM_REACH_TOTAL = SEG.uarm + SEG.farm // 53
export const LEG_REACH_TOTAL = SEG.thigh + SEG.shin // 78

/** Fracción máxima de la longitud total que alcanza cada miembro (deja siempre flexión mínima de codo/rodilla). */
export const REACH = { arm: 0.98, leg: 0.985, legStanding: 0.995, legRigid: 0.998 } as const

/** Mapeo de coordenadas normalizadas de las fichas (x 0..1 atrás→delante, y 0..1 abajo→arriba) a px del lienzo. */
export const MAP = { bx: 20, bw: 180, by: 6, bh: CANVAS.floor - 6 } as const
export const toPx = ([x, y]: [number, number]): [number, number] => [MAP.bx + x * MAP.bw, CANVAS.floor - y * MAP.bh]
export const toNorm = ([px, py]: [number, number]): [number, number] => [(px - MAP.bx) / MAP.bw, (CANVAS.floor - py) / MAP.bh]

/** Alturas base. El asiento deja el muslo horizontal: cadera = suelo − tobillo − pierna. */
export const SEAT = { hipY: CANVAS.floor - SEG.ankleHeight - SEG.shin, hipX: 92 } as const // y = 120 (45 px sobre el suelo)
export const STANDING = { x: 104, ankleY: CANVAS.floor - SEG.ankleHeight } as const
export const standingHipY = (): number => STANDING.ankleY - LEG_REACH_TOTAL * REACH.legStanding

/** Posición base de cadera, hombro y tobillo por postura (px). backAngle: 0 = respaldo vertical, 90 = horizontal. */
export type RigPose = 'de-pie' | 'sentado' | 'sentado-reclinado' | 'tumbado' | 'prono' | 'colgado'
export function basePose(pose: RigPose, backAngle: number): { hip: [number, number]; shoulder: [number, number]; ankle: [number, number] } {
  const r = (backAngle * Math.PI) / 180
  const up: [number, number] = [-Math.sin(r), -Math.cos(r)]
  const lift = (hip: [number, number]): [number, number] => [hip[0] + up[0] * SEG.torso, hip[1] + up[1] * SEG.torso]
  switch (pose) {
    case 'de-pie': {
      const hip: [number, number] = [STANDING.x, standingHipY()]
      return { hip, shoulder: lift(hip), ankle: [STANDING.x, STANDING.ankleY] }
    }
    case 'tumbado': {
      const hip: [number, number] = [SEAT.hipX, SEAT.hipY]
      return { hip, shoulder: lift(hip), ankle: [hip[0] + 46, STANDING.ankleY] }
    }
    case 'prono': {
      const hip: [number, number] = [100, SEAT.hipY]
      return { hip, shoulder: [hip[0] + SEG.torso, hip[1]], ankle: [hip[0] - SEG.thigh - SEG.shin, hip[1]] }
    }
    case 'colgado': {
      const shoulder: [number, number] = [108, 36]
      const hip: [number, number] = [shoulder[0], shoulder[1] + SEG.torso]
      return { hip, shoulder, ankle: [hip[0] - 10, Math.min(hip[1] + 34, STANDING.ankleY - 4)] }
    }
    default: {
      // sentado / sentado-reclinado
      const hip: [number, number] = [SEAT.hipX, SEAT.hipY]
      return { hip, shoulder: lift(hip), ankle: [hip[0] + SEG.thigh - 3, STANDING.ankleY] }
    }
  }
}

/** Reglas especiales del rig. */
export const SPECIAL = {
  /** Brazo que no trabaja (ejercicios de pierna): objetivo relativo al hombro. */
  staticArm: { default: [14, 40], prono: [10, 14], squat: [4, -4] },
  /** Colgado: recorrido vertical del cuerpo y separación del hombro respecto a las manos. */
  colgado: { rise: 28, pullStart: 44, dipStart: -16 },
  /** Gemelos: plantarflexión máxima y radio del pedal. */
  calf: { maxPlantarflexionDeg: 40, toeLength: SEG.ankleToToe },
  /** Sentadilla: la cadera baja lo que sube el pie en el recorrido relativo from→to. */
  squat: { hipDropsByFootRise: true },
} as const

/** Androide (vistas frontal/posterior): semiancho entre ejes de hombro, cuello visible y centro de la cabeza sobre el hombro. */
export const ANDROID = { shoulderHalf: 21, neck: 9, headCenter: 21.5 } as const
