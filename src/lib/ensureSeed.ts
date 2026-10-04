import { db, saveTo } from '../db/db'
import { planMerge } from './mergePlan'
import { seedGyms } from './gyms'
import { planExerciseOrderBackfill } from './order'
import { ensurePrefsRow } from './prefs'
import { buildSeedRows } from './seed'
import { planSeed } from './seedPlan'
import type { Exercise } from './types'

let running: Promise<void> | null = null

/**
 * Mantenimiento de datos al abrir la app y tras cada sync. Idempotente:
 *  1. (merge) fusiona ejercicios/rutinas duplicados por nombre (planMerge; con save(), sincroniza).
 *     Solo se pide tras un pull correcto (o sin sesión), para decidir con los datos al día.
 *  2. siembra el catálogo (filas semilla; NO se encolan) y migra grupos musculares.
 *  3. ordena las series antiguas sin exerciseOrder.
 *  4. siembra gimnasios/disponibilidad (offline) y, tras un pull (`prefs`), la fila de preferencias.
 */
export function ensureSeed(opts: { merge?: boolean; prefs?: boolean } = {}): Promise<void> {
  running ??= doSeed(opts.merge ?? false, opts.prefs ?? false).finally(() => (running = null))
  return running
}

async function doSeed(merge: boolean, prefs: boolean) {
  if (merge) {
    const plan = planMerge(
      {
        exercises: await db.exercises.toArray(),
        workoutTemplates: await db.workoutTemplates.toArray(),
        templateExercises: await db.templateExercises.toArray(),
        sessions: await db.sessions.toArray(),
        setLogs: await db.setLogs.toArray(),
      },
      Date.now(),
    )
    for (const table of ['exercises', 'workoutTemplates', 'templateExercises', 'sessions', 'setLogs'] as const) {
      for (const row of plan[table]) await saveTo(db, table, row as never)
    }
  }

  const { exercises, workoutTemplates, templateExercises } = db
  let migrate: Exercise[] = []
  await db.transaction('rw', exercises, workoutTemplates, templateExercises, async () => {
    const plan = planSeed(buildSeedRows(), {
      exercises: await exercises.toArray(),
      workoutTemplates: await workoutTemplates.toArray(),
      templateExercises: await templateExercises.toArray(),
    })
    migrate = plan.migrate
    await exercises.bulkDelete(plan.remove.exercises)
    await workoutTemplates.bulkDelete(plan.remove.workoutTemplates)
    await templateExercises.bulkDelete(plan.remove.templateExercises)
    await exercises.bulkPut(plan.insert.exercises)
    await workoutTemplates.bulkPut(plan.insert.workoutTemplates)
    await templateExercises.bulkPut(plan.insert.templateExercises)
  })
  // Correcciones de datos del usuario: sí se encolan para sincronizar.
  for (const row of migrate) await saveTo(db, 'exercises', row)

  const sessionTemplate = new Map((await db.sessions.toArray()).map((s) => [s.id, s.templateId]))
  const backfill = planExerciseOrderBackfill(await db.setLogs.toArray(), sessionTemplate, await db.templateExercises.toArray())
  for (const row of backfill) await saveTo(db, 'setLogs', row)

  await seedGyms(db)
  // Tras un pull correcto: si esta cuenta aún no tiene fila de preferencias, se crea con las locales.
  if (prefs) await ensurePrefsRow(db)
}
