import { useState } from 'react'
import { Button, CommitInput, Page, SectionTitle, inputCls } from '../components/ui'
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
    <Page title="Ajustes" eyebrow="Preferencias y datos">
      <section className="space-y-3">
        <SectionTitle>Preferencias</SectionTitle>
        <label className="eyebrow block">
          Unidad de peso
          <select className={`${inputCls} bg-paper text-base normal-case tracking-normal text-ink`} value={prefs.unit} onChange={(e) => setPrefs({ unit: e.target.value as 'kg' | 'lb' })}>
            <option value="kg">Kilos (kg)</option>
            <option value="lb">Libras (lb)</option>
          </select>
        </label>
        <label className="eyebrow block">
          Incremento al progresar (kg)
          <CommitInput
            type="number" inputMode="decimal" value={prefs.incrementKg}
            onCommit={(v) => parseFloat(v) > 0 && setPrefs({ incrementKg: parseFloat(v) })}
          />
        </label>
      </section>

      <section className="space-y-3">
        <SectionTitle>Sincronización</SectionTitle>
        {logged ? (
          <>
            <p className="mono text-xs text-mute">
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
            <p className="mono text-xs text-mute">Los datos funcionan sin conexión. Inicia sesión para sincronizar con la nube.</p>
            <input className={inputCls} type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="text-sm text-e-fail">{error}</p>}
            <Button type="submit" disabled={!password}>Entrar</Button>
          </form>
        )}
      </section>

      <section className="space-y-2">
        <SectionTitle>Copia de seguridad</SectionTitle>
        <Button variant="ghost" onClick={exportJson}>Exportar JSON</Button>
      </section>
    </Page>
  )
}
