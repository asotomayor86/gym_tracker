import { bigint, integer, jsonb, pgTable, real, text } from 'drizzle-orm/pg-core'

const ms = (name: string) => bigint(name, { mode: 'number' })

/** Columnas comunes de sincronización: LWW por fila + borrado lógico. */
const common = () => ({
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  updatedAt: ms('updated_at').notNull(),
  deletedAt: ms('deleted_at'),
  /** Marca de tiempo del servidor; los clientes hacen pull con `syncedAt > cursor`. */
  syncedAt: ms('synced_at').notNull().default(0),
})

export const exercises = pgTable('exercises', {
  ...common(),
  name: text('name').notNull(),
  primaryMuscle: text('primary_muscle').notNull(),
  secondaryMuscles: jsonb('secondary_muscles').$type<string[]>().notNull().default([]),
  equipment: text('equipment').notNull().default(''),
  notes: text('notes').notNull().default(''),
})

export const workoutTemplates = pgTable('workout_templates', {
  ...common(),
  name: text('name').notNull(),
})

export const templateExercises = pgTable('template_exercises', {
  ...common(),
  templateId: text('template_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  position: integer('position').notNull(),
  targetSets: integer('target_sets').notNull(),
  targetReps: integer('target_reps').notNull(),
  targetWeightKg: real('target_weight_kg').notNull(),
  restS: integer('rest_s').notNull(),
})

export const sessions = pgTable('sessions', {
  ...common(),
  templateId: text('template_id'),
  startedAt: ms('started_at').notNull(),
  endedAt: ms('ended_at'),
  notes: text('notes').notNull().default(''),
})

export const setLogs = pgTable('set_logs', {
  ...common(),
  sessionId: text('session_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  setIndex: integer('set_index').notNull(),
  reps: integer('reps').notNull(),
  weightKg: real('weight_kg').notNull(),
  inputUnit: text('input_unit').notNull(),
  inputWeight: real('input_weight').notNull(),
  effort: text('effort'),
  completedAt: ms('completed_at'),
})

export const biometrics = pgTable('biometrics', {
  ...common(),
  sessionId: text('session_id'),
  type: text('type').notNull(),
  value: real('value'),
  data: jsonb('data'),
  recordedAt: ms('recorded_at').notNull(),
  source: text('source').notNull(),
})

export const syncTables = {
  exercises,
  workoutTemplates,
  templateExercises,
  sessions,
  setLogs,
  biometrics,
} as const
