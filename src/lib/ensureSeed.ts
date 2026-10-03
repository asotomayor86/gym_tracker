import { db } from '../db/db'
import { buildSeedRows } from './seed'
import { planSeed } from './seedPlan'

let running: Promise<void> | null = null

/**
 * Carga automática de ejercicios y rutinas de ejemplo. Idempotente; las filas semilla NO se encolan en el
 * outbox (cada dispositivo genera las mismas), y cualquier edición del usuario (updatedAt real) pasa a sincronizarse.
 */
export function ensureSeed(): Promise<void> {
  running ??= doSeed().finally(() => (running = null))
  return running
}

async function doSeed() {
  const { exercises, workoutTemplates, templateExercises } = db
  await db.transaction('rw', exercises, workoutTemplates, templateExercises, async () => {
    const plan = planSeed(buildSeedRows(), {
      exercises: await exercises.toArray(),
      workoutTemplates: await workoutTemplates.toArray(),
      templateExercises: await templateExercises.toArray(),
    })
    await exercises.bulkDelete(plan.remove.exercises)
    await workoutTemplates.bulkDelete(plan.remove.workoutTemplates)
    await templateExercises.bulkDelete(plan.remove.templateExercises)
    await exercises.bulkPut(plan.insert.exercises)
    await workoutTemplates.bulkPut(plan.insert.workoutTemplates)
    await templateExercises.bulkPut(plan.insert.templateExercises)
  })
}
