import { GYMS, availabilityRows } from '../../src/lib/gymData'

/** Gimnasios y disponibilidad que carga la etapa de catálogo (fuente: src/lib/gymData.ts). */
export const GYM_SEEDS_FOR_MIGRATION = GYMS.map((g, i) => ({ id: g.id, name: g.name, sort: i }))
export const AVAILABILITY_ROWS_FOR_MIGRATION = availabilityRows()
