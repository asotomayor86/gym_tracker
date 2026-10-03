import type { Difficulty, ExerciseCategory, ExerciseGuide, Implement, MotionKind, MuscleId, Point, Pose, Tempo } from './guideTypes'
import type { MuscleGroup } from './types'

/**
 * Fichas de ejercicios de máquina. `key` = nombre EXACTO de seed.ts.
 *
 * Convenciones del esquema (vista lateral, el usuario mira hacia x=1):
 *  - Press de pecho: recorrido horizontal a la altura del pecho, [0.45,0.55] → [0.80,0.55].
 *  - Press inclinado: igual, pero termina más alto, [0.45,0.55] → [0.72,0.80].
 *  - Press de hombros / tirones verticales: recorrido vertical sobre la cabeza (x≈0.5).
 *  - Prensas y empujes de pierna: recorrido hacia delante y ligeramente arriba.
 *  - backAngle: 0 = respaldo vertical, 90 = tumbado. Sentado normal ≈ 10°, banco inclinado ≈ 45°.
 */

const d = (
  pose: Pose, backAngle: number, implement: Implement, motion: MotionKind,
  from: Point, to: Point, caption: string,
) => ({ pose, backAngle, implement, motion, from, to, caption })

type Guide = Omit<ExerciseGuide, 'key' | 'category' | 'difficulty' | 'primary' | 'secondary'>

const g = (
  key: string, category: ExerciseCategory, difficulty: Difficulty,
  primary: MuscleGroup[], secondary: MuscleGroup[], body: Guide,
): ExerciseGuide => ({ key, category, difficulty, primary, secondary, ...body })

const BASE: ExerciseGuide[] = [
  // ───────────── Piernas ─────────────
  g('Prensa de piernas', 'pierna', 1, ['cuadriceps'], ['gluteo'], {
    setup: [
      'Regula el respaldo para que la espalda baja quede apoyada.',
      'Coloca los pies a la anchura de los hombros, a media altura de la plataforma.',
      'Quita los seguros y deja la plataforma sostenida con las piernas.',
    ],
    execution: [
      'Baja la plataforma controlando hasta unos 90° de rodilla.',
      'Mantén la zona lumbar pegada al respaldo.',
      'Empuja con todo el pie sin bloquear las rodillas.',
      'Sube sin rebotar y repite.',
    ],
    breathing: 'Inspira al bajar y espira al empujar.',
    tips: [
      'Rodillas en línea con las puntas de los pies.',
      'Más altura de pies carga más glúteo; más bajos, más cuádriceps.',
    ],
    mistakes: [
      'Despegar la pelvis del asiento al bajar demasiado.',
      'Bloquear las rodillas arriba.',
      'Juntar las rodillas al empujar.',
      'Rebotar abajo con la plataforma.',
    ],
    diagram: d('sentado-reclinado', 45, 'maquina', 'empuje', [0.55, 0.35], [0.9, 0.55], 'Empuja la plataforma hacia delante'),
  }),

  g('Hack squat', 'pierna', 2, ['cuadriceps'], ['gluteo'], {
    setup: [
      'Apoya espalda y hombros contra el respaldo inclinado.',
      'Coloca los pies a la anchura de los hombros, algo adelantados.',
      'Libera los seguros con las piernas casi estiradas.',
    ],
    execution: [
      'Baja flexionando rodillas y cadera de forma controlada.',
      'Llega a unos 90° de rodilla o hasta tu rango cómodo.',
      'Empuja con el pie entero para subir.',
      'Detente antes de bloquear las rodillas.',
    ],
    breathing: 'Inspira al bajar y espira al subir.',
    tips: [
      'Mantén los talones apoyados todo el recorrido.',
      'Pies más adelantados reducen la tensión en rodillas.',
    ],
    mistakes: [
      'Levantar los talones.',
      'Dejar caer las rodillas hacia dentro.',
      'Despegar la espalda del respaldo.',
      'Bajar de golpe sin control.',
    ],
    diagram: d('de-pie', 20, 'maquina', 'sentadilla', [0.5, 0.45], [0.5, 0.8], 'Baja y sube con la espalda apoyada'),
  }),

  g('Sentadilla en multipower', 'pierna', 2, ['cuadriceps'], ['gluteo', 'core'], {
    setup: [
      'Ajusta la barra a la altura de los hombros y colócala sobre el trapecio.',
      'Adelanta los pies unos 20–30 cm respecto a la barra.',
      'Gira la barra para soltar los ganchos.',
    ],
    execution: [
      'Baja flexionando rodillas y cadera a la vez.',
      'Desciende hasta que los muslos queden casi paralelos al suelo.',
      'Empuja el suelo con todo el pie para subir.',
      'Termina de pie sin bloquear de golpe las rodillas.',
    ],
    breathing: 'Inspira arriba, aguanta el aire al bajar y espira al subir.',
    tips: [
      'Aprieta el abdomen durante todo el movimiento.',
      'Mira al frente con el cuello neutro.',
    ],
    mistakes: [
      'Pies pegados bajo la barra: carga de más las rodillas.',
      'Redondear la espalda baja al fondo.',
      'Rodillas hacia dentro al subir.',
      'Olvidar los seguros al terminar la serie.',
    ],
    diagram: d('de-pie', 0, 'multipower', 'sentadilla', [0.5, 0.85], [0.5, 0.55], 'Baja y sube guiado por la barra'),
  }),

  g('Extensión de cuádriceps', 'aislamiento', 1, ['cuadriceps'], [], {
    setup: [
      'Ajusta el respaldo para que las rodillas queden alineadas con el eje de giro.',
      'Coloca el rodillo sobre los tobillos, justo encima del empeine.',
      'Agarra las asas y apoya la espalda.',
    ],
    execution: [
      'Estira las piernas hasta casi bloquear las rodillas.',
      'Aprieta el cuádriceps un segundo arriba.',
      'Baja despacio sin apoyar la pila de peso.',
    ],
    breathing: 'Espira al estirar e inspira al bajar.',
    tips: [
      'Sube en 1 s y baja en 2–3 s.',
      'Mantén las caderas pegadas al asiento.',
    ],
    mistakes: [
      'Dar impulso con el cuerpo.',
      'Soltar el peso de golpe al bajar.',
      'Elevar las caderas del asiento.',
      'Usar demasiado peso y acortar el recorrido.',
    ],
    diagram: d('sentado', 10, 'maquina', 'extension', [0.6, 0.3], [0.9, 0.5], 'Estira las rodillas'),
  }),

  g('Curl femoral tumbado', 'aislamiento', 1, ['isquios'], [], {
    setup: [
      'Túmbate boca abajo con las rodillas justo fuera del borde del banco.',
      'Coloca el rodillo sobre el tendón de Aquiles, encima del talón.',
      'Agarra las asas y mantén las caderas pegadas al banco.',
    ],
    execution: [
      'Flexiona las rodillas llevando los talones hacia los glúteos.',
      'Aprieta los isquios un instante arriba.',
      'Baja despacio hasta casi estirar las piernas.',
    ],
    breathing: 'Espira al flexionar e inspira al volver.',
    tips: [
      'Mantén los pies en flexión neutra.',
      'No pierdas tensión abajo entre repeticiones.',
    ],
    mistakes: [
      'Levantar las caderas del banco.',
      'Arquear la espalda baja.',
      'Dejar caer el peso en la bajada.',
      'Acortar el recorrido por exceso de carga.',
    ],
    diagram: d('prono', 90, 'maquina', 'flexion', [0.8, 0.25], [0.35, 0.45], 'Lleva los talones a los glúteos'),
  }),

  g('Curl femoral sentado', 'aislamiento', 1, ['isquios'], [], {
    setup: [
      'Ajusta el respaldo para alinear las rodillas con el eje de la máquina.',
      'Coloca el rodillo bajo los tobillos y baja el cojín sobre los muslos.',
      'Siéntate con la espalda pegada al respaldo.',
    ],
    execution: [
      'Empuja los talones hacia abajo y atrás flexionando las rodillas.',
      'Aprieta los isquios al final del recorrido.',
      'Vuelve despacio sin perder la tensión.',
    ],
    breathing: 'Espira al flexionar e inspira al volver.',
    tips: [
      'El cojín de muslos debe fijar las piernas sin dolor.',
      'Controla la fase de vuelta durante 2–3 s.',
    ],
    mistakes: [
      'Despegar la espalda del respaldo.',
      'Usar impulso del tronco.',
      'Dejar subir el peso de golpe.',
      'Regular mal el eje y forzar las rodillas.',
    ],
    diagram: d('sentado', 10, 'maquina', 'flexion', [0.85, 0.4], [0.5, 0.2], 'Flexiona las rodillas hacia atrás'),
  }),

  g('Abductores en máquina', 'aislamiento', 1, ['gluteo'], [], {
    setup: [
      'Siéntate con la espalda apoyada y los cojines por fuera de las rodillas.',
      'Ajusta la apertura inicial a un rango cómodo.',
      'Agarra las asas laterales.',
    ],
    execution: [
      'Abre las piernas empujando los cojines hacia fuera.',
      'Mantén un segundo la apertura máxima.',
      'Cierra despacio sin chocar las pilas.',
    ],
    breathing: 'Espira al abrir e inspira al cerrar.',
    tips: [
      'Inclinar el tronco ligeramente adelante implica más glúteo medio.',
      'Evita rebotar al volver.',
    ],
    mistakes: [
      'Balancear el tronco para abrir.',
      'Soltar el peso al cerrar.',
      'Elegir una apertura inicial que fuerce las caderas.',
      'Hacer repeticiones muy rápidas.',
    ],
    diagram: d('sentado', 10, 'maquina', 'apertura', [0.6, 0.35], [0.6, 0.35], 'Abre las piernas hacia los lados'),
  }),

  g('Aductores en máquina', 'aislamiento', 1, ['cuadriceps'], [], {
    setup: [
      'Siéntate con la espalda apoyada y los cojines por dentro de las rodillas.',
      'Ajusta la apertura inicial para no forzar la cadera.',
      'Agarra las asas.',
    ],
    execution: [
      'Junta las piernas apretando la cara interna del muslo.',
      'Mantén un segundo con las piernas cerradas.',
      'Abre despacio hasta la posición inicial.',
    ],
    breathing: 'Espira al cerrar e inspira al abrir.',
    tips: [
      'Trabaja la zona interna del muslo (aductores).',
      'Empieza con poco peso: la zona es sensible.',
    ],
    mistakes: [
      'Abrir demasiado y tirar de la ingle.',
      'Dar tirones al empezar.',
      'Dejar que las pilas choquen al abrir.',
      'Inclinar el tronco para ayudarse.',
    ],
    diagram: d('sentado', 10, 'maquina', 'apertura', [0.6, 0.35], [0.6, 0.35], 'Junta las piernas'),
  }),

  g('Patada de glúteo en máquina', 'aislamiento', 1, ['gluteo'], ['isquios'], {
    setup: [
      'Apoya el pecho en el soporte y agarra las asas.',
      'Coloca la parte trasera del talón o la planta sobre la plataforma.',
      'Ajusta la altura para que la cadera quede alineada con el eje.',
    ],
    execution: [
      'Empuja la plataforma hacia atrás estirando la cadera.',
      'Aprieta el glúteo al final sin arquear la espalda.',
      'Vuelve despacio sin perder la tensión.',
    ],
    breathing: 'Espira al empujar e inspira al volver.',
    tips: [
      'Mantén el abdomen firme.',
      'Piensa en llevar el talón al techo, no la cadera.',
    ],
    mistakes: [
      'Arquear la zona lumbar para ganar recorrido.',
      'Girar la cadera hacia fuera.',
      'Dar impulso con el cuerpo.',
      'Soltar la plataforma al volver.',
    ],
    diagram: d('de-pie', 20, 'maquina', 'extension', [0.45, 0.35], [0.2, 0.5], 'Empuja hacia atrás con la cadera'),
  }),

  g('Hip thrust en máquina', 'pierna', 2, ['gluteo'], ['isquios'], {
    setup: [
      'Apoya la parte alta de la espalda en el banco.',
      'Ajusta el cinturón o la barra sobre la cadera, con almohadilla.',
      'Pies a la anchura de la cadera, con la espinilla vertical arriba.',
    ],
    execution: [
      'Empuja los talones y sube la cadera hasta alinear tronco y muslos.',
      'Aprieta los glúteos un segundo arriba.',
      'Baja despacio sin apoyar del todo la cadera.',
    ],
    breathing: 'Espira al subir e inspira al bajar.',
    tips: [
      'Mantén la barbilla hacia el pecho para no arquear.',
      'Mira al frente, no al techo.',
    ],
    mistakes: [
      'Hiperextender la zona lumbar arriba.',
      'Empujar con las puntas de los pies.',
      'Dejar caer las rodillas hacia dentro.',
      'Rebotar abajo.',
    ],
    diagram: d('tumbado', 90, 'maquina', 'bisagra', [0.5, 0.2], [0.5, 0.45], 'Eleva la cadera hasta la línea del tronco'),
  }),

  g('Elevación de gemelos sentado', 'aislamiento', 1, ['gemelo'], [], {
    setup: [
      'Siéntate con las rodillas a unos 90° y baja las almohadillas sobre los muslos, cerca de la rodilla.',
      'Apoya solo el antepié en la plataforma, con los talones fuera.',
      'Libera el seguro dejando los talones por debajo.',
    ],
    execution: [
      'Mantén muslos y rodillas quietos.',
      'Baja los talones hasta notar el estiramiento y pausa 1 s.',
      'Extiende solo los tobillos para subir de puntillas.',
      'Pausa 1 s arriba apretando el gemelo y baja despacio.',
    ],
    breathing: 'Espira al subir e inspira al bajar.',
    tips: [
      'Recorrido completo: es la clave en el gemelo.',
      'Solo se mueve el tobillo.',
      'Pies rectos o ligeramente abiertos.',
    ],
    mistakes: [
      'Hacer rebotes cortos sin estiramiento.',
      'Subir con prisa sin pausa arriba.',
      'Levantar los muslos o mover las rodillas.',
      'Apoyar solo el borde externo del pie.',
    ],
    diagram: d('sentado', 10, 'maquina', 'elevacion', [0.8, 0.2], [0.8, 0.28], 'Sube de puntillas'),
  }),

  g('Elevación de gemelos en prensa', 'aislamiento', 1, ['gemelo'], [], {
    setup: [
      'Siéntate en la prensa con la espalda y la cadera bien apoyadas.',
      'Coloca solo el antepié en la parte baja de la plataforma, con los talones fuera.',
      'Estira las piernas hasta dejar una ligera flexión de rodilla (5–10°) y quita los seguros.',
    ],
    execution: [
      'Mantén cadera y rodillas quietas, con las piernas casi rectas.',
      'Deja bajar los talones hasta notar el estiramiento del gemelo.',
      'Pausa 1 s abajo, sin rebotar.',
      'Empuja con la punta de los pies extendiendo solo los tobillos.',
      'Pausa 1 s arriba apretando el gemelo y baja despacio.',
    ],
    breathing: 'Espira al empujar e inspira al volver.',
    tips: [
      'Solo se mueven los tobillos: cadera y rodillas no cambian.',
      'Recorrido completo: estiramiento abajo y contracción arriba.',
      'Empieza con menos peso que en la prensa normal.',
    ],
    mistakes: [
      'Bloquear las rodillas con la carga.',
      'Flexionar y extender las rodillas para mover el peso.',
      'Rebotar abajo en lugar de pausar en el estiramiento.',
      'Acortar el recorrido sin estirar ni apretar.',
      'Apoyar los pies a medias y resbalar.',
    ],
    diagram: d('sentado-reclinado', 45, 'maquina', 'elevacion', [0.85, 0.5], [0.9, 0.55], 'Extiende solo los tobillos'),
  }),

  // ───────────── Pecho ─────────────
  g('Press de pecho en máquina', 'empuje', 1, ['pecho'], ['triceps', 'hombro'], {
    setup: [
      'Ajusta el asiento para que las asas queden a la altura del pecho.',
      'Apoya la espalda y los hombros en el respaldo.',
      'Agarra las asas con las muñecas rectas.',
    ],
    execution: [
      'Empuja las asas hacia delante hasta casi estirar los brazos.',
      'Aprieta el pecho sin bloquear los codos.',
      'Vuelve despacio hasta notar el estiramiento.',
    ],
    breathing: 'Espira al empujar e inspira al volver.',
    tips: [
      'Escápulas hacia atrás y abajo, pecho alto.',
      'Codos a unos 45–70° del tronco.',
    ],
    mistakes: [
      'Encoger los hombros hacia las orejas.',
      'Despegar la espalda del respaldo.',
      'Bloquear los codos arriba.',
      'Dejar caer el peso al volver.',
    ],
    diagram: d('sentado', 10, 'maquina', 'empuje', [0.45, 0.55], [0.8, 0.55], 'Empuja hacia delante a la altura del pecho'),
  }),

  g('Press inclinado en máquina', 'empuje', 1, ['pecho'], ['hombro', 'triceps'], {
    setup: [
      'Ajusta el asiento para que las asas queden a la altura de la parte alta del pecho.',
      'Apoya la espalda en el respaldo inclinado.',
      'Agarra las asas con las muñecas rectas.',
    ],
    execution: [
      'Empuja hacia delante y arriba hasta casi estirar los brazos.',
      'Aprieta la parte alta del pecho.',
      'Vuelve despacio hasta estirar el pecho.',
    ],
    breathing: 'Espira al empujar e inspira al volver.',
    tips: [
      'Mantén los hombros bajos y atrás.',
      'No subas las asas más allá de la línea de la clavícula.',
    ],
    mistakes: [
      'Elevar los hombros y cargar el deltoides.',
      'Arquear la espalda baja.',
      'Abrir demasiado los codos.',
      'Hacer el recorrido a medias.',
    ],
    diagram: d('sentado-reclinado', 45, 'maquina', 'empuje', [0.45, 0.55], [0.72, 0.8], 'Empuja hacia delante y arriba'),
  }),

  g('Press banca en multipower', 'empuje', 2, ['pecho'], ['triceps', 'hombro'], {
    setup: [
      'Túmbate con los ojos bajo la barra y pies firmes en el suelo.',
      'Agarra la barra algo más ancha que los hombros.',
      'Gira la muñeca para soltar los ganchos.',
    ],
    execution: [
      'Baja la barra de forma controlada hasta rozar el pecho.',
      'Mantén los codos a unos 45–70° del tronco.',
      'Empuja la barra hacia arriba hasta casi estirar los brazos.',
      'Gira para enganchar al terminar la serie.',
    ],
    breathing: 'Inspira al bajar y espira al subir.',
    tips: [
      'Mantén escápulas juntas y pegadas al banco.',
      'La barra baja a la altura de la mitad del pecho.',
    ],
    mistakes: [
      'Rebotar la barra en el pecho.',
      'Despegar glúteos o cabeza del banco.',
      'Abrir los codos a 90°.',
      'Hacer la serie sin seguros de apoyo.',
    ],
    diagram: d('tumbado', 90, 'multipower', 'empuje', [0.5, 0.4], [0.5, 0.75], 'Baja al pecho y empuja hacia arriba'),
  }),

  g('Peck deck (aperturas en máquina)', 'aislamiento', 1, ['pecho'], ['hombro'], {
    setup: [
      'Ajusta el asiento para que las asas queden a la altura del pecho.',
      'Apoya espalda y cabeza en el respaldo.',
      'Agarra las asas con los codos ligeramente flexionados.',
    ],
    execution: [
      'Junta las asas delante del pecho en un arco.',
      'Aprieta el pecho un segundo.',
      'Abre despacio hasta notar el estiramiento sin pasar la línea de los hombros.',
    ],
    breathing: 'Espira al juntar e inspira al abrir.',
    tips: [
      'Imagina abrazar un árbol, con el ángulo del codo fijo.',
      'Hombros bajos y alejados de las orejas.',
    ],
    mistakes: [
      'Abrir demasiado los brazos hacia atrás.',
      'Convertir el gesto en un press.',
      'Despegar la espalda.',
      'Usar peso que impide controlar la apertura.',
    ],
    diagram: d('sentado', 10, 'maquina', 'apertura', [0.35, 0.55], [0.8, 0.55], 'Junta los brazos delante del pecho'),
  }),

  g('Cruce de poleas', 'aislamiento', 2, ['pecho'], ['hombro'], {
    setup: [
      'Coloca las poleas altas y agarra un asa con cada mano.',
      'Da un paso adelante con un pie y inclina ligeramente el tronco.',
      'Empieza con los brazos abiertos y los codos algo flexionados.',
    ],
    execution: [
      'Lleva las manos hacia delante y abajo en un arco.',
      'Cruza las manos delante del abdomen y aprieta el pecho.',
      'Vuelve despacio hasta notar el estiramiento.',
    ],
    breathing: 'Espira al cruzar e inspira al abrir.',
    tips: [
      'Mantén el ángulo del codo constante.',
      'Estabiliza el tronco: no balancees.',
    ],
    mistakes: [
      'Flexionar y extender los codos como en un press.',
      'Balancear el cuerpo para mover el peso.',
      'Abrir demasiado y sobrecargar el hombro.',
      'Soltar la tensión al volver.',
    ],
    diagram: d('de-pie', 15, 'polea', 'apertura', [0.4, 0.8], [0.75, 0.5], 'Cruza las manos delante del abdomen'),
  }),

  g('Fondos asistidos en máquina', 'empuje', 2, ['pecho'], ['triceps', 'hombro'], {
    setup: [
      'Selecciona la asistencia: más peso en la pila significa más ayuda.',
      'Arrodíllate o sube al apoyo y agarra las asas de fondos.',
      'Inclina el tronco ligeramente hacia delante para enfatizar el pecho.',
    ],
    execution: [
      'Baja flexionando los codos hasta unos 90°.',
      'Mantén los codos ligeramente abiertos.',
      'Empuja las asas hasta casi estirar los brazos.',
    ],
    breathing: 'Inspira al bajar y espira al subir.',
    tips: [
      'Hombros lejos de las orejas.',
      'Reduce la asistencia gradualmente al progresar.',
    ],
    mistakes: [
      'Bajar demasiado y castigar el hombro.',
      'Encoger los hombros.',
      'Balancear las piernas.',
      'Rebotar abajo.',
    ],
    diagram: d('colgado', 10, 'maquina', 'empuje', [0.5, 0.45], [0.5, 0.75], 'Empuja el cuerpo hacia arriba'),
  }),

  // ───────────── Hombros ─────────────
  g('Press de hombros en máquina', 'empuje', 1, ['hombro'], ['triceps'], {
    setup: [
      'Ajusta el asiento para que las asas empiecen a la altura de los hombros.',
      'Apoya la espalda en el respaldo.',
      'Agarra las asas con las muñecas rectas.',
    ],
    execution: [
      'Empuja las asas hacia arriba hasta casi estirar los brazos.',
      'Mantén los codos ligeramente adelantados al tronco.',
      'Baja despacio hasta la altura de las orejas.',
    ],
    breathing: 'Espira al empujar e inspira al bajar.',
    tips: [
      'Abdomen firme y lumbar neutra.',
      'Hombros lejos de las orejas arriba.',
    ],
    mistakes: [
      'Arquear la espalda baja al empujar.',
      'Bloquear los codos arriba.',
      'Encoger los hombros.',
      'Hacer repeticiones cortas sin bajar bien.',
    ],
    diagram: d('sentado', 5, 'maquina', 'empuje', [0.5, 0.7], [0.5, 0.95], 'Empuja hacia arriba sobre la cabeza'),
  }),

  g('Elevaciones laterales en máquina', 'aislamiento', 1, ['hombro'], [], {
    setup: [
      'Ajusta el asiento para que los codos queden a la altura del eje.',
      'Coloca los antebrazos o las manos tras los cojines.',
      'Apoya la espalda en el respaldo.',
    ],
    execution: [
      'Levanta los brazos hacia los lados hasta la altura de los hombros.',
      'Lidera con los codos, no con las manos.',
      'Baja despacio sin apoyar la pila.',
    ],
    breathing: 'Espira al subir e inspira al bajar.',
    tips: [
      'Hombros bajos, sin encoger.',
      'No subas más allá de la horizontal.',
    ],
    mistakes: [
      'Encoger los trapecios al subir.',
      'Dar impulso con el tronco.',
      'Subir por encima de los hombros.',
      'Dejar caer el peso de golpe.',
    ],
    diagram: d('sentado', 5, 'maquina', 'elevacion', [0.5, 0.45], [0.5, 0.7], 'Eleva los brazos a los lados'),
  }),

  g('Elevaciones laterales en polea', 'aislamiento', 2, ['hombro'], [], {
    setup: [
      'Coloca la polea baja y agarra el asa con la mano contraria.',
      'Colócate de lado con el cable cruzando delante del cuerpo.',
      'Agárrate a un punto fijo con la otra mano si lo necesitas.',
    ],
    execution: [
      'Levanta el brazo hacia el lateral con el codo ligeramente flexionado.',
      'Sube hasta la altura del hombro.',
      'Baja lentamente manteniendo la tensión del cable.',
    ],
    breathing: 'Espira al subir e inspira al bajar.',
    tips: [
      'La polea mantiene la tensión desde abajo.',
      'Haz todas las repeticiones de un brazo antes de cambiar.',
    ],
    mistakes: [
      'Balancear el cuerpo para subir.',
      'Subir con la muñeca por delante del codo.',
      'Encoger el hombro.',
      'Soltar la tensión abajo.',
    ],
    diagram: d('de-pie', 0, 'polea', 'elevacion', [0.5, 0.35], [0.6, 0.7], 'Eleva el brazo hacia el lateral'),
  }),

  g('Pájaros en peck deck (deltoides posterior)', 'aislamiento', 1, ['hombro'], ['espalda'], {
    setup: [
      'Siéntate mirando al respaldo con el pecho apoyado en el cojín.',
      'Ajusta el asiento para que las asas queden a la altura de los hombros.',
      'Agarra las asas con los codos ligeramente flexionados.',
    ],
    execution: [
      'Abre los brazos hacia atrás hasta alinearlos con el tronco.',
      'Aprieta la parte trasera del hombro y entre las escápulas.',
      'Vuelve despacio sin perder la tensión.',
    ],
    breathing: 'Espira al abrir e inspira al volver.',
    tips: [
      'Lidera con los codos, no con las manos.',
      'Mantén el cuello relajado.',
    ],
    mistakes: [
      'Encoger los trapecios.',
      'Despegar el pecho del cojín para coger impulso.',
      'Pasar de la línea del tronco y forzar el hombro.',
      'Usar demasiado peso y reducir el recorrido.',
    ],
    diagram: d('sentado', 5, 'maquina', 'apertura', [0.8, 0.6], [0.35, 0.6], 'Abre los brazos hacia atrás'),
  }),

  g('Face pull en polea', 'tiron', 2, ['hombro'], ['espalda'], {
    setup: [
      'Coloca la polea a la altura de la cara con la cuerda.',
      'Agarra la cuerda con las palmas enfrentadas y da un paso atrás.',
      'Pies firmes, rodillas ligeramente flexionadas.',
    ],
    execution: [
      'Tira de la cuerda hacia la cara, separando las manos.',
      'Lleva los codos altos y atrás, a la altura de los hombros.',
      'Aprieta la parte trasera del hombro un segundo.',
      'Vuelve despacio con control.',
    ],
    breathing: 'Espira al tirar e inspira al volver.',
    tips: [
      'Usa poco peso y buena técnica.',
      'Los codos van por encima de las muñecas.',
    ],
    mistakes: [
      'Tirar hacia el pecho en lugar de la cara.',
      'Inclinarse hacia atrás para mover más peso.',
      'Bajar los codos al tirar.',
      'Encoger los trapecios.',
    ],
    diagram: d('de-pie', 0, 'polea', 'tiron', [0.8, 0.7], [0.45, 0.75], 'Tira hacia la cara con los codos altos'),
  }),

  // ───────────── Brazos ─────────────
  g('Curl de bíceps en máquina', 'aislamiento', 1, ['biceps'], ['antebrazo'], {
    setup: [
      'Ajusta el asiento para que los codos queden alineados con el eje.',
      'Apoya los brazos en el cojín.',
      'Agarra las asas con las palmas hacia arriba.',
    ],
    execution: [
      'Flexiona los codos llevando las asas hacia los hombros.',
      'Aprieta el bíceps un segundo arriba.',
      'Baja despacio hasta casi estirar los brazos.',
    ],
    breathing: 'Espira al subir e inspira al bajar.',
    tips: [
      'Mantén los codos fijos sobre el cojín.',
      'Baja en 2–3 s.',
    ],
    mistakes: [
      'Levantar los codos del cojín.',
      'Balancear el tronco.',
      'Soltar el peso al bajar.',
      'Recorrido incompleto abajo.',
    ],
    diagram: d('sentado', 10, 'maquina', 'curl', [0.7, 0.4], [0.55, 0.6], 'Flexiona los codos hacia los hombros'),
  }),

  g('Curl de bíceps en polea', 'aislamiento', 1, ['biceps'], ['antebrazo'], {
    setup: [
      'Coloca la polea baja con barra recta o Z.',
      'Colócate de pie cerca de la polea con los pies a la anchura de la cadera.',
      'Agarra la barra con las palmas hacia arriba.',
    ],
    execution: [
      'Flexiona los codos llevando la barra hacia los hombros.',
      'Mantén los codos pegados a los costados.',
      'Baja despacio hasta casi estirar los brazos.',
    ],
    breathing: 'Espira al subir e inspira al bajar.',
    tips: [
      'La polea mantiene tensión también abajo.',
      'Mantén el abdomen firme.',
    ],
    mistakes: [
      'Echar los codos hacia delante.',
      'Balancear el tronco.',
      'Encoger los hombros.',
      'Acortar el recorrido abajo.',
    ],
    diagram: d('de-pie', 0, 'polea', 'curl', [0.55, 0.4], [0.6, 0.65], 'Flexiona los codos'),
  }),

  g('Curl en banco Scott (máquina)', 'aislamiento', 2, ['biceps'], [], {
    setup: [
      'Ajusta el asiento para que las axilas queden sobre el borde del cojín.',
      'Apoya los brazos completos en el cojín.',
      'Agarra las asas con las palmas hacia arriba.',
    ],
    execution: [
      'Flexiona los codos hasta acercar las asas a los hombros.',
      'Aprieta el bíceps un segundo.',
      'Baja despacio sin llegar a bloquear los codos.',
    ],
    breathing: 'Espira al subir e inspira al bajar.',
    tips: [
      'El apoyo elimina la ayuda del cuerpo.',
      'Controla la parte baja para proteger el tendón.',
    ],
    mistakes: [
      'Estirar del todo y soltar el codo abajo.',
      'Levantar los codos del cojín.',
      'Encoger los hombros.',
      'Usar demasiado peso y rebotar.',
    ],
    diagram: d('sentado', 25, 'maquina', 'curl', [0.7, 0.35], [0.55, 0.6], 'Flexiona los codos sobre el apoyo'),
  }),

  g('Extensión de tríceps en polea (cuerda)', 'aislamiento', 1, ['triceps'], [], {
    setup: [
      'Coloca la polea alta con la cuerda.',
      'Colócate de pie frente a la polea, con los codos pegados al cuerpo.',
      'Agarra la cuerda con los antebrazos a unos 90°.',
    ],
    execution: [
      'Estira los codos empujando la cuerda hacia abajo.',
      'Separa las manos al final del recorrido.',
      'Aprieta el tríceps un segundo.',
      'Sube despacio hasta los 90°.',
    ],
    breathing: 'Espira al estirar e inspira al subir.',
    tips: [
      'Los codos no se mueven de los costados.',
      'Hombros abajo y abdomen firme.',
    ],
    mistakes: [
      'Mover los codos hacia delante y atrás.',
      'Inclinarse para empujar con el peso del cuerpo.',
      'Subir la cuerda por encima de los 90°.',
      'No estirar del todo el codo.',
    ],
    diagram: d('de-pie', 0, 'polea', 'extension', [0.55, 0.55], [0.55, 0.3], 'Estira los codos hacia abajo'),
  }),

  g('Extensión de tríceps en máquina', 'aislamiento', 1, ['triceps'], [], {
    setup: [
      'Ajusta el asiento para que los codos queden en línea con el eje.',
      'Apoya los brazos en el cojín y agarra las asas.',
      'Mantén la espalda recta contra el respaldo.',
    ],
    execution: [
      'Estira los codos empujando las asas hacia delante o abajo.',
      'Aprieta el tríceps al estirar.',
      'Vuelve despacio hasta unos 90°.',
    ],
    breathing: 'Espira al estirar e inspira al volver.',
    tips: [
      'Mantén los brazos apoyados todo el recorrido.',
      'No bloquees de golpe los codos.',
    ],
    mistakes: [
      'Separar los codos del cojín.',
      'Empujar con los hombros.',
      'Rebotar al volver.',
      'Peso excesivo con recorrido corto.',
    ],
    diagram: d('sentado', 10, 'maquina', 'extension', [0.5, 0.55], [0.7, 0.4], 'Estira los codos'),
  }),

  g('Press de tríceps en máquina (fondos)', 'empuje', 1, ['triceps'], ['pecho'], {
    setup: [
      'Ajusta el asiento para que las asas queden a la altura de las costillas.',
      'Mantén los codos pegados al cuerpo.',
      'Apoya la espalda y agarra las asas.',
    ],
    execution: [
      'Empuja las asas hacia abajo estirando los codos.',
      'Aprieta el tríceps al llegar abajo.',
      'Sube despacio hasta unos 90°.',
    ],
    breathing: 'Espira al empujar e inspira al subir.',
    tips: [
      'Codos cerca del cuerpo para centrar el trabajo en el tríceps.',
      'Hombros bajos.',
    ],
    mistakes: [
      'Abrir los codos hacia fuera.',
      'Encoger los hombros.',
      'Subir demasiado y castigar el hombro.',
      'Impulsarse con el cuerpo.',
    ],
    diagram: d('sentado', 10, 'maquina', 'empuje', [0.5, 0.55], [0.55, 0.3], 'Empuja las asas hacia abajo'),
  }),

  // ───────────── Espalda ─────────────
  g('Jalón al pecho', 'tiron', 1, ['espalda'], ['biceps'], {
    setup: [
      'Ajusta el rodillo para que los muslos queden fijos.',
      'Agarra la barra más ancha que los hombros con las palmas al frente.',
      'Inclina el tronco ligeramente hacia atrás.',
    ],
    execution: [
      'Baja los codos hacia los costados llevando la barra a la parte alta del pecho.',
      'Junta las escápulas y aprieta la espalda.',
      'Sube la barra despacio hasta estirar los brazos.',
    ],
    breathing: 'Espira al tirar e inspira al subir.',
    tips: [
      'Piensa en llevar los codos al suelo.',
      'Pecho alto y hombros lejos de las orejas.',
    ],
    mistakes: [
      'Tirar con los brazos en lugar de la espalda.',
      'Balancear el tronco hacia atrás.',
      'Bajar la barra por detrás de la nuca.',
      'Soltar la barra de golpe arriba.',
    ],
    diagram: d('sentado', 10, 'polea', 'tiron', [0.55, 0.95], [0.5, 0.65], 'Tira de la barra hacia el pecho'),
  }),

  g('Remo sentado en máquina', 'tiron', 1, ['espalda'], ['biceps'], {
    setup: [
      'Ajusta el asiento para que las asas queden a la altura del pecho.',
      'Apoya el pecho en el cojín.',
      'Agarra las asas con los brazos estirados.',
    ],
    execution: [
      'Tira de las asas hacia atrás llevando los codos junto al tronco.',
      'Junta las escápulas y aprieta un segundo.',
      'Vuelve despacio hasta estirar los brazos.',
    ],
    breathing: 'Espira al tirar e inspira al volver.',
    tips: [
      'Pecho firme contra el cojín.',
      'Hombros bajos, sin encogerlos.',
    ],
    mistakes: [
      'Encoger los hombros al tirar.',
      'Despegar el pecho del cojín.',
      'Tirar solo con los brazos.',
      'No estirar al volver.',
    ],
    diagram: d('sentado', 10, 'maquina', 'tiron', [0.8, 0.55], [0.4, 0.55], 'Tira de las asas hacia atrás'),
  }),

  g('Remo en polea baja', 'tiron', 1, ['espalda'], ['biceps'], {
    setup: [
      'Siéntate con los pies en los apoyos y las rodillas ligeramente flexionadas.',
      'Agarra el agarre con los brazos estirados.',
      'Mantén la espalda recta con el pecho alto.',
    ],
    execution: [
      'Tira del agarre hacia el abdomen.',
      'Lleva los codos atrás y junta las escápulas.',
      'Vuelve despacio estirando los brazos.',
    ],
    breathing: 'Espira al tirar e inspira al volver.',
    tips: [
      'El tronco casi no se mueve.',
      'Aprieta la espalda, no los brazos.',
    ],
    mistakes: [
      'Balancear el tronco hacia atrás.',
      'Redondear la espalda al estirar.',
      'Encoger los hombros.',
      'Tirar hacia el pecho en lugar del abdomen.',
    ],
    diagram: d('sentado', 5, 'polea', 'tiron', [0.85, 0.4], [0.45, 0.45], 'Tira del agarre hacia el abdomen'),
  }),

  g('Dominadas asistidas en máquina', 'tiron', 2, ['espalda'], ['biceps'], {
    setup: [
      'Selecciona la asistencia: más peso en la pila significa más ayuda.',
      'Apoya las rodillas o los pies en la plataforma.',
      'Agarra las asas algo más anchas que los hombros.',
    ],
    execution: [
      'Tira del cuerpo hacia arriba llevando los codos a los costados.',
      'Sube hasta que la barbilla supere las asas.',
      'Baja despacio hasta estirar los brazos.',
    ],
    breathing: 'Espira al subir e inspira al bajar.',
    tips: [
      'Inicia el gesto bajando las escápulas.',
      'Reduce la asistencia progresivamente.',
    ],
    mistakes: [
      'Balancear el cuerpo.',
      'Hacer medias repeticiones.',
      'Encoger los hombros.',
      'Dejarse caer abajo.',
    ],
    diagram: d('colgado', 0, 'maquina', 'tiron', [0.5, 0.35], [0.5, 0.8], 'Tira del cuerpo hacia arriba'),
  }),

  // ───────────── Core ─────────────
  g('Crunch en máquina', 'core', 1, ['core'], [], {
    setup: [
      'Ajusta el asiento para que el eje quede a la altura del abdomen.',
      'Sujeta las asas o apoya el pecho en el cojín.',
      'Mantén los pies firmes.',
    ],
    execution: [
      'Flexiona el tronco llevando el pecho hacia la cadera.',
      'Aprieta el abdomen un segundo.',
      'Vuelve despacio sin perder la tensión.',
    ],
    breathing: 'Espira al contraer e inspira al volver.',
    tips: [
      'Redondea la espalda, no tires de los brazos.',
      'Movimiento corto y controlado.',
    ],
    mistakes: [
      'Empujar con los brazos o las piernas.',
      'Ir demasiado rápido.',
      'Soltar el abdomen al volver.',
      'Usar demasiado peso.',
    ],
    diagram: d('sentado', 10, 'maquina', 'flexion', [0.5, 0.7], [0.6, 0.45], 'Flexiona el tronco hacia delante'),
  }),

  g('Crunch en polea', 'core', 2, ['core'], [], {
    setup: [
      'Coloca la polea alta con la cuerda.',
      'Arrodíllate de espaldas a la polea y agarra la cuerda junto a la cabeza.',
      'Mantén la cadera fija.',
    ],
    execution: [
      'Flexiona el tronco llevando los codos hacia las rodillas.',
      'Aprieta el abdomen un segundo.',
      'Vuelve despacio sin perder la tensión.',
    ],
    breathing: 'Espira al contraer e inspira al volver.',
    tips: [
      'Mueve la columna, no las caderas.',
      'Las manos casi no se mueven respecto a la cabeza.',
    ],
    mistakes: [
      'Tirar con los brazos.',
      'Sentarse hacia los talones.',
      'Usar demasiado peso.',
      'Perder la tensión arriba.',
    ],
    diagram: d('de-pie', 0, 'polea', 'flexion', [0.5, 0.8], [0.55, 0.45], 'Flexiona el tronco hacia el suelo'),
  }),
]

type Step3 = [string, string, string]
interface Motion { steps: Step3; via?: Point; from?: Point; to?: Point; limb?: 'brazo' | 'pierna'; elbow?: 'abajo' | 'arriba'; view?: 'lateral' | 'frontal' }

const CURL: Step3 = ['Brazos estirados', 'Flexiona los codos', 'Bíceps contraído']
const ROW: Step3 = ['Brazos estirados', 'Tira de los codos', 'Escápulas juntas']
const TRI: Step3 = ['Codos a 90°', 'Estira los codos', 'Brazos extendidos']
const SQUAT: Step3 = ['De pie', 'Baja controlado', 'Muslos paralelos']
const LEG_EXT: Step3 = ['Rodillas flexionadas', 'Estira las piernas', 'Piernas extendidas']
const LEG_CURL: Step3 = ['Piernas estiradas', 'Flexiona las rodillas', 'Talones al glúteo']
const RAISE: Step3 = ['Brazos abajo', 'Eleva los codos', 'Brazos horizontales']
const CRUNCH: Step3 = ['Tronco recto', 'Flexiona el tronco', 'Abdomen contraído']

/**
 * Animación: la mano/pie se mueve from → (via) → to y vuelve. `from` es la salida del recorrido y
 * `to` el final de la fase de trabajo. En abductores/aductores el movimiento real es lateral (no se
 * ve en vista lateral): from/to solo marcan apertura y cierre.
 *
 * Anclaje al esqueleto de ExerciseDiagram (x = (px-20)/180, y = (156-py)/150):
 *  - prono: cadera x≈0.44, y≈0.25; pies en reposo x≈0.03; hombro x≈0.72. Pierna estirada ≈78 px.
 *  - tumbado: hombro x≈0.12-0.27 (cabeza a la izquierda), cadera x≈0.40, y≈0.25.
 *  - colgado: hombro x≈0.49, y≈0.83; brazo estirado = 51 px hacia abajo.
 */
const MOTION: Record<string, Motion> = {
  'Prensa de piernas': { steps: ['Rodillas flexionadas', 'Empuja la plataforma', 'Piernas extendidas'], from: [0.567, 0.44], via: [0.628, 0.513], to: [0.7, 0.6], limb: 'pierna' },
  'Hack squat': { steps: SQUAT, from: [0.467, 0.033], via: [0.589, 0.167], to: [0.711, 0.3], limb: 'pierna' },
  'Sentadilla en multipower': { steps: SQUAT, from: [0.467, 0.033], via: [0.589, 0.167], to: [0.711, 0.3], limb: 'pierna' },
  'Extensión de cuádriceps': { steps: LEG_EXT, from: [0.656, 0.02], via: [0.767, 0.073], to: [0.822, 0.16], limb: 'pierna' },
  'Curl femoral tumbado': { steps: LEG_CURL, from: [0.017, 0.267], via: [0.078, 0.4], to: [0.3, 0.52], limb: 'pierna' },
  'Curl femoral sentado': { steps: LEG_CURL, from: [0.822, 0.173], via: [0.733, 0.06], to: [0.594, 0.033], limb: 'pierna' },
  'Abductores en máquina': { steps: ['Piernas juntas', 'Abre las piernas', 'Piernas abiertas'], from: [0.622, 0.013], to: [0.689, 0.02], limb: 'pierna' },
  'Aductores en máquina': { steps: ['Piernas abiertas', 'Junta las piernas', 'Piernas juntas'], from: [0.689, 0.02], to: [0.622, 0.013], limb: 'pierna' },
  'Patada de glúteo en máquina': { steps: ['Cadera flexionada', 'Empuja atrás', 'Cadera extendida'], from: [0.578, 0.127], to: [0.367, 0.033], limb: 'pierna' },
  'Hip thrust en máquina': { steps: ['Cadera abajo', 'Sube la cadera', 'Cadera extendida'], from: [0.378, 0.127], to: [0.389, 0.233], limb: 'brazo' },
  'Elevación de gemelos sentado': { steps: ['Talones abajo', 'Sube de puntillas', 'Contracción máxima'], from: [0.661, 0.0], to: [0.661, 0.04], limb: 'pierna' },
  'Elevación de gemelos en prensa': { steps: ['Talones abajo', 'Extiende los tobillos', 'Contracción máxima'], from: [0.706, 0.607], to: [0.7, 0.6], limb: 'pierna' },

  'Press de pecho en máquina': { steps: ['Codos flexionados', 'Empuja adelante', 'Brazos extendidos'], from: [0.474, 0.542], to: [0.613, 0.548] },
  'Press inclinado en máquina': { steps: ['Codos flexionados', 'Empuja adelante y arriba', 'Brazos extendidos'], from: [0.292, 0.449], to: [0.404, 0.676] },
  'Press banca en multipower': { steps: ['Barra en el pecho', 'Empuja hacia arriba', 'Brazos extendidos'], from: [0.178, 0.36], to: [0.178, 0.553] },
  'Peck deck (aperturas en máquina)': { steps: ['Brazos abiertos', 'Junta los brazos', 'Brazos cerrados'], from: [0.241, 0.475], via: [0.441, 0.468], to: [0.596, 0.535] },
  'Cruce de poleas': { steps: ['Brazos abiertos', 'Cruza hacia abajo', 'Manos cruzadas'], from: [0.306, 0.755], via: [0.495, 0.742], to: [0.578, 0.635] },
  'Fondos asistidos en máquina': { steps: ['Codos flexionados', 'Empuja hacia arriba', 'Brazos extendidos'], from: [0.533, 0.653], to: [0.489, 0.52] },

  'Press de hombros en máquina': { steps: ['Manos a los hombros', 'Empuja arriba', 'Brazos extendidos'], from: [0.431, 0.599], via: [0.42, 0.745], to: [0.409, 0.879] },
  'Elevaciones laterales en máquina': { steps: RAISE, elbow: 'arriba', from: [0.398, 0.279], via: [0.509, 0.345], to: [0.587, 0.519] },
  'Elevaciones laterales en polea': { steps: RAISE, elbow: 'arriba', from: [0.533, 0.553], via: [0.622, 0.647], to: [0.678, 0.793] },
  'Pájaros en peck deck (deltoides posterior)': { steps: ['Brazos al frente', 'Abre hacia atrás', 'Brazos abiertos'], elbow: 'arriba', from: [0.609, 0.479], via: [0.465, 0.479], to: [0.287, 0.505] },
  'Face pull en polea': { steps: ['Brazos estirados', 'Tira a la cara', 'Manos junto a la cara'], view: 'frontal', from: [0.711, 0.873], to: [0.544, 0.913] },

  'Curl de bíceps en máquina': { steps: CURL, from: [0.43, 0.275], via: [0.518, 0.382], to: [0.452, 0.528] },
  'Curl de bíceps en polea': { steps: CURL, from: [0.511, 0.54], via: [0.633, 0.647], to: [0.567, 0.807] },
  'Curl en banco Scott (máquina)': { steps: CURL, from: [0.416, 0.275], via: [0.471, 0.409], to: [0.371, 0.515] },
  'Extensión de tríceps en polea (cuerda)': { steps: TRI, from: [0.628, 0.667], via: [0.589, 0.567], to: [0.494, 0.527] },
  'Extensión de tríceps en máquina': { steps: TRI, from: [0.507, 0.435], to: [0.541, 0.368] },
  'Press de tríceps en máquina (fondos)': { steps: TRI, from: [0.496, 0.408], via: [0.463, 0.315], to: [0.396, 0.262] },

  'Jalón al pecho': { steps: ['Brazos estirados', 'Baja los codos', 'Barra en el pecho'], from: [0.452, 0.848], via: [0.457, 0.695], to: [0.463, 0.542] },
  'Remo sentado en máquina': { steps: ROW, from: [0.607, 0.528], via: [0.518, 0.522], to: [0.441, 0.515] },
  'Remo en polea baja': { steps: ROW, from: [0.62, 0.492], via: [0.542, 0.425], to: [0.454, 0.372] },
  'Dominadas asistidas en máquina': { steps: ['Brazos estirados', 'Sube el cuerpo', 'Barbilla sobre asas'], from: [0.506, 0.987], to: [0.556, 0.88] },

  'Crunch en máquina': { steps: CRUNCH, from: [0.485, 0.568], to: [0.53, 0.382] },
  'Crunch en polea': { steps: CRUNCH, from: [0.533, 0.94], to: [0.6, 0.7] },
}

const MERGED: ExerciseGuide[] = BASE.map((x) => {
  const m = MOTION[x.key]
  if (!m) return x
  const { steps, via, from, to, limb, elbow, view } = m
  return {
    ...x,
    steps,
    diagram: {
      ...x.diagram,
      ...(from && { from }),
      ...(to && { to }),
      ...(via && { via }),
      ...(limb && { limb }),
      ...(elbow && { elbow }),
      ...(view && { view }),
    },
  }
})

/**
 * Fases de carga. Concéntrica = el músculo se acorta venciendo la carga; excéntrica = se alarga frenándola.
 * `loadPhase` indica cuál mitad del ciclo from→to→from es la concéntrica. En el catálogo casi siempre es la
 * ida; solo sentadilla y hack squat se animan de pie → abajo, donde bajar es la excéntrica.
 * Ritmo habitual: concéntrica 1-2 s controlada, excéntrica 2-3 s (nunca caída libre), pausa breve en los extremos.
 */
const LOAD_ON_RETURN = new Set(['Hack squat', 'Sentadilla en multipower'])

const TEMPO: Record<ExerciseCategory, Tempo> = {
  empuje: { concentricS: 1.5, eccentricS: 3, pauseS: 0.5 },
  tiron: { concentricS: 1.5, eccentricS: 3, pauseS: 1 },
  pierna: { concentricS: 2, eccentricS: 3, pauseS: 0.5 },
  aislamiento: { concentricS: 2, eccentricS: 3, pauseS: 1 },
  core: { concentricS: 2, eccentricS: 3, pauseS: 1 },
}

const TEMPO_NOTE: Record<ExerciseCategory, string> = {
  empuje: 'Empuja en ~1,5 s y vuelve en ~3 s controlando el peso; la vuelta nunca es una caída.',
  tiron: 'Tira en ~1,5 s, aprieta 1 s y vuelve en ~3 s sin soltar la carga.',
  pierna: 'Empuja en ~2 s y vuelve en ~3 s sin rebotar en los extremos.',
  aislamiento: 'Contrae en ~2 s, aprieta 1 s y vuelve en ~3 s; la vuelta es la mitad del trabajo.',
  core: 'Contrae en ~2 s, aprieta 1 s y vuelve en ~3 s, sin tirones.',
}

const TEMPO_OVERRIDE: Record<string, { tempo?: Tempo; note?: string }> = {
  'Hack squat': { note: 'Baja en ~3 s controlando el peso y sube empujando en ~2 s; sin rebotar abajo.' },
  'Sentadilla en multipower': { note: 'Baja en ~3 s controlando el peso y sube empujando en ~2 s; sin rebotar abajo.' },
  'Hip thrust en máquina': { tempo: { concentricS: 2, eccentricS: 3, pauseS: 1 }, note: 'Sube en ~2 s, aprieta el glúteo 1 s arriba y baja en ~3 s.' },
  'Elevación de gemelos sentado': { tempo: { concentricS: 1.5, eccentricS: 3, pauseS: 1 }, note: 'Sube en ~1,5 s y baja en ~3 s; pausa 1 s abajo (estiramiento) y 1 s arriba (contracción).' },
  'Elevación de gemelos en prensa': { tempo: { concentricS: 1.5, eccentricS: 3, pauseS: 1 }, note: 'Sube en ~1,5 s y baja en ~3 s; pausa 1 s abajo (estiramiento) y 1 s arriba (contracción).' },
}

const QUAD: MuscleId[] = ['rfem', 'vlat', 'vmed']
const BICEPS_SEC: MuscleId[] = ['brachialis', 'brachrad']
const BACK_PULL_SEC: MuscleId[] = ['biceps', 'brachialis', 'brachrad', 'rhomb', 'trapM', 'dpost', 'infra']
const ROW_MUSCLES: { primary: MuscleId[]; secondary: MuscleId[] } = {
  primary: ['lat', 'rhomb', 'trapM'], secondary: ['biceps', 'brachialis', 'dpost', 'teres', 'erector'],
}

/** Músculos a resaltar por ejercicio (ids del humanoide v4). Refina el grupo de primary/secondary. */
const MUSCLES: Record<string, { primary: MuscleId[]; secondary: MuscleId[] }> = {
  'Prensa de piernas': { primary: QUAD, secondary: ['glute', 'add', 'ham'] },
  'Hack squat': { primary: QUAD, secondary: ['glute', 'add', 'ham', 'erector'] },
  'Sentadilla en multipower': { primary: QUAD, secondary: ['glute', 'add', 'ham', 'erector', 'rectus'] },
  'Extensión de cuádriceps': { primary: QUAD, secondary: [] },
  'Curl femoral tumbado': { primary: ['ham', 'hamS'], secondary: ['gastroc', 'gastrocM'] },
  'Curl femoral sentado': { primary: ['ham', 'hamS'], secondary: ['gastroc', 'gastrocM'] },
  'Abductores en máquina': { primary: ['gmed', 'tfl'], secondary: ['glute'] },
  'Aductores en máquina': { primary: ['add'], secondary: [] },
  'Patada de glúteo en máquina': { primary: ['glute'], secondary: ['ham', 'hamS', 'erector'] },
  'Hip thrust en máquina': { primary: ['glute'], secondary: ['ham', 'hamS', 'add'] },
  // Sentado (rodilla a 90°) trabaja sobre todo el sóleo; con la rodilla casi recta (prensa), el gastrocnemio.
  'Elevación de gemelos sentado': { primary: ['soleus'], secondary: ['gastroc', 'gastrocM'] },
  'Elevación de gemelos en prensa': { primary: ['gastroc', 'gastrocM'], secondary: ['soleus'] },

  'Press de pecho en máquina': { primary: ['pec'], secondary: ['dant', 'triceps', 'serr'] },
  'Press inclinado en máquina': { primary: ['pecC', 'pec'], secondary: ['dant', 'triceps'] },
  'Press banca en multipower': { primary: ['pec'], secondary: ['dant', 'triceps', 'serr'] },
  'Peck deck (aperturas en máquina)': { primary: ['pec'], secondary: ['dant', 'serr'] },
  'Cruce de poleas': { primary: ['pec'], secondary: ['dant', 'serr'] },
  'Fondos asistidos en máquina': { primary: ['pec', 'triceps'], secondary: ['dant'] },

  'Press de hombros en máquina': { primary: ['dant', 'dlat'], secondary: ['triceps', 'trap', 'serr'] },
  'Elevaciones laterales en máquina': { primary: ['dlat'], secondary: ['dant', 'trap'] },
  'Elevaciones laterales en polea': { primary: ['dlat'], secondary: ['dant', 'trap'] },
  'Pájaros en peck deck (deltoides posterior)': { primary: ['dpost'], secondary: ['infra', 'rhomb', 'trapM'] },
  'Face pull en polea': { primary: ['dpost', 'rhomb', 'trapM'], secondary: ['infra', 'dlat'] },

  'Curl de bíceps en máquina': { primary: ['biceps'], secondary: [...BICEPS_SEC, 'fflex'] },
  'Curl de bíceps en polea': { primary: ['biceps'], secondary: [...BICEPS_SEC, 'fflex'] },
  'Curl en banco Scott (máquina)': { primary: ['biceps'], secondary: BICEPS_SEC },
  'Extensión de tríceps en polea (cuerda)': { primary: ['triceps'], secondary: [] },
  'Extensión de tríceps en máquina': { primary: ['triceps'], secondary: [] },
  'Press de tríceps en máquina (fondos)': { primary: ['triceps'], secondary: ['dant', 'pec'] },

  'Jalón al pecho': { primary: ['lat', 'teres'], secondary: BACK_PULL_SEC },
  'Remo sentado en máquina': ROW_MUSCLES,
  'Remo en polea baja': ROW_MUSCLES,
  'Dominadas asistidas en máquina': { primary: ['lat', 'teres'], secondary: BACK_PULL_SEC },

  'Crunch en máquina': { primary: ['rectus'], secondary: ['oblique', 'serr'] },
  'Crunch en polea': { primary: ['rectus'], secondary: ['oblique', 'serr'] },
}

export const GUIDES: ExerciseGuide[] = MERGED.map((x) => {
  const muscleIds = MUSCLES[x.key]
  if (x.diagram.motion === 'isometrico') return muscleIds ? { ...x, muscleIds } : x // sin fases: no hay concéntrica ni excéntrica
  const o = TEMPO_OVERRIDE[x.key]
  return {
    ...x,
    tempo: o?.tempo ?? TEMPO[x.category],
    tempoNote: o?.note ?? TEMPO_NOTE[x.category],
    muscleIds,
    diagram: { ...x.diagram, loadPhase: LOAD_ON_RETURN.has(x.key) ? 'vuelta' : 'ida' },
  }
})

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const BY_NAME = new Map(GUIDES.map((x) => [norm(x.key), x]))

export function findGuide(name: string): ExerciseGuide | undefined {
  return BY_NAME.get(norm(name))
}
