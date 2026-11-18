import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  login: vi.fn(), verifyMfa: vi.fn(), me: vi.fn(), logout: vi.fn(),
}))
vi.mock('../services/auth.service', () => ({ authService: auth }))

const sock = vi.hoisted(() => ({
  connect: vi.fn(), disconnect: vi.fn(), handler: null as null | ((e: unknown) => void), off: vi.fn(),
  on: vi.fn(),
}))
vi.mock('../lib/websocket', () => ({
  notificationsSocket: {
    connect: sock.connect,
    disconnect: sock.disconnect,
    on: (h: (e: unknown) => void) => { sock.on(h); sock.handler = h; return sock.off },
  },
}))

import { AuthProvider, useAuth } from '../context/AuthContext'
import { NotificationProvider, useNotifications } from '../context/NotificationContext'
import { ThemeProvider, useTheme } from '../context/ThemeContext'
import { USER_KEY } from '../lib/api'

const USER = { id: 1, username: 'u', email: 'e', first_name: 'A', last_name: 'B', role: 'usuario', type: 'student', is_active: true, is_superuser: false }

// ---------------------------------------------------------------- AuthContext
function AuthProbe({ onCtx }: { onCtx: (c: ReturnType<typeof useAuth>) => void }) {
  const ctx = useAuth()
  onCtx(ctx)
  return <div data-testid="state">{ctx.loading ? 'loading' : ctx.isAuthenticated ? `in:${ctx.usuario?.username}` : 'out'}</div>
}

describe('AuthContext', () => {
  let ctx: ReturnType<typeof useAuth>
  const mount = () => render(<AuthProvider><AuthProbe onCtx={(c) => { ctx = c }} /></AuthProvider>)

  beforeEach(() => {
    Object.values(auth).forEach((f) => f.mockReset())
    auth.logout.mockResolvedValue(undefined)
  })

  it('hidrata la sesión desde /users/me/', async () => {
    auth.me.mockResolvedValue(USER)
    mount()
    expect(screen.getByTestId('state')).toHaveTextContent('loading')
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in:u'))
    expect(JSON.parse(localStorage.getItem(USER_KEY)!)).toMatchObject({ id: 1 })
  })

  it('sin sesión (401) limpia la caché', async () => {
    localStorage.setItem(USER_KEY, JSON.stringify(USER))
    auth.me.mockRejectedValue(new Error('401'))
    mount()
    // con caché no bloquea: arranca autenticado y luego se degrada
    expect(screen.getByTestId('state')).toHaveTextContent('in:u')
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out'))
    expect(localStorage.getItem(USER_KEY)).toBeNull()
  })

  it('no actualiza estado si se desmonta antes de resolver', async () => {
    let resolve!: (v: unknown) => void
    auth.me.mockReturnValue(new Promise((r) => { resolve = r }))
    const { unmount } = mount()
    unmount()
    resolve(USER)
    await Promise.resolve()
    expect(localStorage.getItem(USER_KEY)).toBeNull()
  })

  it('no actualiza estado si se desmonta antes de fallar', async () => {
    let reject!: (e: unknown) => void
    auth.me.mockReturnValue(new Promise((_, r) => { reject = r }))
    const { unmount } = mount()
    unmount()
    reject(new Error('x'))
    await Promise.resolve()
    await Promise.resolve()
  })

  it('login sin MFA hidrata el usuario', async () => {
    auth.me.mockRejectedValueOnce(new Error('401'))
    mount()
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out'))
    auth.login.mockResolvedValue({ status: 'ok' })
    auth.me.mockResolvedValue(USER)
    let out: unknown
    await act(async () => { out = await ctx.login({ username: 'u', password: 'p' }) })
    expect(out).toEqual({ status: 'ok', user: USER })
    expect(screen.getByTestId('state')).toHaveTextContent('in:u')
  })

  it('login con MFA no crea sesión; completeMfaLogin sí', async () => {
    auth.me.mockRejectedValueOnce(new Error('401'))
    mount()
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out'))
    auth.login.mockResolvedValue({ status: 'mfa_required', mfaToken: 't' })
    let out: unknown
    await act(async () => { out = await ctx.login({ username: 'u', password: 'p' }) })
    expect(out).toEqual({ status: 'mfa_required', mfaToken: 't' })
    expect(screen.getByTestId('state')).toHaveTextContent('out')

    auth.verifyMfa.mockResolvedValue(undefined)
    auth.me.mockResolvedValue(USER)
    await act(async () => { await ctx.completeMfaLogin('t', '123456') })
    expect(auth.verifyMfa).toHaveBeenCalledWith('t', '123456')
    expect(screen.getByTestId('state')).toHaveTextContent('in:u')
  })

  it('logout limpia el estado y avisa al backend', async () => {
    auth.me.mockResolvedValue(USER)
    mount()
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in:u'))
    act(() => ctx.logout())
    expect(auth.logout).toHaveBeenCalled()
    expect(screen.getByTestId('state')).toHaveTextContent('out')
    expect(localStorage.getItem(USER_KEY)).toBeNull()
  })

  it('refreshUser vuelve a pedir el perfil', async () => {
    auth.me.mockResolvedValue(USER)
    mount()
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in:u'))
    auth.me.mockResolvedValue({ ...USER, username: 'nuevo' })
    await act(async () => { await ctx.refreshUser() })
    expect(screen.getByTestId('state')).toHaveTextContent('in:nuevo')
  })

  it('useAuth fuera del provider lanza', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<AuthProbe onCtx={() => {}} />)).toThrow('useAuth debe usarse dentro de AuthProvider')
    spy.mockRestore()
  })
})

// ---------------------------------------------------------------- ThemeContext
function ThemeProbe() {
  const { theme, toggleTheme } = useTheme()
  return <button onClick={toggleTheme}>{theme}</button>
}

describe('ThemeContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.documentElement.classList.remove('dark')
  })

  it('usa el tema guardado y alterna la clase dark', async () => {
    localStorage.setItem('theme', 'dark')
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)
    expect(screen.getByRole('button')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent('light')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('sin tema guardado respeta prefers-color-scheme', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)
    expect(screen.getByRole('button')).toHaveTextContent('dark')
  })

  it('prefers-color-scheme claro', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)
    expect(screen.getByRole('button')).toHaveTextContent('light')
  })

  it('si matchMedia no existe/lanza cae a light', () => {
    vi.stubGlobal('matchMedia', undefined)
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)
    expect(screen.getByRole('button')).toHaveTextContent('light')
  })

  it('si localStorage lanza no rompe', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)
    expect(screen.getByRole('button')).toHaveTextContent('dark')
  })

  it('useTheme fuera del provider lanza', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<ThemeProbe />)).toThrow('useTheme debe usarse dentro de ThemeProvider')
    spy.mockRestore()
  })
})

// ------------------------------------------------------- NotificationContext
function NotifyProbe({ onCtx }: { onCtx?: (c: ReturnType<typeof useNotifications>) => void }) {
  const c = useNotifications()
  onCtx?.(c)
  return null
}

describe('NotificationContext', () => {
  let n: ReturnType<typeof useNotifications>
  const mount = () => render(
    <AuthProvider>
      <NotificationProvider><NotifyProbe onCtx={(c) => { n = c }} /></NotificationProvider>
    </AuthProvider>,
  )

  beforeEach(() => {
    Object.values(auth).forEach((f) => f.mockReset())
    sock.connect.mockReset(); sock.disconnect.mockReset(); sock.on.mockReset(); sock.off.mockReset()
    sock.handler = null
    auth.me.mockResolvedValue(USER)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('no abre el socket sin sesión y lo abre con sesión', async () => {
    auth.me.mockRejectedValue(new Error('401'))
    mount()
    await waitFor(() => expect(sock.disconnect).toHaveBeenCalled())
    expect(sock.connect).not.toHaveBeenCalled()
  })

  it('abre el socket al hidratar y se desuscribe/cierra al desmontar', async () => {
    const { unmount } = mount()
    await waitFor(() => expect(sock.connect).toHaveBeenCalled())
    unmount()
    expect(sock.off).toHaveBeenCalled()
    expect(sock.disconnect).toHaveBeenCalled()
  })

  const emit = async (event: unknown) => {
    await waitFor(() => expect(sock.handler).toBeTruthy())
    act(() => sock.handler!(event))
  }

  it('schedule_email_sent', async () => {
    mount()
    await emit({ type: 'schedule_email_sent', schedule_id: 1, equipment_asset_tag: 'EQ-1', scheduled_date: '2026-01-01', branch_name: 'Sede', subject: 's', sent_at: '2026-01-01T10:30:00Z' })
    expect(screen.getByText('Correo de solicitud enviado')).toBeInTheDocument()
    expect(screen.getByText('EQ-1 · 2026-01-01')).toBeInTheDocument()
    expect(screen.getByText(/^Sede · /)).toBeInTheDocument()
  })

  it('schedule_email_sent sin fecha y con hora ilegible', async () => {
    vi.spyOn(Date.prototype, 'toLocaleTimeString').mockImplementation(() => { throw new Error('x') })
    mount()
    await emit({ type: 'schedule_email_sent', equipment_asset_tag: 'EQ-2', scheduled_date: '', branch_name: 'S', sent_at: 'RAW' })
    expect(screen.getByText('EQ-2 · sin programar')).toBeInTheDocument()
    expect(screen.getByText('S · RAW')).toBeInTheDocument()
  })

  it('overdue_maintenance: 0, 1 y varios días', async () => {
    mount()
    await emit({ type: 'overdue_maintenance', equipment_asset_tag: 'A', scheduled_date: 'd', days_overdue: 0 })
    expect(screen.getByText('Vence hoy')).toBeInTheDocument()
    await emit({ type: 'overdue_maintenance', equipment_asset_tag: 'A', scheduled_date: 'd', days_overdue: 1 })
    expect(screen.getByText('1 día de retraso')).toBeInTheDocument()
    await emit({ type: 'overdue_maintenance', equipment_asset_tag: 'A', scheduled_date: 'd', days_overdue: 3 })
    expect(screen.getByText('3 días de retraso')).toBeInTheDocument()
  })

  it('reservation_created y reservation_reviewed', async () => {
    mount()
    const base = { space_name: 'Lab', date: '2026-11-01', start_time: '08:00', end_time: '10:00', code: 'RT-1' }
    await emit({ type: 'reservation_created', ...base })
    expect(screen.getByText('Nueva solicitud de reserva')).toBeInTheDocument()
    await emit({ type: 'reservation_reviewed', status: 'approved', ...base })
    expect(screen.getByText('Reserva aprobada')).toBeInTheDocument()
    await emit({ type: 'reservation_reviewed', status: 'rejected', ...base })
    expect(screen.getByText('Reserva rechazada')).toBeInTheDocument()
  })

  it('evento desconocido', async () => {
    mount()
    await emit({ type: 'otro', x: 1 })
    expect(screen.getByText('Notificación')).toBeInTheDocument()
    expect(screen.getByText('{"type":"otro","x":1}')).toBeInTheDocument()
  })

  it('mantiene máximo 5 toasts y permite cerrar uno', async () => {
    mount()
    for (let i = 1; i <= 7; i++) {
      await emit({ type: 'reservation_created', space_name: `S${i}`, date: 'd', start_time: 'a', end_time: 'b', code: `C${i}` })
    }
    expect(screen.getAllByRole('status')).toHaveLength(5)
    expect(screen.queryByText('C1')).not.toBeInTheDocument()
    expect(screen.getByText('C7')).toBeInTheDocument()
    await userEvent.click(screen.getAllByLabelText('Cerrar notificación')[0])
    expect(screen.getAllByRole('status')).toHaveLength(4)
  })

  it('notify manual y autodescarte', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mount()
    await waitFor(() => expect(n).toBeTruthy())
    act(() => n.notify({ title: 'Hola', duration: 1000 }))
    expect(screen.getByText('Hola')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1500) })
    expect(screen.queryByText('Hola')).not.toBeInTheDocument()
  })

  it('genId usa un respaldo si no hay crypto.randomUUID', async () => {
    vi.stubGlobal('crypto', undefined)
    mount()
    await waitFor(() => expect(n).toBeTruthy())
    act(() => n.notify({ title: 'Sin crypto' }))
    expect(screen.getByText('Sin crypto')).toBeInTheDocument()
  })

  it('dismiss directo', async () => {
    mount()
    await waitFor(() => expect(n).toBeTruthy())
    act(() => n.dismiss('inexistente'))
  })

  it('useNotifications fuera del provider lanza', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<NotifyProbe />)).toThrow('useNotifications debe usarse dentro de NotificationProvider')
    spy.mockRestore()
  })
})
