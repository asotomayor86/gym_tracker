# Diseño: usuarios, auth, catálogo global, gimnasios y peso corporal

Estado: **propuesta para aprobación** (sin código). Autor: ARQUITECTO. Fecha: 2026-10-04.

## 1. Decisión de autenticación

| Criterio | A. Neon Auth (gestionado) | B. Better Auth / Auth.js propio | **C. Propio mínimo (recomendado)** |
|---|---|---|---|
| Qué es | Better Auth gestionado por Neon, datos en esquema `neon_auth`, sesión por cookies HTTP-only | Librería completa en nuestras funciones | Tabla `users`, scrypt (`node:crypto`), JWT corto con `jose` (ya instalada) + refresh opaco rotatorio |
| Registro solo por invitación | No nativo (plugins de invitación: orgs "en curso"; los de terceros son alfa) | Con plugin de terceros (alfa) o a medida | A medida, ~60 líneas |
| Sin correo (reset por admin) | Los flujos están pensados para correo/OTP; el plugin admin existe, pero hay que encajarlo | Posible, con ajustes | Natural: el admin fija una contraseña temporal |
| Offline-first / PWA / futuros clientes (reloj, Android) | Cookies: limita clientes nativos y despliegues separados (documentado como no soportado) | Cookies o bearer, según configuración | Bearer + refresh en cuerpo: mismo contrato para PWA, reloj y Android |
| Dependencia y mantenimiento | Producto joven, bloqueo con Neon; migrar usuarios es costoso | Gran superficie, cambios de versión, adaptador Drizzle/neon-http sin transacciones | Poco código nuestro (≈300 líneas) pero **asumimos la seguridad**; se cubre con tests y checklist |
| Revocación | Gestionada | Gestionada | Tabla `auth_sessions` + `token_version` + `disabled`, comprobados en cada petición |

**Recomendación: C.** Es una app de pocos usuarios, el contrato debe servir a clientes no-web y las funciones clave (invitación única, reset por admin, sin email) no encajan limpiamente en A/B. Riesgo que se compensa: no inventamos criptografía (scrypt estándar, JWT con `jose`), con tests de aislamiento entre usuarios sobre PGlite (ya montado). Si en el futuro se quiere correo/OAuth, se puede migrar a B manteniendo `users.id`.

### Diseño de C
- **Contraseñas**: scrypt N=2^15, r=8, p=1, sal de 16 B, formato `scrypt$N$r$p$sal$hash`, `timingSafeEqual`. Para correos desconocidos se compara contra un hash falso (sin enumeración de usuarios). Política: 10–128 caracteres, distinta del correo, no en una lista corta de contraseñas comunes; sin reglas de composición arbitrarias.
- **Tokens**: acceso = JWT HS256 de 15 min `{sub, role, tv}`; refresh = 256 bits aleatorios, guardado solo como SHA-256 en `auth_sessions`, validez 90 d deslizante, **rotación en cada uso** con ventana de gracia de 30 s (dos pestañas) y revocación de la familia si se reutiliza uno viejo.
- **Cada petición protegida** hace 1 consulta a `users` (`disabled`, `token_version`) → desactivar a alguien o cambiar su contraseña corta el acceso de inmediato aunque el JWT siga vigente.
- **Cliente offline-first**: la app lee y escribe en local sin token. Un 401 por token de acceso caducado → refresh silencioso y reintento; solo un refresh inválido pasa a `unauth` (conservando el outbox, como hoy). Arrancar sin red no desconecta a nadie (se guarda `{id,email,role}` no secreto).
- **Rate limiting** (serverless → en BD, tabla `login_attempts`): 5 fallos/15 min por correo y 30/15 min por IP, bloqueo exponencial, `UPDATE … RETURNING` atómico. Mensajes de error genéricos.
- **Invitaciones**: código de 128 bits (`/#/invitacion/<código>`), solo se guarda su hash, un solo uso (`UPDATE … WHERE used_at IS NULL AND expires_at > now() RETURNING`), caducidad por defecto 7 días, rol fijado por el admin (por defecto `user`), opcionalmente ligada a un correo.
- **Reset por admin**: genera contraseña temporal (se muestra una vez), `must_change_password=true`, `token_version++` y revoca todas sus sesiones.
- **Cabeceras**: CSP estricta, HSTS, `X-Content-Type-Options` en `vercel.json` (el refresh vive en `localStorage`; el riesgo XSS se mitiga con CSP y sin HTML dinámico).
- Se elimina `APP_PASSWORD`. `AUTH_SECRET` se mantiene (firma JWT). Nuevas variables: `ADMIN_EMAIL`, `ADMIN_PASSWORD` (solo para el bootstrap; se puede borrar después).

## 2. Modelo de datos

Convención de sync (igual que hoy): `id text`, `updated_at bigint`, `deleted_at bigint`, `synced_at bigint` (servidor). Todas las claves `id` las genera el cliente (uuid) salvo las deterministas indicadas.

### Auth / administración (solo servidor, no sincronizan)
- `users(id uuid pk, email text unique lower(), password_hash, display_name, role 'admin'|'user', disabled bool, must_change_password bool, token_version int, created_at, last_login_at)`
- `auth_sessions(id pk, user_id fk, refresh_hash unique, prev_hash, prev_valid_until, device_label, created_at, last_used_at, expires_at, revoked_at)` — índice `(user_id)`, `(refresh_hash)`
- `invitations(id pk, code_hash unique, role, email_hint null, created_by fk, created_at, expires_at, used_at null, used_by null, revoked_at null)`
- `login_attempts(key pk, count, window_start, locked_until)`

### Datos por usuario (sincronizan; **PK compuesta `(user_id, id)`**)
`workout_templates`, `template_exercises`, `sessions`, `set_logs`, `biometrics` (existentes) + nuevas:
- `body_weights(user_id, id = 'bw-YYYY-MM-DD', date text, weight_kg real, note text, + sync)` — un registro por día, editable (mismo id → LWW), `unique(user_id, date)`. Se guarda en kg; la UI convierte según preferencia.
- `user_prefs(user_id, id = 'prefs', unit, increment_kg, gym_id null, + sync)` — sustituye a las preferencias de `localStorage` (que quedan como caché; la primera vez se vuelcan a la tabla).
- Índices: `(user_id, synced_at)` en todas; `set_logs(user_id, session_id)`.
- **Por qué la PK compuesta**: hoy `id` es PK global y el `setWhere` ignora en silencio escrituras de otro usuario. Con ids deterministas (`seed-tpl-*`, `seed-te-*`, `bw-*`, `prefs`) dos usuarios chocarían. Con `(user_id,id)` no.

### Catálogo global (solo lo edita el admin; `user_id` desaparece)
- `exercises(id, name, primary_muscle, secondary_muscles, equipment, notes, + sync)` — mismas columnas actuales sin `user_id`.
- `gyms(id, name, notes, sort, + sync)`.
- `exercise_gyms(id = '<exerciseId>:<gymId>', exercise_id, gym_id, available bool, + sync)` — fila explícita = el admin ha marcado; **ausencia = "sin verificar"** (se trata como disponible, con aviso suave). Modelo ampliable en fase 2 (marca/modelo de máquina, rango de peso, para el generador de planes).
- Índices: `(synced_at)`, `exercise_gyms(gym_id)`, `exercise_gyms(exercise_id)`.

## 3. API y sync

Para respetar el límite de 12 funciones de Vercel Hobby: `api/auth/[action].ts` (login, refresh, logout, logout-all, register, change-password, me), `api/admin/[resource].ts` (invitations, users, reset-password) y `api/sync/{push,pull}.ts`.

- **Identidad**: `user_id` sale SIEMPRE del token (`requireAuth` devuelve `{id, role}`), nunca del cuerpo. Toda consulta lleva `WHERE user_id = :id`. Tests de aislamiento con dos usuarios sobre PGlite (A no lee, escribe ni pisa filas de B).
- **push** `{changes: {tablaUsuario: [...]}, catalog?: {exercises, gyms, exerciseGyms}}`: las tablas de usuario se escriben bajo su `user_id`; el catálogo solo si `role = admin` (si no, se ignora y se informa en `rejected`). Además el servidor rechaza un ejercicio de catálogo cuyo nombre normalizado ya exista vivo con otro id (evita resucitar duplicados desde móviles antiguos).
- **pull** `?since=&catalogSince=` → `{changes, catalog, cursor, catalogCursor, hasMore?, token?}`. Dos cursores: el de usuario y el del catálogo (el catálogo cambia poco: respuesta casi vacía). Se añade paginación (`hasMore`) porque hoy `limit(5000)` trunca en silencio.
- **Cliente**: cursor por usuario (`gym-cursor:<userId>`) y de catálogo; tablas Dexie nuevas (`gyms`, `exerciseGyms`, `bodyWeights`, `userPrefs`; versión 2 del esquema). Para no admins las tablas de catálogo **no entran en el outbox** (solo lectura local). `save()` lo impide por tipo.
- **Catálogo y offline**: se siguen empaquetando las semillas (`buildSeedRows`) como catálogo inicial para que un dispositivo nuevo funcione sin red; sus ids `seed-ex-*` **coinciden con los del servidor** (ver migración). Cuando llega el catálogo real (`updatedAt` mayor) sustituye a la semilla (la lógica de `planSeed` ya lo hace). La disponibilidad por gimnasio solo existe tras el primer pull.
- **Cambio de usuario en un dispositivo**: se guarda el `ownerId` de la base local. Si inicia sesión otra cuenta, se avisa y se vacía lo local (pidiendo antes sincronizar o exportar); nunca se sube lo de una cuenta a otra. El dispositivo "heredado" (sin `ownerId`) solo puede reclamarlo la cuenta admin.

## 4. Filtro/aviso por gimnasio (primera entrega)
Preferencia `gym_id` en `user_prefs`. Al crear rutinas y sesiones, los ejercicios con `exercise_gyms.available = false` para ese gimnasio se ocultan o se marcan "no disponible en <gimnasio>" (con interruptor "mostrar todos"); los "sin verificar" se avisan en suave. Helper puro `availabilityFor(gymId)` con tests.

## 5. Migración de producción (con rollback)
0. **Copia**: rama de Neon `pre-multiusuario` (restauración instantánea) + volcado JSON de seguridad. Congelar cambios de otros agentes.
1. **Esquema aditivo** (`db:push` de lo nuevo; nada se borra aún): `users`, `auth_sessions`, `invitations`, `login_attempts`, `gyms`, `exercise_gyms`, `body_weights`, `user_prefs`. La API vieja sigue funcionando.
2. **Bootstrap del admin**: script idempotente que lee `ADMIN_EMAIL` (a.sotomayor.martinez@gmail.com) y `ADMIN_PASSWORD` de `.env`/Vercel y crea el usuario admin (hash scrypt). La contraseña no pasa por chat ni queda en el repo.
3. **Fusión y re-clave del catálogo (script servidor)**: reutiliza `planMerge` sobre las filas de Neon (hoy 70 ejercicios → 35), y re-clava el canónico de cada ejercicio al id `seed-ex-<slug>` actualizando `set_logs.exercise_id` y `template_exercises.exercise_id` (sin perder ninguna serie; informe previo de filas tocadas). Después se copian los 35 a la tabla de catálogo.
4. **Reasignar** `user_id = 'owner'` → id del admin en rutinas, sesiones, series y biométricos; PK compuesta; quitar `user_id` de `exercises`. Script inverso listo (`down.sql`).
5. **Desplegar API + cliente** (un solo despliegue de Vercel, atómico). Verificar con un smoke test (login admin, pull, push).
6. **Invitar** a los demás usuarios.

**Rollback**: antes del paso 4 basta con promover el despliegue anterior de Vercel (tablas aditivas). Después, restaurar la rama de Neon `pre-multiusuario` y promover el despliegue anterior; los datos creados entre medias se recuperan desde el volcado/outbox de los dispositivos (que no se vacían hasta confirmar el sync).

**Móvil con sesión antigua y outbox pendiente**: el token viejo (`sub: owner`) recibe 401 → la app pasa a "sin sesión" **conservando el outbox** (ya implementado). El usuario inicia sesión con correo y contraseña; como el dispositivo es "heredado" y la cuenta es la admin, se reclama, se reinicia el cursor y se sube todo el outbox bajo el admin. Antes de subir, el cliente aplica `planMerge` contra el catálogo recién descargado (re-apunta series de ids antiguos a `seed-ex-*`) y descarta del outbox las filas de `exercises` heredadas.

## 6. Admin
Panel (solo `role = admin`): invitaciones (crear/copiar enlace/revocar/ver estado), usuarios (listar, activar/desactivar, cambiar rol, restablecer contraseña, cerrar sesiones), gimnasios (CRUD) y catálogo + matriz de disponibilidad ejercicio×gimnasio.

## 7. Riesgos
1. **Seguridad propia**: mitigada con primitivas estándar, tests de aislamiento y revisión (`/security-review`) antes del despliegue.
2. **Migración de ids** (paso 3-4): irreversible sin la rama de Neon; por eso se prueba antes sobre una rama de Neon copia, y se muestra el recuento de filas.
3. **Dispositivos antiguos con datos de catálogo editados** que intenten subir (cubierto por el rechazo en servidor + purga del outbox).
4. **Límite de 12 funciones** (cubierto con rutas dinámicas) y **neon-http sin transacciones** (se usa `db.batch` o sentencias atómicas únicas).
5. **Contraseña admin**: si se pierde, el bootstrap puede repetirse con `--reset` ejecutado por el propietario.
6. **Sesión móvil caducada tras 90 d sin abrir**: hay que volver a iniciar sesión; el outbox se conserva.

## 8. Fases y reparto
| Fase | Contenido | Quién |
|---|---|---|
| F0 | Rama/copia de Neon, esquema aditivo, script bootstrap admin | ARQUITECTO (+COORDINADOR ejecuta contra Neon) |
| F1 | Auth backend (login, refresh, invitaciones, rate limit, revocación) + motor de sync con tokens | ARQUITECTO |
| F1-UI | Pantallas login, registro por invitación, cuenta/cambio de contraseña, avisos de sesión | DISEÑADOR |
| F2 | Datos por usuario (PK compuesta, `user_id` del token), scripts de fusión/re-clave y migración, tests de aislamiento | ARQUITECTO |
| **Hito** | **F0–F2 salen juntas en un solo despliegue** (la migración exige coordinación) | COORDINADOR |
| F3 | Catálogo global, gimnasios, disponibilidad: modelo, sync y permisos | ARQUITECTO |
| F3-datos | Lista de gimnasios y marcar disponibilidad por ejercicio en `seed.ts`/fichas | PREPARADOR (con los datos del usuario) |
| F3-UI | Panel admin de catálogo/gimnasios, filtro y avisos en rutinas/sesiones, selector de gimnasio | DISEÑADOR |
| F4 | Peso corporal: tabla, sync, funciones puras (media móvil, conversión) | ARQUITECTO |
| F4-UI | Registro diario y gráfico con media móvil | DISEÑADOR |
| F5 | Panel admin de invitaciones/usuarios (endpoints + pantallas) | ARQUITECTO + DISEÑADOR |

## 9. Decisiones del usuario (2026-10-04)
1. Auth propio (opción C): **confirmado**.
2. Cambio de cuenta en un dispositivo con datos de otra: **avisar y vaciar lo local** (pidiendo antes sincronizar si hay pendientes).
3. Invitaciones: **valen para cualquiera con el enlace** (un solo uso, 7 días); no se liga a correo.
4. Gimnasios iniciales: solo **Forus** (la disponibilidad por ejercicio la aporta PREPARADOR desde las fotos).
5. La rama de Neon `pre-multiusuario` la crea el usuario en la consola de Neon; hasta que la confirme no se ejecutan los pasos 3-4 de la migración. Se prueba antes en PGlite (tests) y, si el usuario crea una segunda rama, sobre esa copia. Antes de tocar producción se entrega el informe de filas.
