/** Redondea al paso más cercano (0.5 por defecto) para mostrar pesos limpios. La app trabaja solo en kilogramos. */
export const roundTo = (value: number, step = 0.5) => Math.round(value / step) * step
