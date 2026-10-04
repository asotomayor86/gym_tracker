import { alive } from '../db/db'
import { availabilityIndex, type Availability } from './gyms'
import { MUSCLE_GROUPS, type Exercise, type ExerciseGym, type MuscleGroup } from './types'

export interface ExerciseFilter {
  /** Gimnasio habitual: oculta los ejercicios 'unavailable' en él. Los 'sin verificar' NO se ocultan (se devuelven marcados). null/ausente = sin filtro. */
  onlyAvailableAt?: string | null
  /** Grupos musculares. Por defecto coincide solo con el músculo PRIMARIO. Vacío/ausente = todos. */
  muscles?: MuscleGroup[]
  /** Con `muscles`: también acepta los ejercicios que lo trabajan como músculo secundario. */
  includeSecondary?: boolean
  /** Texto libre: cada palabra debe aparecer (sin tildes ni mayúsculas) en el nombre (español o inglés), el equipo o los músculos. */
  query?: string
  /** 'name' (por defecto), 'muscle' (por grupo muscular y luego nombre) o 'none' (orden de entrada). */
  sort?: 'name' | 'muscle' | 'none'
}

export interface FilteredExercise {
  exercise: Exercise
  /** Disponibilidad en el gimnasio indicado ('available' si no se indicó ninguno). */
  availability: Availability
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Texto normalizado sobre el que se busca: nombre en español E inglés, equipo y músculos (sin tildes ni mayúsculas). */
export const exerciseSearchText = (e: Exercise) => norm([e.name, e.nameEn ?? '', e.equipment, e.primaryMuscle, ...e.secondaryMuscles].join(' '))

/** ¿El ejercicio coincide con la búsqueda? Cada palabra debe aparecer (en español o en inglés). Pura. */
export const matchesQuery = (e: Exercise, query: string) => {
  const terms = norm(query).split(' ').filter(Boolean)
  if (!terms.length) return true
  const hay = exerciseSearchText(e)
  return terms.every((t) => hay.includes(t))
}

/**
 * Filtra y ordena los ejercicios para las pantallas de sesión y de rutinas. Pura.
 * Nunca incluye ejercicios borrados. `availabilityRows` son las filas de ExerciseGym (useExerciseGyms()).
 */
export function filterExercises(exercises: Exercise[], filter: ExerciseFilter = {}, availabilityRows: ExerciseGym[] = []): FilteredExercise[] {
  const availability = availabilityIndex(filter.onlyAvailableAt, availabilityRows)
  const terms = norm(filter.query ?? '').split(' ').filter(Boolean)
  const muscles = filter.muscles?.length ? new Set(filter.muscles) : null

  const out: FilteredExercise[] = []
  for (const exercise of exercises.filter(alive)) {
    const a = availability(exercise.id)
    if (a === 'unavailable') continue
    if (muscles && !(muscles.has(exercise.primaryMuscle) || (filter.includeSecondary && exercise.secondaryMuscles.some((m) => muscles.has(m))))) continue
    if (terms.length && !matchesQuery(exercise, filter.query!)) continue
    out.push({ exercise, availability: a })
  }

  const sort = filter.sort ?? 'name'
  if (sort === 'name') out.sort((x, y) => x.exercise.name.localeCompare(y.exercise.name, 'es'))
  else if (sort === 'muscle') {
    out.sort((x, y) => MUSCLE_GROUPS.indexOf(x.exercise.primaryMuscle) - MUSCLE_GROUPS.indexOf(y.exercise.primaryMuscle) || x.exercise.name.localeCompare(y.exercise.name, 'es'))
  }
  return out
}
