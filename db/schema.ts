import { type AnyPgColumn, bigint, boolean, index, integer, jsonb, pgTable, primaryKey, real, text, uniqueIndex } from 'drizzle-orm/pg-core'

const ms = (name: string) => bigint(name, { mode: 'number' })

// ───────────── Auth y administración (solo servidor; no sincronizan) ─────────────

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    /** Siempre en minúsculas y sin espacios (se normaliza en la API). */
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull().default(''),
    role: text('role').$type<'admin' | 'user'>().notNull().default('user'),
    disabled: boolean('disabled').notNull().default(false),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    /** Se incrementa al cambiar/restablecer la contraseña: invalida todos los tokens de acceso vigentes. */
    tokenVersion: integer('token_version').notNull().default(0),
    createdAt: ms('created_at').notNull(),
    lastLoginAt: ms('last_login_at'),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
)

/** Una fila por dispositivo/sesión; el refresh token solo se guarda como hash SHA-256. */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    refreshHash: text('refresh_hash').notNull(),
    /** Refresh anterior: sigue valiendo hasta prevValidUntil (dos pestañas refrescando a la vez). */
    prevHash: text('prev_hash'),
    prevValidUntil: ms('prev_valid_until'),
    /** Hashes de refresh ya rotados (los últimos 8): reutilizar cualquiera fuera de la gracia revoca la sesión (robo). */
    retiredHashes: text('retired_hashes').array().notNull().default([]),
    deviceLabel: text('device_label').notNull().default(''),
    createdAt: ms('created_at').notNull(),
    lastUsedAt: ms('last_used_at').notNull(),
    expiresAt: ms('expires_at').notNull(),
    revokedAt: ms('revoked_at'),
  },
  (t) => [uniqueIndex('auth_sessions_refresh_uq').on(t.refreshHash), index('auth_sessions_user_idx').on(t.userId), index('auth_sessions_prev_idx').on(t.prevHash)],
)

export const invitations = pgTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    /** SHA-256 del código; el código en claro solo se muestra una vez al crearlo. */
    codeHash: text('code_hash').notNull(),
    role: text('role').$type<'admin' | 'user'>().notNull().default('user'),
    createdBy: text('created_by').notNull(),
    createdAt: ms('created_at').notNull(),
    expiresAt: ms('expires_at').notNull(),
    usedAt: ms('used_at'),
    usedBy: text('used_by'),
    revokedAt: ms('revoked_at'),
  },
  (t) => [uniqueIndex('invitations_code_uq').on(t.codeHash)],
)

/** Limitador de intentos de login (serverless: el estado vive en la base). */
export const loginAttempts = pgTable('login_attempts', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: ms('window_start').notNull(),
  lockedUntil: ms('locked_until').notNull().default(0),
})

// ───────────── Datos sincronizados ─────────────

/** Columnas comunes de sincronización: LWW por fila + borrado lógico. La clave primaria es (user_id, id). */
const common = () => ({
  id: text('id').notNull(),
  userId: text('user_id').notNull(),
  updatedAt: ms('updated_at').notNull(),
  deletedAt: ms('deleted_at'),
  /** Marca de tiempo del servidor; los clientes hacen pull con `syncedAt > cursor`. */
  syncedAt: ms('synced_at').notNull().default(0),
})

/** Clave compuesta + índice de pull para una tabla de usuario. */
const perUser = (name: string) => (t: { userId: AnyPgColumn; id: AnyPgColumn; syncedAt: AnyPgColumn }) => [
  primaryKey({ columns: [t.userId, t.id], name: `${name}_pk` }),
  index(`${name}_pull_idx`).on(t.userId, t.syncedAt),
]

/** Copia de los ejercicios por usuario previos al catálogo global (F3). Solo lectura; se conserva para poder revertir. */
export const exercisesUserLegacy = pgTable(
  'exercises_user_legacy',
  {
    ...common(),
    name: text('name').notNull(),
    primaryMuscle: text('primary_muscle').notNull(),
    secondaryMuscles: jsonb('secondary_muscles').$type<string[]>().notNull().default([]),
    equipment: text('equipment').notNull().default(''),
    notes: text('notes').notNull().default(''),
  },
  perUser('exercises_user_legacy'),
)

export const workoutTemplates = pgTable(
  'workout_templates',
  {
    ...common(),
    name: text('name').notNull(),
  },
  perUser('workout_templates'),
)

export const templateExercises = pgTable(
  'template_exercises',
  {
    ...common(),
    templateId: text('template_id').notNull(),
    exerciseId: text('exercise_id').notNull(),
    position: integer('position').notNull(),
    targetSets: integer('target_sets').notNull(),
    targetReps: integer('target_reps').notNull(),
    targetWeightKg: real('target_weight_kg').notNull(),
    restS: integer('rest_s').notNull(),
  },
  perUser('template_exercises'),
)

export const sessions = pgTable(
  'sessions',
  {
    ...common(),
    templateId: text('template_id'),
    startedAt: ms('started_at').notNull(),
    endedAt: ms('ended_at'),
    notes: text('notes').notNull().default(''),
  },
  perUser('sessions'),
)

export const setLogs = pgTable(
  'set_logs',
  {
    ...common(),
    sessionId: text('session_id').notNull(),
    exerciseId: text('exercise_id').notNull(),
    setIndex: integer('set_index').notNull(),
    exerciseOrder: integer('exercise_order').notNull().default(0),
    reps: integer('reps').notNull(),
    weightKg: real('weight_kg').notNull(),
    inputUnit: text('input_unit').notNull(),
    inputWeight: real('input_weight').notNull(),
    effort: text('effort'),
    completedAt: ms('completed_at'),
  },
  perUser('set_logs'),
)

export const biometrics = pgTable(
  'biometrics',
  {
    ...common(),
    sessionId: text('session_id'),
    type: text('type').notNull(),
    value: real('value'),
    data: jsonb('data'),
    recordedAt: ms('recorded_at').notNull(),
    source: text('source').notNull(),
  },
  perUser('biometrics'),
)

/** Peso corporal: un registro por día (id = 'bw-YYYY-MM-DD'), siempre en kg. */
export const bodyWeights = pgTable(
  'body_weights',
  {
    ...common(),
    /** Día local en formato YYYY-MM-DD. */
    date: text('date').notNull(),
    weightKg: real('weight_kg').notNull(),
    note: text('note').notNull().default(''),
  },
  perUser('body_weights'),
)

/** Preferencias del usuario: una sola fila con id 'prefs'. */
export const userPrefs = pgTable(
  'user_prefs',
  {
    ...common(),
    unit: text('unit').notNull().default('kg'),
    incrementKg: real('increment_kg').notNull().default(2.5),
    gymId: text('gym_id'),
  },
  perUser('user_prefs'),
)

// ───────────── Catálogo global (F3; solo lo edita el admin, sin user_id) ─────────────

const catalog = () => ({
  id: text('id').primaryKey(),
  updatedAt: ms('updated_at').notNull(),
  deletedAt: ms('deleted_at'),
  syncedAt: ms('synced_at').notNull().default(0),
})

/** Catálogo global de ejercicios (sin user_id): lo lee todo el mundo y solo lo edita el admin. */
export const exercises = pgTable(
  'exercises',
  {
    ...catalog(),
    name: text('name').notNull(),
    primaryMuscle: text('primary_muscle').notNull(),
    secondaryMuscles: jsonb('secondary_muscles').$type<string[]>().notNull().default([]),
    equipment: text('equipment').notNull().default(''),
    notes: text('notes').notNull().default(''),
  },
  (t) => [index('exercises_pull_idx').on(t.syncedAt)],
)

export const gyms = pgTable(
  'gyms',
  { ...catalog(), name: text('name').notNull(), notes: text('notes').notNull().default(''), sort: integer('sort').notNull().default(0) },
  (t) => [index('gyms_pull_idx').on(t.syncedAt)],
)

/** Disponibilidad ejercicio × gimnasio. Fila explícita = verificado; sin fila = "sin verificar". id = '<exerciseId>:<gymId>'. */
export const exerciseGyms = pgTable(
  'exercise_gyms',
  { ...catalog(), exerciseId: text('exercise_id').notNull(), gymId: text('gym_id').notNull(), available: boolean('available').notNull() },
  (t) => [index('exercise_gyms_pull_idx').on(t.syncedAt), index('exercise_gyms_gym_idx').on(t.gymId)],
)

/** Tablas sincronizadas por usuario (todas con user_id del token). */
export const syncTables = {
  workoutTemplates,
  templateExercises,
  sessions,
  setLogs,
  biometrics,
  bodyWeights,
  userPrefs,
} as const

/** Tablas del catálogo global (sin user_id): solo el admin escribe; todos leen. */
export const catalogTables = { exercises, gyms, exerciseGyms } as const
