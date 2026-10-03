# Gym Tracker

PWA offline-first (React + Vite + Dexie) con sincronización a Neon vía funciones serverless de Vercel.

## Desarrollo
- `npm run dev` — solo frontend (funciona 100 % offline con IndexedDB; sin sync).
- `vercel dev` — frontend + `/api` (necesita `.env`, ver `.env.example`).
- `npm test` — tests de progresión, unidades y estadísticas.
- `npm run db:push` — aplica `db/schema.ts` a la base de Neon (usa `DATABASE_URL` de `.env`).

## Variables de entorno
`DATABASE_URL`, `APP_PASSWORD` (contraseña única de la app), `AUTH_SECRET` (firma de tokens).

## Sync
Cada fila lleva `updatedAt` y `deletedAt` (last-write-wins, borrado lógico). El cliente encola cambios en `outbox`
y hace `push` + `pull` (`/api/sync/*`). El reloj/Android usarán este mismo contrato.
