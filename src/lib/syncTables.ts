/** Tablas por usuario: cada usuario sube y baja solo las suyas. */
export const USER_TABLES = [
  'workoutTemplates',
  'templateExercises',
  'sessions',
  'setLogs',
  'biometrics',
  'bodyWeights',
  'userPrefs',
] as const

/** Catálogo global: todos lo leen, solo el admin lo escribe (el servidor lo impone). */
export const CATALOG_TABLES = ['exercises', 'gyms', 'exerciseGyms'] as const

export const SYNC_TABLES = [...CATALOG_TABLES, ...USER_TABLES] as const
export type SyncTable = (typeof SYNC_TABLES)[number]
export type UserTable = (typeof USER_TABLES)[number]
export type CatalogTable = (typeof CATALOG_TABLES)[number]

export const isCatalogTable = (t: SyncTable): t is CatalogTable => (CATALOG_TABLES as readonly string[]).includes(t)
