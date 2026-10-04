import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { Button } from './ui'

/**
 * Aviso de «Nueva versión disponible»: la PWA ya abierta con una versión vieja no se recarga sola en mitad de un
 * entrenamiento; el usuario decide cuándo. No aparece en el primer arranque (solo cuando hay una versión en espera).
 */
export default function UpdateBanner() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [hidden, setHidden] = useState(false)
  const update = useRef<(reload?: boolean) => Promise<void>>(() => Promise.resolve())
  useEffect(() => {
    update.current = registerSW({ immediate: true, onNeedRefresh: () => setNeedRefresh(true) })
  }, [])
  if (!needRefresh || hidden) return null
  return (
    <div role="status" className="glass-flat fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-50 mx-auto flex max-w-md items-center gap-3 px-4 py-3 shadow-[0_8px_30px_rgb(0_0_0/0.35)]">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">Nueva versión disponible</div>
        <div className="text-xs text-mute">Recarga para usarla. Tus datos no se pierden.</div>
      </div>
      <Button className="!min-h-9 px-4 text-xs" onClick={() => void update.current(true)}>Recargar</Button>
      <button type="button" onClick={() => setHidden(true)} aria-label="Ahora no" className="press grid size-9 place-items-center rounded-full text-mute hover:text-ink">✕</button>
    </div>
  )
}
