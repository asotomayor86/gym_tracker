import type { Availability } from '../../lib/gyms'

const CHIP: Record<Exclude<Availability, 'available'>, { icon: string; cls: string; text: (g: string) => string }> = {
  unavailable: { icon: '✕', cls: 'border-e-fail/60 text-e-fail', text: (g) => `No disponible en ${g}` },
  unverified: { icon: '?', cls: 'border-dashed border-hair text-mute', text: () => 'Sin verificar' },
}

/** Marca de disponibilidad (icono + texto, no solo color). No pinta nada si está disponible. */
export function AvailabilityChip({ status, gymName, showOk }: { status: Availability; gymName: string; showOk?: boolean }) {
  if (status === 'available') {
    return showOk ? <span className="inline-flex items-center gap-1 rounded-full border border-hair px-2 py-0.5 text-[0.65rem] font-semibold text-mute"><span aria-hidden className="text-e-easy">✓</span>{gymName}</span> : null
  }
  const c = CHIP[status]
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${c.cls}`}><span aria-hidden>{c.icon}</span>{c.text(gymName)}</span>
}
