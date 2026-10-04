import { useState } from 'react'
import { reloadNow, useUpdateReady } from '../lib/swUpdate'
import { Button } from './ui'

/**
 * Aviso de «Nueva versión lista». Solo sale si hay una versión descargada y un entrenamiento en curso impide recargar
 * al momento; se recarga sola al terminar el entreno. Banner fijo arriba, por encima de la navegación.
 */
export default function UpdateBanner() {
  const ready = useUpdateReady()
  const [hidden, setHidden] = useState(false)
  if (!ready || hidden) return null
  return (
    <div role="status" className="glass-flat fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-50 mx-auto flex max-w-md items-center gap-3 px-4 py-3 shadow-[0_8px_30px_rgb(0_0_0/0.35)]">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">Nueva versión lista</div>
        <div className="text-xs text-mute">Se aplicará al terminar el entreno, o recarga ya. Tus datos no se pierden.</div>
      </div>
      <Button className="!min-h-9 px-4 text-xs" onClick={reloadNow}>Recargar</Button>
      <button type="button" onClick={() => setHidden(true)} aria-label="Ahora no" className="press grid size-9 place-items-center rounded-full text-mute hover:text-ink">✕</button>
    </div>
  )
}
