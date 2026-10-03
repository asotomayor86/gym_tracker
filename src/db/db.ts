import Dexie, { type DexieOptions, type Table } from 'dexie'
import type {
  Biometric, Exercise, Session, SetLog, SyncFields, TemplateExercise, WorkoutTemplate,
} from '../lib/types'
import type { SyncTable } from '../lib/syncTables'

export interface OutboxEntry {
  key: string // `${table}:${id}`
  table: SyncTable
  id: string
}

export interface TableRows {
  exercises: Exercise
  workoutTemplates: WorkoutTemplate
  templateExercises: TemplateExercise
  sessions: Session
  setLogs: SetLog
  biometrics: Biometric
}

export class GymDB extends Dexie {
  exercises!: Table<Exercise, string>
  workoutTemplates!: Table<WorkoutTemplate, string>
  templateExercises!: Table<TemplateExercise, string>
  sessions!: Table<Session, string>
  setLogs!: Table<SetLog, string>
  biometrics!: Table<Biometric, string>
  outbox!: Table<OutboxEntry, string>

  constructor(name = 'gym-tracker', options?: DexieOptions) {
    super(name, options)
    this.version(1).stores({
      exercises: 'id, primaryMuscle',
      workoutTemplates: 'id',
      templateExercises: 'id, templateId, exerciseId',
      sessions: 'id, startedAt, templateId',
      setLogs: 'id, sessionId, exerciseId, completedAt',
      biometrics: 'id, sessionId, recordedAt',
      outbox: 'key',
    })
  }
}

export const db = new GymDB()

type Input<K extends SyncTable> = Omit<TableRows[K], keyof SyncFields> & Partial<SyncFields>

/** Crea o actualiza una fila y la encola para sincronizar. */
export async function saveTo<K extends SyncTable>(d: GymDB, table: K, row: Input<K>): Promise<TableRows[K]> {
  const full = {
    deletedAt: null,
    ...row,
    id: row.id ?? crypto.randomUUID(),
    updatedAt: Date.now(),
  } as unknown as TableRows[K]
  await d.transaction('rw', d[table], d.outbox, async () => {
    await (d[table] as Table<TableRows[K], string>).put(full)
    await d.outbox.put({ key: `${table}:${full.id}`, table, id: full.id })
  })
  return full
}

/** Borrado lógico (se propaga por sync). */
export async function removeFrom<K extends SyncTable>(d: GymDB, table: K, id: string) {
  const row = await (d[table] as Table<TableRows[K], string>).get(id)
  if (row) await saveTo(d, table, { ...row, deletedAt: Date.now() } as unknown as Input<K>)
}

export const save = <K extends SyncTable>(table: K, row: Input<K>) => saveTo(db, table, row)
export const remove = <K extends SyncTable>(table: K, id: string) => removeFrom(db, table, id)

export const alive = <T extends { deletedAt: number | null }>(r: T) => !r.deletedAt
