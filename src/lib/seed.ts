import { save } from '../db/db'
import type { MuscleGroup } from './types'

type Seed = [name: string, primary: MuscleGroup, secondary: MuscleGroup[], equipment: string]

const SEED: Seed[] = [
  ['Press banca', 'pecho', ['triceps', 'hombro'], 'Barra'],
  ['Press banca inclinado mancuernas', 'pecho', ['hombro', 'triceps'], 'Mancuernas'],
  ['Aperturas en polea', 'pecho', [], 'Polea'],
  ['Fondos en paralelas', 'pecho', ['triceps'], 'Peso corporal'],
  ['Dominadas', 'espalda', ['biceps'], 'Peso corporal'],
  ['Remo con barra', 'espalda', ['biceps'], 'Barra'],
  ['Jalón al pecho', 'espalda', ['biceps'], 'Polea'],
  ['Remo en polea baja', 'espalda', ['biceps'], 'Polea'],
  ['Peso muerto', 'espalda', ['gluteo', 'isquios'], 'Barra'],
  ['Press militar', 'hombro', ['triceps'], 'Barra'],
  ['Elevaciones laterales', 'hombro', [], 'Mancuernas'],
  ['Pájaros', 'hombro', ['espalda'], 'Mancuernas'],
  ['Curl de bíceps con barra', 'biceps', ['antebrazo'], 'Barra'],
  ['Curl martillo', 'biceps', ['antebrazo'], 'Mancuernas'],
  ['Press francés', 'triceps', [], 'Barra Z'],
  ['Extensión de tríceps en polea', 'triceps', [], 'Polea'],
  ['Sentadilla', 'cuadriceps', ['gluteo', 'core'], 'Barra'],
  ['Prensa de piernas', 'cuadriceps', ['gluteo'], 'Máquina'],
  ['Extensión de cuádriceps', 'cuadriceps', [], 'Máquina'],
  ['Peso muerto rumano', 'isquios', ['gluteo', 'espalda'], 'Barra'],
  ['Curl femoral', 'isquios', [], 'Máquina'],
  ['Hip thrust', 'gluteo', ['isquios'], 'Barra'],
  ['Elevación de gemelos', 'gemelo', [], 'Máquina'],
  ['Plancha', 'core', [], 'Peso corporal'],
  ['Crunch en polea', 'core', [], 'Polea'],
]

export async function seedExercises() {
  for (const [name, primaryMuscle, secondaryMuscles, equipment] of SEED) {
    await save('exercises', { name, primaryMuscle, secondaryMuscles, equipment, notes: '' })
  }
}
