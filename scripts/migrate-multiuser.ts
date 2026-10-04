/**
 * Migración a multiusuario contra Neon (usa DATABASE_URL_UNPOOLED o DATABASE_URL del .env).
 *
 *   npx tsx scripts/migrate-multiuser.ts schema                 informe en seco de la etapa 1 (ROLLBACK)
 *   npx tsx scripts/migrate-multiuser.ts schema --apply         etapa 1: tablas nuevas (aditivo)
 *   npx tsx scripts/bootstrap-admin.ts                          crea el admin (entre etapa 1 y 2)
 *   npx tsx scripts/migrate-multiuser.ts data                   informe EXACTO de filas en seco (ROLLBACK, no toca nada)
 *   npx tsx scripts/migrate-multiuser.ts data --apply --backup-file <volcado.json>
 *                                                               etapa 2 (una transacción; exige la copia JSON reciente)
 *   npx tsx scripts/migrate-multiuser.ts catalog                informe en seco de la etapa 3 (catálogo global, gimnasios, disponibilidad)
 *   npx tsx scripts/migrate-multiuser.ts catalog --apply        etapa 3 (una transacción)
 *   npx tsx scripts/migrate-multiuser.ts catalog-refresh        informe en seco: nombres en inglés + ejercicios/gimnasios/disponibilidad nuevos del semilla
 *   npx tsx scripts/migrate-multiuser.ts catalog-refresh --apply  etapa 4 (aditiva e idempotente)
 *   npx tsx scripts/migrate-multiuser.ts down-catalog-refresh --apply  quita la columna name_en
 *   npx tsx scripts/migrate-multiuser.ts down-catalog --apply   recupera la tabla de ejercicios por usuario
 *   npx tsx scripts/migrate-multiuser.ts down-data --apply      revierte propietario y claves (no la fusión: usa la rama de Neon)
 *   npx tsx scripts/migrate-multiuser.ts down-schema --apply    elimina las tablas nuevas
 */
import 'dotenv/config'
import { existsSync, readFileSync } from 'node:fs'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { type Conn, type Q, type Row, SCHEMA_DOWN, SCHEMA_UP, runCatalogDown, runCatalogMigration, runCatalogRefresh, runCatalogRefreshDown, runDataDown, runDataMigration } from './migration/multiuser'

const [stage, ...flags] = process.argv.slice(2)
const apply = flags.includes('--apply')
const flag = (name: string) => flags[flags.indexOf(name) + 1]
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
const adminEmail = process.env.ADMIN_EMAIL
if (!url) throw new Error('Falta DATABASE_URL (o DATABASE_URL_UNPOOLED)')
neonConfig.webSocketConstructor = WebSocket // Node ≥ 22

const pool = new Pool({ connectionString: url })
const wrap = (c: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }> }): Q => async (sql, params) => (await c.query(sql, params)).rows

const conn: Conn = {
  query: wrap(pool),
  async transaction(fn) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const out = await fn(wrap(client))
      await client.query('COMMIT')
      return out
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  },
}

const host = new URL(url).host
console.log(`Base de datos: ${host} · modo: ${apply ? 'APLICAR' : 'en seco (no modifica nada)'}`)

try {
  if (stage === 'schema' || stage === 'down-schema') {
    const stmts = stage === 'schema' ? SCHEMA_UP : SCHEMA_DOWN
    class DryRun extends Error {}
    try {
      await conn.transaction(async (q) => {
        for (const s of stmts) await q(s)
        if (!apply) throw new DryRun()
      })
    } catch (e) {
      if (!(e instanceof DryRun)) throw e
    }
    console.log(`${stage}: ${stmts.length} sentencias ${apply ? 'aplicadas' : 'validadas (ROLLBACK)'}.`)
  } else if (stage === 'data') {
    if (!adminEmail) throw new Error('Falta ADMIN_EMAIL en el .env')
    if (apply) {
      const file = flag('--backup-file')
      if (!file || !existsSync(file)) throw new Error('--apply exige --backup-file <volcado JSON reciente de Neon>')
      const backup = JSON.parse(readFileSync(file, 'utf8')).changes as Record<string, unknown[]>
      const live = Number(((await conn.query('SELECT count(*) c FROM set_logs'))[0] as { c: unknown }).c)
      if ((backup.setLogs?.length ?? -1) !== live) throw new Error(`La copia no coincide con la base (series: copia ${backup.setLogs?.length}, base ${live}). Haz otra copia.`)
    }
    const report = await runDataMigration(conn, { adminEmail, dryRun: !apply })
    console.log(JSON.stringify(report, null, 2))
    console.log(apply ? 'Migración APLICADA.' : 'Informe en seco: no se ha modificado nada.')
  } else if (stage === 'catalog') {
    if (!adminEmail) throw new Error('Falta ADMIN_EMAIL en el .env')
    const report = await runCatalogMigration(conn, { adminEmail, dryRun: !apply })
    console.log(JSON.stringify(report, null, 2))
    console.log(apply ? 'Catálogo migrado.' : 'Informe en seco: no se ha modificado nada.')
  } else if (stage === 'catalog-refresh') {
    const report = await runCatalogRefresh(conn, { dryRun: !apply })
    console.log(JSON.stringify(report, null, 2))
    console.log(apply ? 'Catálogo refrescado.' : 'Informe en seco: no se ha modificado nada.')
  } else if (stage === 'down-catalog-refresh') {
    if (!apply) throw new Error('down-catalog-refresh exige --apply')
    await runCatalogRefreshDown(conn)
    console.log('down-catalog-refresh aplicado.')
  } else if (stage === 'down-catalog') {
    if (!apply) throw new Error('down-catalog exige --apply')
    await runCatalogDown(conn)
    console.log('down-catalog aplicado.')
  } else if (stage === 'down-data') {
    if (!apply || !adminEmail) throw new Error('down-data exige --apply y ADMIN_EMAIL')
    await runDataDown(conn, adminEmail)
    console.log('down-data aplicado.')
  } else {
    throw new Error('Uso: schema | data | catalog | catalog-refresh | down-catalog-refresh | down-catalog | down-data | down-schema  [--apply] [--backup-file ruta]')
  }
} finally {
  await pool.end()
}
