export const fmtNum = (n: number, d = 1) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
export const fmtDay = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
export const fmtDayLong = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
/** Redondea al medio kilo (cargas de entrenamiento). */
export const roundHalf = (v: number) => Math.round(v * 2) / 2
/** Carga en kilos: «22.5 kg». */
export const fmtKg = (kg: number) => `${roundHalf(kg)} kg`
