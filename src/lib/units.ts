export type Unit = 'kg' | 'lb'

export const LB_PER_KG = 2.20462

export const kgToLb = (kg: number) => kg * LB_PER_KG
export const lbToKg = (lb: number) => lb / LB_PER_KG

export const toKg = (value: number, unit: Unit) => (unit === 'kg' ? value : lbToKg(value))
export const fromKg = (kg: number, unit: Unit) => (unit === 'kg' ? kg : kgToLb(kg))

/** Redondea al paso más cercano (0.5 por defecto) para mostrar pesos limpios. */
export const roundTo = (value: number, step = 0.5) => Math.round(value / step) * step

export const formatWeight = (kg: number, unit: Unit) =>
  `${roundTo(fromKg(kg, unit), unit === 'kg' ? 0.5 : 1)} ${unit}`
