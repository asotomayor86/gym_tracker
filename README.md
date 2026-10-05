# Gym Tracker

PWA offline-first para seguir entrenamientos de gimnasio: catálogo de ejercicios con ficha animada, rutinas, sesiones con
esfuerzo por serie y progresión sugerida, estadísticas por grupo muscular y control de peso y composición corporal.

- **Producción**: https://gymtracker-nu-ivory.vercel.app
- **Stack**: React 19 + Vite + TypeScript, Dexie (IndexedDB), Tailwind v4, vite-plugin-pwa; funciones serverless de Vercel
  (`/api`), Postgres en Neon con Drizzle.
- Historial de lo construido, migraciones de producción y lecciones: [docs/CAMBIOS.md](docs/CAMBIOS.md).

> Este repositorio es **público**: no subas datos personales (fotos, capturas de báscula, valores de salud) ni secretos.
> `documents/`, `inspire/`, `.env` y `public/ocr/` están ignorados.

## Desarrollo

| Comando | Qué hace |
|---|---|
| `npm run dev` | Solo frontend (usa IndexedDB; sin API). Copia los ficheros de OCR a `public/ocr` (`predev`). |
| `vercel dev` | Frontend + `/api` (necesita `.env`, ver `.env.example`). |
| `npm test` | Suite de Vitest (lógica, anatomía de las fichas, servidor sobre PGlite). |
| `npm run build` | `tsc -b` + `vite build` (+ copia de OCR en `prebuild`). |
| `npx oxlint` | Lint. |

> En Windows, `vite` se cierra si su entrada estándar se corta: lánzalo en su propia ventana de consola.

## Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `DATABASE_URL` | Vercel y `.env` | Conexión a Neon (pooler) |
| `DATABASE_URL_UNPOOLED` | `.env` | Conexión directa, para migraciones |
| `AUTH_SECRET` | Vercel y `.env` | Firma de los tokens de acceso (≥ 16 caracteres) |
| `APP_ORIGIN` | Vercel | Dominio de los enlaces de invitación |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | solo `.env` local | Crear la cuenta de administrador (`scripts/bootstrap-admin.ts`) |

`APP_PASSWORD` (contraseña única antigua) ya no se usa.

## Arquitectura

- **Cliente local-first**: Dexie es la fuente de verdad. Cada cambio pasa por `save()` / `remove()` (`src/db/db.ts`), que escribe
  la fila y la encola en `outbox`. El motor de sincronización (`src/lib/syncEngine.ts`) hace push y pull (last-write-wins por
  `updatedAt`, borrado lógico con `deletedAt`).
- **Datos por usuario** (sincronizan por `/api/sync/*`; `user_id` sale siempre del token): rutinas, filas de rutina, sesiones,
  series, biométricos, peso y composición corporal (`body_weights`), preferencias (`user_prefs`).
- **Catálogo global** (solo lo escribe el administrador): ejercicios (con `nameEn`), gimnasios y disponibilidad ejercicio×gimnasio.
  La semilla (`src/lib/seed.ts`, `gymData.ts`) viaja empaquetada para funcionar sin red.
- **Auth** (`api/_lib/authService.ts`): correo + contraseña (`scrypt`), JWT de 15 min comprobado contra la BD, refresh opaco
  rotatorio, registro solo por invitación. Contrato en [docs/contrato-auth-api.md](docs/contrato-auth-api.md) y diseño en
  [docs/diseno-usuarios-y-auth.md](docs/diseno-usuarios-y-auth.md).
- **Fichas animadas**: contrato `src/lib/guideTypes.ts`; datos en `exerciseGuides.ts`; render en `src/components/android/`
  (maniquí facetado, `poseAt`) con medidas en `rigSpec.ts`. `rigMotion.test.ts` vigila que ninguna articulación se mueva en un
  sentido imposible.
- **Importar la báscula**: `importImage` → OCR local (tesseract.js autoalojado en `/ocr`, carga perezosa) → importador
  (`src/lib/importers/`) → reglas de consistencia (`measurementRules.ts`) → revisión editable → `saveMeasurement`.
- **PWA**: service worker con actualización automática (`src/lib/swUpdate.ts`); versión visible en Ajustes.

## Estructura

```
api/            funciones serverless (auth, admin, sync) y _lib compartido
db/schema.ts    esquema Drizzle de Neon
scripts/        migraciones de producción (migrate-multiuser.ts), alta del admin, copia de OCR
src/components/ UI (android/ = maniquí y esquemas, auth/, admin/, body/, gym/, weight/)
src/lib/        lógica pura y de datos (sync, stats, progresión, fichas, importadores, OCR…)
src/pages/      pantallas
src/server/     tests de servidor (handlers reales sobre PGlite)
docs/           diseño, contratos, runbook de migración y registro de cambios
```

## Operaciones de producción

- **Migraciones**: siempre con copia previa (volcado JSON por la API + rama de Neon), en seco primero y luego `--apply`. Ver
  [docs/migracion-multiusuario.md](docs/migracion-multiusuario.md). No uses `drizzle-kit push` contra producción para cambios que
  no sean estrictamente aditivos (las tablas de usuario tienen clave primaria compuesta).
- **Despliegue**: Vercel despliega al hacer push a `main`. Comprueba que el despliegue queda en READY y haz una prueba de humo
  (login de administrador y sincronización).
- **Contraseña del administrador**: se crea con `npx tsx scripts/bootstrap-admin.ts` leyendo el `.env` local; `--reset-password`
  para recuperarla.

## Trabajo en equipo (agentes)

El proyecto se ha desarrollado con varias sesiones de Claude Code con roles: **COORDINADOR** (verifica, commit, push y
despliegue), **DISEÑADOR** (UI y esquemas), **PREPARADOR** (ejercicios, fichas y datos del gimnasio) y **ARQUITECTO** (datos,
sincronización, auth y migraciones). Cada uno commitea solo sus archivos con `git add` explícito.
