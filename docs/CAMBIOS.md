# Registro de cambios

Resumen de lo construido entre el **3 y el 4 de octubre de 2026** (93 commits). El detalle fino está en `git log`; aquí van los
bloques funcionales, las migraciones de producción, las lecciones aprendidas y lo pendiente.

> Repositorio PÚBLICO: no se guardan aquí datos personales (fotos, capturas, valores de salud) ni secretos. `documents/` e
> `inspire/` están en `.gitignore`.

## Estado actual

- **App**: PWA offline-first (React + Vite + TypeScript + Dexie), instalable, con actualización automática del service worker.
- **Backend**: funciones serverless de Vercel (`/api`) + Postgres en Neon (Drizzle). Producción: https://gymtracker-nu-ivory.vercel.app
- **Usuarios**: cuentas con correo y contraseña (auth propia), registro solo por invitación, roles `admin` / `user`.
- **Datos**: por usuario (sesiones, series, rutinas, peso, preferencias) + catálogo global (ejercicios, gimnasios, disponibilidad)
  editable solo por el administrador.
- **Unidad**: solo kilogramos.

## Cronología por bloques

### 1. Base de la aplicación (3 oct)
- PWA offline-first con IndexedDB (Dexie) y cola de cambios (`outbox`); sincronización con Neon por `push`/`pull`
  (`updatedAt` + `deletedAt`, last-write-wins, borrado lógico).
- Modelo: ejercicios, rutinas y sus filas, sesiones, series con esfuerzo (Fácil / Costó / Casi / Fallo), biométricos.
- Progresión sugerida (`suggestNext`) a partir del esfuerzo de la última sesión; estadísticas por grupo muscular.

### 2. Catálogo, rutinas y siembra automática
- Ejercicios y rutinas de máquina guiada; la importación manual se sustituyó por **siembra automática** al abrir la base
  (`ensureSeed`, ids deterministas `seed-ex-*`, sin resucitar borrados ni duplicar por nombre).
- **Fusión de duplicados** (`mergePlan`): determinista e idempotente; re-apunta referencias y marca los sobrantes como borrados.
- Grupo muscular nuevo `aductores`.

### 3. Fichas de ejercicio y esquema animado
- Contrato `guideTypes.ts` (contenido) ↔ componentes (`BodyMap`, `ExerciseDiagram`, `ExerciseGuideView`).
- Cada ejercicio tiene ficha: categoría, dificultad, músculos (`muscleIds`), preparación, ejecución, respiración, consejos,
  errores comunes, ritmo (`tempo`), fase de carga (`loadPhase`), pasos y esquema (`from/via/to`, `pose`, `view`, `elbow`, `trunk`,
  `hipAbduction`).
- Esquema animado en SVG con fases **concéntrica** (carga, naranja sólido) y **excéntrica** (control, punteada), músculos
  anclados a los huesos y vistas lateral / frontal / posterior.
- Humanoide: cinco rondas de diseño (v1–v5) hasta el **maniquí facetado blanco con articulación fina**; `rigSpec.ts` fija
  longitudes y posiciones; `poseAt` es una función pura con ángulos con signo por articulación.
- **Test anatómico permanente** (`rigMotion.test.ts`): 120 fotogramas por ficha, rodilla/codo solo en su sentido, rangos de
  hombro/cadera/tobillo, continuidad entre fotogramas y suelo/cabeza. Detecta regresiones como la rodilla invertida de los gemelos.
- Auditorías anatómicas: 28 fichas corregidas por estar fuera del alcance del rig; ejercicios boca abajo, colgados, de pie.

### 4. Diseño «Híbrido C» y logo
- Estilo cámara térmica (acero + ámbar), tarjetas de cristal, tipografías Unbounded e Instrument Sans (offline), fondo vivo,
  claro/oscuro, `prefers-reduced-motion`. Documento de referencia en `docs/design/`.
- Logo GymTracker (GT sobre barra), favicon, iconos de la PWA y `apple-touch-icon`.

### 5. Sincronización offline-first
- Motor con estados (`unauth`, `idle`, `syncing`, `ok`, `offline`, `error`), disparado al abrir, al volver la red, al volver
  a la pestaña, tras cada cambio (debounce) y con reintentos con espera creciente.
- Indicador visible, avisos de «sin sesión» y renovación automática del token.
- Test e2e con los handlers reales de `/api` sobre PGlite y dos «dispositivos» con IndexedDB separadas.

### 6. Sesión de entreno
- Esfuerzo en colores con icono (Fácil verde, Costó ámbar, Casi naranja, Fallo rojo).
- Orden de ejercicios = orden en que se añaden (`exerciseOrder`), con arrastrar y soltar en escritorio y botones ↑↓.
- **Cronómetro de descanso** grande (≈ mitad de pantalla, arriba): anillo, −15/+15 s, vibración, pitido WebAudio, pantalla encendida.
- **Último intento** por ejercicio: ventana con series, esfuerzo, sugerencia (subir / mantener / bajar / repetir), «Aplicar a las
  series» e historial de los últimos intentos (`attempts.ts`).
- **Crear rutina desde una sesión** (solo en la vista de sesión cerrada) y selector de ejercicios con filtros (gimnasio,
  grupo muscular, búsqueda).
- Nombres en inglés (`nameEn`) bajo el español y búsqueda bilingüe.
- Solo kilogramos (sin libras); `units.ts` reducido a `roundTo`. Columnas `unit` / `input_unit` se conservan por clientes antiguos.

### 7. Multiusuario, catálogo global y gimnasios
- Auth propia: `scrypt`, JWT de 15 min comprobado en BD en cada petición, refresh opaco rotatorio con detección de reutilización,
  límite de intentos, invitaciones de un solo uso (hash, 7 días), reset de contraseña por el administrador.
- Datos por usuario con **clave primaria compuesta** `(user_id, id)`; `user_id` siempre sale del token.
- Panel de administración (`/admin`): invitaciones, usuarios, gimnasios, catálogo y matriz de disponibilidad ejercicio×gimnasio.
- Catálogo **global** de ejercicios; gimnasio «Forus» con 23 ejercicios disponibles y 16 no (verificado con fotos del gimnasio);
  preferencia de gimnasio habitual con filtro y avisos.
- Revisión de seguridad del código de auth: sin vulnerabilidades de alta confianza; endurecimiento posterior (8 generaciones de
  hashes de refresh) y cabeceras CSP/HSTS en `vercel.json`.

### 8. Peso y composición corporal
- Peso diario con gráfica y media móvil de 7 días (`/peso` y Stats).
- **Importación de la báscula (Fitdays)**: 14 indicadores por **OCR local** (tesseract.js autoalojado en `/ocr`, carga perezosa, la
  imagen no sale del dispositivo ni se guarda), pasarela de importadores (`fitdaysEs`) que empareja por etiqueta, reglas de
  plausibilidad y consistencia (`measurementRules.ts`) y pantalla de revisión editable antes de guardar. Una medición por día.
- Gráficas por métrica y resumen de la última medición.

### 9. PWA
- `registerType: 'autoUpdate'` con registro propio (`swUpdate.ts`): busca versión al abrir, al volver, al recuperar red y cada
  20 min; recarga sola salvo con un entreno en curso (banner «Nueva versión lista»). Versión y botón «Buscar actualización» en Ajustes.

## Migraciones de producción (Neon) aplicadas

Todas con copia JSON previa fuera del repo, ensayo en seco y aplicación en transacción. Scripts en `scripts/` (ver
`docs/migracion-multiusuario.md`).

| Fecha | Etapa | Qué hizo |
|---|---|---|
| 3 oct | `drizzle-kit push` | Tablas iniciales y columna `exercise_order` en `set_logs` |
| 4 oct | `schema` | 18 sentencias aditivas: usuarios, sesiones, invitaciones, intentos, gimnasios, peso, preferencias |
| 4 oct | `bootstrap-admin` | Cuenta de administrador (correo y contraseña desde `.env` local) |
| 4 oct | `data` | Re-clave del catálogo a `seed-ex-*`, reasignación de `owner` al admin y PK compuestas |
| 4 oct | `catalog` | Ejercicios pasan a catálogo global; gimnasio Forus y 39 filas de disponibilidad |
| 4 oct | `catalog-refresh` | Columna `name_en`, 3 ejercicios nuevos de cadera de pie y su disponibilidad |
| 4 oct | `body-composition` | 15 columnas opcionales de composición corporal en `body_weights` |

Reversión: `down-*` en el mismo script, rama de Neon `pre-multiusuario` (anterior a la migración a usuarios) y volcados JSON.

## Incidencias y lecciones

- **Controlador de Neon y tipos**: `array_agg` de `name[]` y los `bigint` llegan como texto; se castea a `text[]` y se normaliza
  (`pgArray`). Los tests con PGlite no lo detectaban: hay un test que imita node-postgres.
- **Despliegues**: promover una vista previa en Vercel devolvió 422; se despliega subiendo a `main`. Entre aplicar una migración
  incompatible y que termine el build, la API queda unos segundos inestable.
- **PWA**: pasar a `registerType: 'prompt'` rompió la cadena de actualización (la versión nueva quedaba en espera); se volvió a
  `autoUpdate`.
- **Vercel Hobby**: máximo 12 funciones; las rutas de auth y admin usan rutas dinámicas.
- **Servidor local**: `vite` se cierra si su entrada estándar se corta; se lanza en su propia ventana de consola.
- **Datos personales**: las fotos del gimnasio y la captura de la báscula están solo en `documents/` (ignorada). Los tests usan
  datos sintéticos.

## Pendiente

- **Compartir desde el menú de Android** (Web Share Target) hacia `/importar`: requiere decidir entre `injectManifest` o `importScripts`
  para el service worker sin romper la actualización automática.
- Borrar `APP_PASSWORD` de las variables de entorno de Vercel (ya no se usa en el código).
- Probar una invitación de punta a punta en una ventana de incógnito.
- Probar en un móvil real: OCR, cronómetro (pitido, vibración, pantalla encendida), filtro por gimnasio y gráfico de tendencia del último intento.
- Fase Android nativa (Capacitor) y app para Galaxy Watch 4: usarán el mismo contrato de sincronización.
- Mejoras opcionales del gráfico de progreso por ejercicio: fechas reales en el eje, mejor peso además de 1RM, eje sin exagerar diferencias.
