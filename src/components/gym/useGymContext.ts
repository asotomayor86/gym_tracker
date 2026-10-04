import { usePrefs } from '../../lib/prefs'
import { availabilityIndex, useExerciseGyms, useGyms } from '../../lib/gyms'
import type { Gym } from '../../lib/types'

/** Gimnasio habitual y disponibilidad por ejercicio (índice precalculado). */
export function useGymContext() {
  const { gymId } = usePrefs()
  const gyms = useGyms()
  const rows = useExerciseGyms()
  const gym: Gym | undefined = gymId ? gyms.find((g) => g.id === gymId) : undefined
  // Un gimnasio borrado o aún no descargado no filtra nada
  const active = gym?.id ?? null
  return { gymId: active, gym, gyms, avail: availabilityIndex(active, rows) }
}

