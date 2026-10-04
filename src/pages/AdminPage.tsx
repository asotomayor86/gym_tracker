import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  createInvitation, listInvitations, listUsers, logoutUser, resetPassword, revokeInvitation, updateUser,
  type AdminUser, type Invitation, type Role,
} from '../components/admin/adminShim'
import { useAuth } from '../components/auth/authShim'
import { Button, Page, SectionTitle, inputCls } from '../components/ui'

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
  const [created, setCreated] = useState<{ url: string; expiresAt: number } | null>(null)
  const create = async () => {
    setBusy(true)
    try { const r = await createInvitation({ role, days }); setCreated({ url: `${location.origin}/invitacion/${r.code}`, expiresAt: r.expiresAt }); reload() } finally { setBusy(false) }
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
  const act = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); onChanged() } finally { setBusy(false); setStep(null) } }
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

const TABS: { k: 'inv' | 'users'; label: string; node: ReactNode }[] = [
  { k: 'inv', label: 'Invitaciones', node: <Invitations /> },
  { k: 'users', label: 'Usuarios', node: <Users /> },
]

/** Panel de administración (solo role = admin): invitaciones y usuarios. */
/** En desarrollo, ?devauth permite ver el panel sin cuenta de administrador. */
const devAdmin = import.meta.env.DEV && new URLSearchParams(location.search).has('devauth')

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
      <div className="glass flex rounded-full p-1" role="tablist" aria-label="Secciones de administración">
        {TABS.map((t) => (
          <button key={t.k} role="tab" aria-selected={tab === t.k} type="button" onClick={() => setTab(t.k)}
            className={`min-h-10 flex-1 rounded-full px-4 text-sm font-semibold transition-colors ${tab === t.k ? 'bg-signal text-on-signal' : 'text-mute hover:text-ink'}`}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel">{TABS.find((t) => t.k === tab)!.node}</div>
    </Page>
  )
}
