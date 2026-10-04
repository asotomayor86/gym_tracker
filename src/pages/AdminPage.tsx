import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import {
  createInvitation, listInvitations, listUsers, logoutUser, resetPassword, revokeInvitation, updateUser,
  type AdminUser, type Invitation, type Role,
} from '../components/admin/adminShim'
import { useAuth } from '../components/auth/authShim'
import { Button, CommitInput, Page, SectionTitle, inputCls } from '../components/ui'
import { alive, db } from '../db/db'
import { availabilityIndex, removeGym, saveGym, setAvailability, useExerciseGyms, useGyms } from '../lib/gyms'
import { MUSCLE_LABELS } from '../lib/labels'
import { MUSCLE_GROUPS } from '../lib/types'

const dateFmt = (ms: number) => new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const ago = (ms: number | null) => {
  if (!ms) return 'nunca'
  const m = Math.round((Date.now() - ms) / 60000)
  if (m < 60) return `hace ${Math.max(1, m)} min`
  const h = Math.round(m / 60)
  return h < 48 ? `hace ${h} h` : dateFmt(ms)
}
const STATUS: Record<Invitation['status'], { label: string; cls: string }> = {
  active: { label: 'Activa', cls: 'border-signal/60 text-signal-text' },
  used: { label: 'Usada', cls: 'border-hair text-mute' },
  expired: { label: 'Caducada', cls: 'border-hair text-mute' },
  revoked: { label: 'Revocada', cls: 'border-e-fail/50 text-e-fail' },
}
const adminMsg = (e: unknown) => {
  const code = (e as { code?: string })?.code
  if (code === 'cannot_demote_self') return 'No puedes quitarte a ti mismo el rol de administrador.'
  if (code === 'forbidden') return 'Solo los administradores pueden hacer esto.'
  if (code === 'network') return 'Sin conexión: la administración necesita red.'
  return 'No se pudo completar la acción.'
}
const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador', user: 'Usuario' }

function useLoad<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(() => { fn().then((d) => { setData(d); setError('') }).catch(() => setError('No se pudo cargar. Comprueba la conexión.')) }, [fn])
  useEffect(() => { reload() }, [reload])
  return { data, error, reload }
}

/** Botón que copia al portapapeles (con selección de respaldo si el navegador lo rechaza). */
function CopyButton({ text, label = 'Copiar', done = '¡Copiado!' }: { text: string; label?: string; done?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <Button
      type="button" variant="ghost" className="shrink-0"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1800) } catch { /* el valor está visible y seleccionable */ }
      }}
    >
      {ok ? `✓ ${done}` : label}
    </Button>
  )
}

function Secret({ title, value, note, onClose }: { title: string; value: string; note: string; onClose: () => void }) {
  return (
    <section role="status" className="space-y-2 rounded-2xl border border-signal/60 bg-signal/10 p-4">
      <h3 className="display text-sm" style={{ lineHeight: 1.3 }}>{title}</h3>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label={title} className={`${inputCls} num min-w-0 flex-1 text-sm`} />
        <CopyButton text={value} />
      </div>
      <p className="text-xs text-mute">{note}</p>
      <button type="button" onClick={onClose} className="text-xs font-semibold text-signal-text underline underline-offset-4">Ya lo he guardado</button>
    </section>
  )
}

function Invitations() {
  const { data, error, reload } = useLoad(listInvitations)
  const [role, setRole] = useState<Role>('user')
  const [days, setDays] = useState(7)
  const [busy, setBusy] = useState(false)
  const [createErr, setCreateErr] = useState('')
  const [created, setCreated] = useState<{ url: string; expiresAt: number } | null>(null)
  const create = async () => {
    setBusy(true); setCreateErr('')
    try { const r = await createInvitation({ role, days }); setCreated({ url: `${location.origin}/invitacion/${r.code}`, expiresAt: r.expiresAt }); reload() } catch (e) { setCreateErr(adminMsg(e)) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-5">
      <section className="glass space-y-4 p-4">
        <h2 className="display text-base">Nueva invitación</h2>
        <p className="text-sm text-mute">Cualquiera con el enlace puede crear su cuenta una sola vez. Caduca a los {days} {days === 1 ? 'día' : 'días'}.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="eyebrow">Rol</span>
            <select className={`${inputCls} mt-1 text-base`} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="user">Usuario</option><option value="admin">Administrador</option>
            </select>
          </label>
          <label><span className="eyebrow">Validez</span>
            <select className={`${inputCls} mt-1 text-base`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} {d === 1 ? 'día' : 'días'}</option>)}
            </select>
          </label>
        </div>
        {createErr && <p role="alert" className="text-sm text-e-fail">{createErr}</p>}
        <Button onClick={create} disabled={busy}>{busy ? 'Creando…' : 'Crear enlace de invitación'}</Button>
        {created && <Secret title="Enlace de invitación" value={created.url} note={`Caduca el ${dateFmt(created.expiresAt)}. El enlace solo se muestra ahora: cópialo antes de cerrar este aviso.`} onClose={() => setCreated(null)} />}
      </section>

      <section>
        <SectionTitle aside={data ? `${data.length}` : undefined}>Enviadas</SectionTitle>
        {error && <p role="alert" className="text-sm text-e-fail">{error}</p>}
        {!data ? <p className="text-sm text-mute" aria-busy="true">Cargando…</p> : data.length === 0 ? <p className="text-sm text-mute">Aún no has creado invitaciones.</p> : (
          <ul className="glass-flat divide-y divide-hair overflow-hidden">
            {data.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <span className={`rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold ${STATUS[i.status].cls}`}>{STATUS[i.status].label}</span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-semibold">{ROLE_LABEL[i.role]}</div>
                  <div className="text-xs text-mute">
                    Creada {dateFmt(i.createdAt)} · {i.status === 'used' && i.usedBy ? <>usada por <b className="text-ink">{i.usedBy}</b></> : <>caduca {dateFmt(i.expiresAt)}</>}
                  </div>
                </div>
                {i.status === 'active' && <Button variant="danger" className="!min-h-9 px-3 text-xs" onClick={async () => { await revokeInvitation(i.id); reload() }}>Revocar</Button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function UserCard({ u, me, onChanged }: { u: AdminUser; me: boolean; onChanged: () => void }) {
  const [step, setStep] = useState<null | 'reset' | 'logout'>(null)
  const [busy, setBusy] = useState(false)
  const [temp, setTemp] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const act = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); onChanged() } catch (e) { setErr(adminMsg(e)) } finally { setBusy(false); setStep(null) } }
  return (
    <li className="glass space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{u.displayName || u.email}{me && <span className="ml-2 text-xs font-normal text-mute">(tú)</span>}</div>
          <div className="truncate text-xs text-mute">{u.email}</div>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold ${u.role === 'admin' ? 'border-signal/60 text-signal-text' : 'border-hair text-mute'}`}>{ROLE_LABEL[u.role]}</span>
        {u.disabled && <span className="rounded-full border border-e-fail/50 px-2.5 py-0.5 text-[0.68rem] font-semibold text-e-fail">Desactivado</span>}
      </div>
      <p className="text-xs text-mute">Alta {dateFmt(u.createdAt)} · último acceso {ago(u.lastLoginAt)} · {u.sessions} {u.sessions === 1 ? 'sesión' : 'sesiones'}</p>
      {temp && <Secret title="Contraseña temporal" value={temp} note="Se muestra una sola vez. La persona tendrá que cambiarla al entrar, y sus sesiones anteriores se han cerrado." onClose={() => setTemp(null)} />}
      {err && <p role="alert" className="text-sm text-e-fail">{err}</p>}
      {!me && (
        <div className="flex flex-wrap gap-2">
          <select aria-label={`Rol de ${u.email}`} className={`${inputCls} !min-h-9 w-auto py-1 text-sm`} value={u.role} disabled={busy} onChange={(e) => act(() => updateUser(u.id, { role: e.target.value as Role }))}>
            <option value="user">Usuario</option><option value="admin">Administrador</option>
          </select>
          <Button variant="ghost" className="!min-h-9 px-3 text-xs" disabled={busy} onClick={() => act(() => updateUser(u.id, { disabled: !u.disabled }))}>{u.disabled ? 'Activar' : 'Desactivar'}</Button>
          {step === 'reset' ? (
            <Button variant="danger" className="!min-h-9 px-3 text-xs" disabled={busy} onClick={() => act(async () => { setTemp((await resetPassword(u.id)).temporaryPassword) })}>Confirmar reinicio</Button>
          ) : <Button variant="ghost" className="!min-h-9 px-3 text-xs" disabled={busy} onClick={() => setStep('reset')}>Restablecer contraseña</Button>}
          {step === 'logout' ? (
            <Button variant="danger" className="!min-h-9 px-3 text-xs" disabled={busy} onClick={() => act(() => logoutUser(u.id))}>Confirmar cierre</Button>
          ) : u.sessions > 0 && <Button variant="ghost" className="!min-h-9 px-3 text-xs" disabled={busy} onClick={() => setStep('logout')}>Cerrar sesiones</Button>}
          {step && <Button variant="ghost" className="!min-h-9 px-3 text-xs" onClick={() => setStep(null)}>Cancelar</Button>}
        </div>
      )}
    </li>
  )
}

function Users() {
  const auth = useAuth()
  const { data, error, reload } = useLoad(listUsers)
  if (error) return <p role="alert" className="text-sm text-e-fail">{error}</p>
  if (!data) return <p className="text-sm text-mute" aria-busy="true">Cargando…</p>
  return <ul className="space-y-4">{data.map((u) => <UserCard key={u.id} u={u} me={u.id === auth.user?.id} onChanged={reload} />)}</ul>
}

function Gyms() {
  const gyms = useGyms()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [del, setDel] = useState<string | null>(null)
  const create = async () => {
    try { await saveGym({ name }); setName(''); setError('') } catch { setError('Escribe un nombre para el gimnasio.') }
  }
  return (
    <div className="space-y-5">
      <section className="glass space-y-3 p-4">
        <h2 className="display text-base">Nuevo gimnasio</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void create() }}>
          <input className={`${inputCls} min-w-0 flex-1 text-base`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (p. ej. Forus)" aria-label="Nombre del gimnasio" />
          <Button type="submit" className="shrink-0">Añadir</Button>
        </form>
        {error && <p role="alert" className="text-sm text-e-fail">{error}</p>}
      </section>
      <section>
        <SectionTitle aside={String(gyms.length)}>Gimnasios</SectionTitle>
        {gyms.length === 0 ? <p className="text-sm text-mute">Aún no hay gimnasios.</p> : (
          <ul className="space-y-3">
            {gyms.map((g) => (
              <li key={g.id} className="glass space-y-2 p-4">
                <CommitInput value={g.name} className={`${inputCls} display !text-lg`} onCommit={(v) => v.trim() && saveGym({ id: g.id, name: v })} />
                <CommitInput value={g.notes} placeholder="Notas (opcional)" onCommit={(v) => saveGym({ id: g.id, name: g.name, notes: v })} className={`${inputCls} text-sm`} />
                {del === g.id ? (
                  <div className="flex flex-wrap items-center gap-2" role="group">
                    <span className="text-xs text-mute">Se borrarán también sus marcas de disponibilidad.</span>
                    <Button variant="danger" className="!min-h-9 px-3 text-xs" onClick={async () => { await removeGym(g.id); setDel(null) }}>Sí, borrar</Button>
                    <Button variant="ghost" className="!min-h-9 px-3 text-xs" onClick={() => setDel(null)}>Cancelar</Button>
                  </div>
                ) : <Button variant="ghost" className="!min-h-9 px-3 text-xs" onClick={() => setDel(g.id)}>Borrar gimnasio</Button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

type Mark = true | false | null
const MARKS: { v: Mark; icon: string; aria: string }[] = [
  { v: true, icon: '✓', aria: 'Disponible' },
  { v: false, icon: '✕', aria: 'No disponible' },
  { v: null, icon: '?', aria: 'Sin verificar' },
]

/** Matriz ejercicio × gimnasio: tres estados por celda (disponible / no / sin verificar). */
function Availability() {
  const gyms = useGyms()
  const rows = useExerciseGyms()
  const exercises = useLiveQuery(() => db.exercises.filter(alive).toArray(), [], [])
  const [gymId, setGymId] = useState('')
  const [query, setQuery] = useState('')
  const [onlyPending, setOnlyPending] = useState(false)
  const gid = gymId || gyms[0]?.id || ''
  if (gyms.length === 0) return <p className="text-sm text-mute">Primero crea un gimnasio en la pestaña Gimnasios.</p>
  const idx = availabilityIndex(gid, rows)
  const state = (id: string): Mark => { const a = idx(id); return a === 'available' ? true : a === 'unavailable' ? false : null }
  const count = (m: Mark) => exercises.filter((e) => state(e.id) === m).length
  const q = query.trim().toLowerCase()
  const shown = exercises.filter((e) => e.name.toLowerCase().includes(q) && (!onlyPending || state(e.id) === null)).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="eyebrow">Gimnasio</span>
          <select className={`${inputCls} mt-1 text-base`} value={gid} onChange={(e) => setGymId(e.target.value)}>
            {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label><span className="eyebrow">Buscar</span>
          <input className={`${inputCls} mt-1 text-base`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ejercicio…" />
        </label>
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute" aria-live="polite">
        <span><b className="text-ink">{count(true)}</b> disponibles</span><span><b className="text-ink">{count(false)}</b> no</span><span><b className="text-ink">{count(null)}</b> sin verificar</span>
        <label className="ml-auto flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--signal)]" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />Solo sin verificar</label>
      </p>
      {MUSCLE_GROUPS.map((m) => {
        const list = shown.filter((e) => e.primaryMuscle === m)
        if (!list.length) return null
        return (
          <section key={m}>
            <SectionTitle aside={String(list.length)}>{MUSCLE_LABELS[m]}</SectionTitle>
            <ul className="glass-flat divide-y divide-hair overflow-hidden">
              {list.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 text-sm font-semibold">{e.name}</span>
                  <span className="flex shrink-0 gap-1" role="group" aria-label={`Disponibilidad de ${e.name}`}>
                    {MARKS.map((k) => {
                      const on = state(e.id) === k.v
                      const onCls = k.v === true ? 'border-e-easy bg-e-easy text-e-easy-ink' : k.v === false ? 'border-e-fail bg-e-fail text-on-signal' : 'border-signal bg-signal text-on-signal'
                      return (
                        <button key={String(k.v)} type="button" aria-pressed={on} aria-label={k.aria} title={k.aria} onClick={() => void setAvailability(e.id, gid, k.v)}
                          className={`press grid size-9 place-items-center rounded-lg border text-xs font-semibold ${on ? onCls : 'border-hair text-mute hover:text-ink'}`}>
                          <span aria-hidden>{k.icon}</span>
                        </button>
                      )
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

const TABS: { k: 'inv' | 'users' | 'gyms' | 'avail'; label: string; node: ReactNode }[] = [
  { k: 'inv', label: 'Invitaciones', node: <Invitations /> },
  { k: 'users', label: 'Usuarios', node: <Users /> },
  { k: 'gyms', label: 'Gimnasios', node: <Gyms /> },
  { k: 'avail', label: 'Disponibilidad', node: <Availability /> },
]

/** Panel de administración (solo role = admin): invitaciones y usuarios. */

/** En desarrollo, ?devadmin permite ver el panel sin cuenta de administrador. */
const devAdmin = import.meta.env.DEV && new URLSearchParams(location.search).has('devadmin')

export default function AdminPage() {
  const auth = useAuth()
  const [tab, setTab] = useState<(typeof TABS)[number]['k']>('inv')
  if (!auth.isAdmin && !devAdmin) {
    return (
      <Page title="Admin"><p className="text-mute">Esta sección es solo para administradores. <Link to="/" className="underline decoration-signal decoration-2 underline-offset-4">Volver</Link></p></Page>
    )
  }
  return (
    <Page title="Admin" eyebrow="Administración">
      <div className="glass flex overflow-x-auto rounded-full p-1" role="tablist" aria-label="Secciones de administración">
        {TABS.map((t) => (
          <button key={t.k} role="tab" aria-selected={tab === t.k} type="button" onClick={() => setTab(t.k)}
            className={`min-h-10 flex-1 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${tab === t.k ? 'bg-signal text-on-signal' : 'text-mute hover:text-ink'}`}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel">{TABS.find((t) => t.k === tab)!.node}</div>
    </Page>
  )
}
