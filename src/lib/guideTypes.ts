import type { MuscleGroup } from './types'

/**
 * CONTRATO de la guía visual de ejercicios.
 * - Contenido (src/lib/exerciseGuides.ts) lo rellena la sesión de ejercicios (e6).
 * - Gráficos (src/components/BodyMap.tsx, ExerciseDiagram.tsx, ExerciseGuideView.tsx) los dibuja la sesión de diseño (4f).
 * Cambios en este archivo: solo ADITIVOS (añadir valores a las uniones o campos opcionales) y avisando a la otra sesión.
 */

export type ExerciseCategory = 'empuje' | 'tiron' | 'pierna' | 'aislamiento' | 'core'
export type Difficulty = 1 | 2 | 3
export type Pose = 'sentado' | 'sentado-reclinado' | 'tumbado' | 'de-pie' | 'prono' | 'colgado'
export type Implement = 'maquina' | 'polea' | 'multipower' | 'peso-corporal'
export type MotionKind =
  | 'empuje' | 'tiron' | 'curl' | 'extension' | 'apertura'
  | 'elevacion' | 'flexion' | 'sentadilla' | 'bisagra' | 'isometrico'

/** Punto en coordenadas normalizadas del cuerpo en vista lateral: x 0..1 (atrás→adelante), y 0..1 (abajo→arriba). */
export type Point = [x: number, y: number]

/** Datos mínimos para dibujar el esquema postura + recorrido. 4f decide cómo se pinta. */
export interface MovementDiagram {
  pose: Pose
  /** Inclinación del respaldo en grados: 0 = vertical, 90 = horizontal. */
  backAngle: number
  implement: Implement
  motion: MotionKind
  /** Recorrido del agarre/punto de aplicación: inicio y fin. */
  from: Point
  to: Point
  /** Punto intermedio opcional del recorrido (sentadilla, remo, press de hombros, curls con arco…): from → via → to. */
  via?: Point
  /** Hacia dónde apunta el codo (o la rodilla) del brazo animado: 'abajo' (por defecto) o 'arriba' (face pull, elevaciones laterales, pájaros…). */
  elbow?: 'abajo' | 'arriba'
  /**
   * Cuál de las dos mitades del ciclo from→(via)→to→from es la fase CONCÉNTRICA (el músculo se acorta
   * venciendo la carga): 'ida' = from→to, 'vuelta' = to→from. Ausente = 'ida'. La otra mitad es la excéntrica
   * (el músculo se alarga frenando la carga). No aplica a isométricos.
   */
  loadPhase?: 'ida' | 'vuelta'
  /** Extremidad que se mueve por from→to: 'brazo' (por defecto) o 'pierna' (prensa, extensión/curl de pierna, sentadilla…). */
  limb?: 'brazo' | 'pierna'
  /** Texto corto sobre el recorrido (p. ej. "Empuja hacia delante y arriba"). */
  caption?: string
}

/** Duración de cada fase del ciclo, en segundos. */
export interface Tempo {
  concentricS: number
  eccentricS: number
  /** Pausa en cada extremo del recorrido. */
  pauseS?: number
}

export interface ExerciseGuide {
  /** Nombre EXACTO del ejercicio en seed.ts (así se enlaza con el catálogo). */
  key: string
  category: ExerciseCategory
  difficulty: Difficulty
  /** Grupos con resaltado fuerte en el mapa corporal. */
  primary: MuscleGroup[]
  /** Grupos con resaltado suave. */
  secondary: MuscleGroup[]
  /** Posición inicial / ajuste de la máquina. */
  setup: string[]
  /** Pasos de ejecución, en orden. */
  execution: string[]
  breathing?: string
  tips: string[]
  mistakes: string[]
  /** Etiquetas cortas (2-5 palabras) de la animación: [inicio, medio, final]. */
  steps?: [inicio: string, medio: string, final: string]
  /** Ritmo recomendado (concéntrica más rápida que excéntrica). Ausente en isométricos. */
  tempo?: Tempo
  /** Frase breve para el usuario sobre el ritmo. */
  tempoNote?: string
  diagram: MovementDiagram
}
