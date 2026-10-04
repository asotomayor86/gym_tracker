# Runbook: migración a multiusuario (F0–F2)

Todo se ejecuta desde la raíz con el `.env` local (`DATABASE_URL_UNPOOLED`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`). **Cada comando sin `--apply` es en seco** (hace ROLLBACK).

0. **Copia**: rama de Neon `pre-multiusuario` (consola de Neon) + volcado JSON reciente (`/api/sync/pull?since=0` con la API antigua).
1. **Esquema (aditivo, seguro con la API antigua en marcha)**
   - `npx tsx scripts/migrate-multiuser.ts schema` → valida
   - `npx tsx scripts/migrate-multiuser.ts schema --apply`
2. **Cuenta admin**: `npx tsx scripts/bootstrap-admin.ts` (idempotente; avisa si la contraseña es común; `--reset-password` para recuperarla).
3. **Informe de filas (en seco, exacto)**: `npx tsx scripts/migrate-multiuser.ts data`
   Comprobar: series vivas y sesiones vivas iguales antes/después; 0 referencias colgantes; `after.exercisesLive` = nº de ejercicios del catálogo.
4. **Aplicar datos** (una transacción; revierte sola si falla un invariante):
   `npx tsx scripts/migrate-multiuser.ts data --apply --backup-file <volcado.json>` (aborta si el volcado no coincide con la base).
5. **Desplegar** API + cliente (un solo despliegue de Vercel). Smoke test: login admin, pull, push.
6. **Después**: borrar `APP_PASSWORD` de Vercel. Crear invitaciones desde el panel admin.

**Rollback**
- Antes del paso 4: nada que deshacer (las tablas nuevas no molestan); `schema` se revierte con `down-schema --apply`.
- Después del paso 4 y antes de desplegar: `down-data --apply` devuelve propietario `owner` y clave simple (NO deshace la fusión de duplicados: para eso, restaurar la rama de Neon).
- Tras desplegar: promover el despliegue anterior en Vercel y restaurar la rama `pre-multiusuario` (se pierden los cambios hechos desde la copia; los dispositivos conservan su outbox).

---

# F3: catálogo global, gimnasios y disponibilidad (etapa `catalog`)

Requisitos: F0–F2 ya aplicadas. **Orden**:
0. Copia: rama de Neon + volcado JSON reciente.
1. En seco: `npx tsx scripts/migrate-multiuser.ts catalog` → revisar el informe:
   `legacyExercises.others` debe ser 0 (si no, aborta: hay ejercicios de otros usuarios que decidir), `catalogExercisesLive` = ejercicios vivos del admin + `insertedSeedExercises`, `danglingSetLogs`/`danglingTemplateExercises` = 0, `insertedGyms` = nº de gimnasios de `gymData.ts`, `insertedAvailability` = filas de disponibilidad.
2. `npx tsx scripts/migrate-multiuser.ts catalog --apply` (una transacción; revierte sola si falla un invariante). La tabla antigua queda como `exercises_user_legacy`.
3. **Desplegar inmediatamente** API + cliente de F3 (entre 2 y 3 la API anterior falla en `exercises`: segundos).
4. Smoke test: login admin; pull con `catalog.exercises/gyms/exerciseGyms`; un usuario normal recibe el catálogo y recibe 403 si intenta escribirlo.

**Rollback**: `down-catalog --apply` recupera la tabla por usuario (los cambios hechos al catálogo después se pierden) + promover el despliegue anterior; o restaurar la rama de Neon.
**Cliente**: Dexie v3 (tablas `gyms`, `exerciseGyms`; solo añade). Los clientes antiguos siguen funcionando para sus datos (ignoran el catálogo nuevo) hasta actualizarse.
