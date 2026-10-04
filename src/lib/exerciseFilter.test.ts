import { describe, expect, it } from 'vitest'
import { filterExercises } from './exerciseFilter'
import { exerciseGymId } from './gyms'
import type { Exercise, ExerciseGym, MuscleGroup } from './types'

const ex = (id: string, name: string, primaryMuscle: MuscleGroup, secondaryMuscles: MuscleGroup[] = [], p: Partial<Exercise> = {}): Exercise =>
  ({ id, name, primaryMuscle, secondaryMuscles, equipment: 'Máquina', notes: '', updatedAt: 1, deletedAt: null, ...p })
const av = (exerciseId: string, available: boolean, deletedAt: number | null = null): ExerciseGym =>
  ({ id: exerciseGymId(exerciseId, 'g'), exerciseId, gymId: 'g', available, updatedAt: 1, deletedAt })

const ALL = [
  ex('1', 'Press de pecho', 'pecho', ['triceps']),
  ex('2', 'Curl de bíceps', 'biceps'),
  ex('3', 'Extensión de tríceps', 'triceps'),
  ex('4', 'Élevación lateral', 'hombro'),
  ex('5', 'Borrado', 'pecho', [], { deletedAt: 9 }),
]
const names = (r: ReturnType<typeof filterExercises>) => r.map((x) => x.exercise.name)

describe('filterExercises', () => {
  it('sin filtros: todos los vivos por nombre (con acentos) y sin ocultar nada', () => {
    expect(names(filterExercises(ALL))).toEqual(['Curl de bíceps', 'Élevación lateral', 'Extensión de tríceps', 'Press de pecho'])
    expect(filterExercises(ALL).every((r) => r.availability === 'available')).toBe(true)
  })

  it('por músculo: solo primario por defecto; con includeSecondary también el secundario', () => {
    expect(names(filterExercises(ALL, { muscles: ['triceps'] }))).toEqual(['Extensión de tríceps'])
    expect(names(filterExercises(ALL, { muscles: ['triceps'], includeSecondary: true }))).toEqual(['Extensión de tríceps', 'Press de pecho'])
    expect(names(filterExercises(ALL, { muscles: ['biceps', 'hombro'] }))).toEqual(['Curl de bíceps', 'Élevación lateral'])
    expect(filterExercises(ALL, { muscles: [] })).toHaveLength(4) // vacío = todos
  })

  it('búsqueda sin tildes ni mayúsculas, por palabras sueltas y también por equipo o músculo', () => {
    expect(names(filterExercises(ALL, { query: 'BICEPS' }))).toEqual(['Curl de bíceps'])
    expect(names(filterExercises(ALL, { query: 'press pecho' }))).toEqual(['Press de pecho'])
    expect(names(filterExercises(ALL, { query: 'elevacion' }))).toEqual(['Élevación lateral'])
    expect(filterExercises(ALL, { query: 'maquina' })).toHaveLength(4)
    expect(filterExercises(ALL, { query: 'zzz' })).toEqual([])
    expect(filterExercises(ALL, { query: '   ' })).toHaveLength(4)
  })

  it('por gimnasio oculta los NO disponibles y devuelve marcados los sin verificar', () => {
    const rows = [av('1', true), av('2', false), av('3', true, 9)] // 3: marca borrada = sin verificar; 4: sin fila
    const r = filterExercises(ALL, { onlyAvailableAt: 'g' }, rows)
    const byId = Object.fromEntries(r.map((x) => [x.exercise.id, x.availability]))
    expect(byId).toEqual({ 1: 'available', 3: 'unverified', 4: 'unverified' })
    expect(names(r)).not.toContain('Curl de bíceps')
    expect(filterExercises(ALL, { onlyAvailableAt: null }, rows)).toHaveLength(4) // sin gimnasio: no se filtra
    expect(filterExercises(ALL, {}, rows).find((x) => x.exercise.id === '2')!.availability).toBe('available')
  })

  it('combina filtros y ordena por grupo muscular o conserva el orden de entrada', () => {
    const r = filterExercises(ALL, { muscles: ['pecho', 'biceps', 'triceps'], sort: 'muscle' })
    expect(names(r)).toEqual(['Press de pecho', 'Curl de bíceps', 'Extensión de tríceps']) // orden de MUSCLE_GROUPS
    expect(names(filterExercises(ALL, { sort: 'none' }))).toEqual(['Press de pecho', 'Curl de bíceps', 'Extensión de tríceps', 'Élevación lateral'])
    expect(names(filterExercises(ALL, { muscles: ['pecho'], query: 'press', onlyAvailableAt: 'g' }, [av('1', true)]))).toEqual(['Press de pecho'])
  })

  it('no modifica la lista de entrada', () => {
    const copy = [...ALL]
    filterExercises(ALL, { sort: 'name' })
    expect(ALL).toEqual(copy)
  })
})
