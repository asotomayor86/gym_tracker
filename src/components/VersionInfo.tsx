import { useState } from 'react'
import { APP_VERSION, checkForUpdate } from '../lib/swUpdate'
import { Button } from './ui'

const MSG = {
  latest: 'Estás en la última versión.',
  updating: 'Hay una versión nueva: se está aplicando.',
  error: 'No se pudo comprobar. ¿Hay conexión?',
} as const

/** Versión en ejecución (commit corto y fecha de compilación) y botón para buscar actualización. Discreto, al final de Ajustes. */
export default function VersionInfo() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const built = new Date(APP_VERSION.builtAt).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <section className="space-y-2 px-1 pb-2 text-xs text-mute" aria-label="Versión de la aplicación">
      <p>
        Versión <b className="num text-ink">{APP_VERSION.commit}</b> · compilada el {built}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost" className="!min-h-9 px-4 text-xs" disabled={busy}
          onClick={async () => { setBusy(true); setMsg(''); setMsg(MSG[await checkForUpdate()]); setBusy(false) }}
        >
          {busy ? 'Buscando…' : 'Buscar actualización'}
        </Button>
        <span role="status">{msg}</span>
      </div>
    </section>
  )
}
