export const SYNC_TABLES = [
  'exercises',
  'workoutTemplates',
  'templateExercises',
  'sessions',
  'setLogs',
  'biometrics',
] as const
export type SyncTable = (typeof SYNC_TABLES)[number]
