import { useState } from 'react'
import { Button, CommitInput, Page, card, inputCls } from '../components/ui'
import { db } from '../db/db'
import { setPrefs, usePrefs } from '../lib/prefs'
import { hasToken, login, logout, syncNow, useSyncState } from '../lib/sync'
import { SYNC_TABLES } from '../lib/syncTables'

export default function SettingsPage() {
  const prefs = usePrefs()
  const sync = useSyncState()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const logged = hasToken()

  const exportJson = async () => {
    const data: Record<string, unknown> = {}
    for (const t of SYNC_TABLES) data[t] = await db[t].toArray()
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `gym-tracker-${new Date().toISOString().slice(0, 10)}.json` })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Page title="Ajustes">
      <section className={`${card} p-4 space-y-3`}>
        <h2 className="font-semibold">Preferencias</h2>
        <label className="block text-sm">
          Unidad de peso
          <select className={inputCls} value={prefs.unit} onChange={(e) => setPrefs({ unit: e.target.value as 'kg' | 'lb' })}>
            <option value="kg" className="text-black">Kilos (kg)</option>
            <option value="lb" className="text-black">Libras (lb)</option>
          </select>
        </label>
        <label className="block text-sm">
          Incremento al progresar (kg)
          <CommitInput
            type="number" inputMode="decimal" value={prefs.incrementKg}
            onCommit={(v) => parseFloat(v) > 0 && setPrefs({ incrementKg: parseFloat(v) })}
          />
        </label>
      </section>

      <section className={`${card} p-4 space-y-3`}>
        <h2 className="font-semibold">Sincronización</h2>
        {logged ? (
          <>
            <p className="text-sm text-zinc-500">
              Estado: {sync.status}
              {sync.lastSync && ` · última: ${new Date(sync.lastSync).toLocaleTimeString()}`}
              {sync.error && ` · ${sync.error}`}
            </p>
            <div className="flex gap-2">
              <Button onClick={() => syncNow()} disabled={sync.status === 'syncing'}>Sincronizar ahora</Button>
              <Button variant="ghost" onClick={logout}>Cerrar sesión</Button>
            </div>
          </>
        ) : (
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault()
              setError('')
              try { await login(password); setPassword('') } catch (err) { setError(err instanceof Error ? err.message : 'Error') }
            }}
          >
            <p className="text-sm text-zinc-500">Los datos funcionan sin conexión. Inicia sesión para sincronizar con la nube.</p>
            <input className={inputCls} type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={!password}>Entrar</Button>
          </form>
        )}
      </section>

      <section className={`${card} p-4 space-y-2`}>
        <h2 className="font-semibold">Copia de seguridad</h2>
        <Button variant="ghost" onClick={exportJson}>Exportar JSON</Button>
      </section>
    </Page>
  )
}
