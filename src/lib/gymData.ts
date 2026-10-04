/**
 * Datos puros de gimnasios y disponibilidad de ejercicios (sin Dexie ni React): los carga la migración.
 * Fuente: fotos de las máquinas del gimnasio y confirmación del usuario (2026-10-04).
 *
 * AVAILABILITY solo contiene filas VERIFICADAS: true = hay máquina, false = confirmado que no existe.
 * Un ejercicio sin fila está "sin verificar" (hoy: ninguno).
 */

export interface GymSeed {
  id: string
  name: string
}

export const GYMS: GymSeed[] = [{ id: 'gym-forus', name: 'Forus' }]

const FORUS = 'gym-forus'

/** exerciseId (seed-ex-*) → gymId → disponible. */
export const AVAILABILITY: Record<string, Record<string, boolean>> = {
  // Piernas
  'seed-ex-prensa-de-piernas': { [FORUS]: true }, // Technogym Leg Press
  'seed-ex-hack-squat': { [FORUS]: false },
  'seed-ex-sentadilla-en-multipower': { [FORUS]: false },
  'seed-ex-extension-de-cuadriceps': { [FORUS]: true }, // Leg Extension
  'seed-ex-curl-femoral-tumbado': { [FORUS]: false },
  'seed-ex-curl-femoral-sentado': { [FORUS]: true }, // Leg Curl (Selection y reclinado)
  'seed-ex-abductores-en-maquina': { [FORUS]: true }, // confirmado por el usuario (2026-10-04); además Multi Hip de pie
  'seed-ex-aductores-en-maquina': { [FORUS]: true }, // Technogym Adductor (foto) y confirmado por el usuario
  'seed-ex-patada-de-gluteo-en-maquina': { [FORUS]: true }, // Glute
  'seed-ex-hip-thrust-en-maquina': { [FORUS]: true }, // Hip Thrust
  'seed-ex-elevacion-de-gemelos-sentado': { [FORUS]: false },
  'seed-ex-elevacion-de-gemelos-en-prensa': { [FORUS]: true }, // confirmado por el usuario (2026-10-04): la Leg Press permite hacer gemelos
  // Pecho
  'seed-ex-press-de-pecho-en-maquina': { [FORUS]: true }, // Chest Press
  'seed-ex-press-inclinado-en-maquina': { [FORUS]: true }, // Chest Incline
  'seed-ex-press-banca-en-multipower': { [FORUS]: false },
  'seed-ex-peck-deck-aperturas-en-maquina': { [FORUS]: true }, // Pectoral (2 máquinas)
  'seed-ex-cruce-de-poleas': { [FORUS]: false },
  'seed-ex-fondos-asistidos-en-maquina': { [FORUS]: false },
  // Hombros
  'seed-ex-press-de-hombros-en-maquina': { [FORUS]: true }, // Shoulder Press
  'seed-ex-elevaciones-laterales-en-maquina': { [FORUS]: true }, // Delts Machine
  'seed-ex-elevaciones-laterales-en-polea': { [FORUS]: false },
  'seed-ex-pajaros-en-peck-deck-deltoides-posterior': { [FORUS]: true }, // Reverse Fly
  'seed-ex-face-pull-en-polea': { [FORUS]: false },
  // Brazos
  'seed-ex-curl-de-biceps-en-maquina': { [FORUS]: true }, // Arm Curl
  'seed-ex-curl-de-biceps-en-polea': { [FORUS]: false },
  'seed-ex-curl-en-banco-scott-maquina': { [FORUS]: false },
  'seed-ex-extension-de-triceps-en-polea-cuerda': { [FORUS]: false },
  'seed-ex-extension-de-triceps-en-maquina': { [FORUS]: false },
  'seed-ex-press-de-triceps-en-maquina-fondos': { [FORUS]: true }, // Impulse Seated Dip
  // Espalda
  'seed-ex-jalon-al-pecho': { [FORUS]: true }, // jalón de cable selectorizado (Pro Series) + Vertical Traction y Pulldown (palancas)
  'seed-ex-remo-sentado-en-maquina': { [FORUS]: true }, // Low Row
  'seed-ex-remo-en-polea-baja': { [FORUS]: true }, // remo en polea baja selectorizado (Pro Series) + Technogym Pulley
  'seed-ex-dominadas-asistidas-en-maquina': { [FORUS]: false },
  // Core
  'seed-ex-crunch-en-maquina': { [FORUS]: false },
  'seed-ex-crunch-en-polea': { [FORUS]: false },
  // Máquinas de Forus no contempladas al principio
  'seed-ex-extension-lumbar-en-maquina': { [FORUS]: true }, // Lower Back
  'seed-ex-remo-alto-en-maquina': { [FORUS]: true }, // Upper Back
  'seed-ex-abduccion-de-cadera-de-pie-en-maquina': { [FORUS]: true }, // Multi Hip
  'seed-ex-jalon-en-maquina-con-palancas': { [FORUS]: true }, // Pulldown / Vertical Traction
  'seed-ex-flexion-de-cadera-de-pie-en-maquina': { [FORUS]: true }, // Multi Hip (flexión)
  'seed-ex-extension-de-cadera-de-pie-en-maquina': { [FORUS]: true }, // Multi Hip (extensión)
  'seed-ex-aduccion-de-cadera-de-pie-en-maquina': { [FORUS]: true }, // Multi Hip (aducción)
}

export interface AvailabilityRow {
  exerciseId: string
  gymId: string
  available: boolean
}

/** Filas aplanadas (orden estable: el del catálogo, y dentro de cada ejercicio el de GYMS). */
export function availabilityRows(): AvailabilityRow[] {
  const rows: AvailabilityRow[] = []
  for (const [exerciseId, byGym] of Object.entries(AVAILABILITY)) {
    for (const g of GYMS) {
      const available = byGym[g.id]
      if (available !== undefined) rows.push({ exerciseId, gymId: g.id, available })
    }
  }
  return rows
}

/** true / false si está verificado; undefined si está sin verificar. */
export const availabilityOf = (exerciseId: string, gymId: string): boolean | undefined => AVAILABILITY[exerciseId]?.[gymId]
