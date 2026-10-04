import { alive, db, save } from '../db/db'
import { getPrefs } from './prefs'
import { suggestNext } from './progression'
import { lastSessionSets } from './stats'
import { roundTo } from './units'

/** Crea una sesión desde una rutina con las series precargadas con la sugerencia de progresión. */
export async function startSession(templateId: string): Promise<string> {
  const { incrementKg } = getPrefs()
  const items = await db.templateExercises.where('templateId').equals(templateId).filter(alive).sortBy('position')
  const allLogs = await db.setLogs.filter(alive).toArray()
  const session = await save('sessions', { templateId, startedAt: Date.now(), endedAt: null, notes: '' })

  for (const [order, item] of items.entries()) {
    const suggestion = suggestNext(lastSessionSets(allLogs, item.exerciseId), { incrementKg })
    const weightKg = suggestion?.weightKg ?? item.targetWeightKg
    const reps = suggestion?.reps ?? item.targetReps
    for (let i = 0; i < item.targetSets; i++) {
      await save('setLogs', {
        sessionId: session.id, exerciseId: item.exerciseId, setIndex: i, exerciseOrder: order, reps, weightKg,
        inputUnit: 'kg', inputWeight: roundTo(weightKg, 0.5),
        effort: null, completedAt: null,
      })
    }
  }
  return session.id
}
