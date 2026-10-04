import AccountSection from '../components/auth/AccountSection'
import { Button, CommitInput, Page, SectionTitle, inputCls } from '../components/ui'
import { KindIcon, StatusFacts } from '../components/SyncUI'
import { kindDesc, kindLabel, kindTone } from '../components/syncMeta'
import VersionInfo from '../components/VersionInfo'
import { db } from '../db/db'
import { useGyms } from '../lib/gyms'
import { setPrefs, usePrefs } from '../lib/prefs'
import { syncNow } from '../lib/sync'
import { useAgo, useSyncView } from '../lib/syncView'
import { SYNC_TABLES } from '../lib/syncTables'

function SyncSection() {
  const v = useSyncView()
  const ago = useAgo(v.lastSync)
  return (
    <>
      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${kindTone[v.kind]}`}>
        <span className={v.kind === 'syncing' ? 'animate-spin' : ''}><KindIcon kind={v.kind} /></span>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{kindLabel(v.kind, v.pending)}</div>
          <div className="text-xs opacity-80">{kindDesc(v.kind, v.pending)}</div>
        </div>
      </div>
      {v.error && v.kind === 'error' && <p role="alert" className="text-sm text-e-fail">{v.error}</p>}
      <StatusFacts items={[
        { k: 'Última sync', v: ago },
        { k: 'Pendientes', v: v.pending },
        { k: 'Conexión', v: v.online ? 'En línea' : 'Sin red' },
      ]} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => syncNow()} disabled={v.kind === 'syncing' || !v.online}>Sincronizar ahora</Button>
      </div>
          </>
  )
}

export default function SettingsPage() {
  const prefs = usePrefs()
  const gyms = useGyms()

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
      <AccountSection />

      <section className="glass space-y-4 p-5">
        <SectionTitle>Sincronización</SectionTitle>
        <SyncSection />
      </section>

      <section className="glass space-y-4 p-5">
        <SectionTitle>Preferencias</SectionTitle>
        <label className="eyebrow block">
          Unidad de peso
          <select className={`${inputCls} mt-1 text-base normal-case tracking-normal text-ink`} value={prefs.unit} onChange={(e) => setPrefs({ unit: e.target.value as 'kg' | 'lb' })}>
            <option value="kg">Kilos (kg)</option>
            <option value="lb">Libras (lb)</option>
          </select>
        </label>
        <label className="eyebrow block">
          Gimnasio habitual
          <select className={`${inputCls} mt-1 text-base normal-case tracking-normal text-ink`} value={prefs.gymId ?? ''} onChange={(e) => setPrefs({ gymId: e.target.value || null })}>
            <option value="">Sin filtro (todos los ejercicios)</option>
            {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-mute">Oculta en rutinas y sesiones los ejercicios que no están en tu gimnasio.</span>
        </label>
        <label className="eyebrow block">
          Incremento al progresar (kg)
          <CommitInput
            type="number" inputMode="decimal" value={prefs.incrementKg}
            onCommit={(v) => parseFloat(v) > 0 && setPrefs({ incrementKg: parseFloat(v) })}
          />
        </label>
      </section>

      <details className="glass-flat group px-5 py-3">
        <summary className="eyebrow flex cursor-pointer list-none items-center justify-between py-1.5">
          Copia de seguridad (avanzado)
          <span aria-hidden className="transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="space-y-3 pb-2 pt-3">
          <p className="text-xs text-mute">No hace falta para el día a día: con la sesión iniciada tus datos se sincronizan solos. Descarga un archivo con todo por si quieres guardarlo aparte.</p>
          <Button variant="ghost" onClick={exportJson}>Exportar JSON</Button>
        </div>
      </details>
      <VersionInfo />
    </Page>
  )
}
