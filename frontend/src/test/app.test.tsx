import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), verifyMfa: vi.fn(), logout: vi.fn(), mfaStatus: vi.fn() }))
vi.mock('../services/auth.service', () => ({ authService: auth }))

vi.mock('../lib/websocket', () => ({
  notificationsSocket: { connect: vi.fn(), disconnect: vi.fn(), on: () => () => {} },
}))

const svc = vi.hoisted(() => ({
  reservations: vi.fn(), spaces: vi.fn(), users: vi.fn(), responsibilities: vi.fn(),
}))
vi.mock('../services/reservaTrack.service', () => ({ reservaTrackService: svc }))

import App from '../App'

const ADMIN = { id: 1, username: 'admin', first_name: 'Ada', last_name: 'Min', role: 'admin', type: 'personal_administrator', is_active: true, is_superuser: false }
const STUDENT = { ...ADMIN, id: 2, username: 'est', role: 'usuario', type: 'student' }

function go(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

beforeEach(() => {
  Object.values(auth).forEach((f) => f.mockReset())
  Object.values(svc).forEach((f) => f.mockReset())
  svc.reservations.mockResolvedValue([])
  svc.spaces.mockResolvedValue([])
  svc.users.mockResolvedValue([])
  svc.responsibilities.mockResolvedValue([])
  auth.mfaStatus.mockResolvedValue({ enabled: false, recovery_codes_remaining: 0 })
})

describe('App · enrutamiento', () => {
  it('"/" muestra el panel principal dentro del layout', async () => {
    auth.me.mockResolvedValue(ADMIN)
    go('/')
    expect(await screen.findByRole('heading', { name: 'Panel principal' })).toBeInTheDocument()
    expect(screen.getByText('ReservaTrack')).toBeInTheDocument()
  })

  it.each([
    ['/espacios', 'Espacios institucionales'],
    ['/disponibilidad', 'Disponibilidad'],
    ['/reservas', 'Reservas'],
    ['/timonel/reservas', 'Reserva de aulas y espacios académicos'],
    ['/seguridad', 'Seguridad de la cuenta'],
    ['/registro', 'Registrarse'],
    ['/usuarios', 'Usuarios'],
    ['/responsables', 'Responsables'],
  ])('%s renderiza su página para administrador', async (path, heading) => {
    auth.me.mockResolvedValue(ADMIN)
    go(path)
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it.each(['/historial', '/reportes', '/ruta-inexistente'])('%s redirige a "/"', async (path) => {
    auth.me.mockResolvedValue(ADMIN)
    go(path)
    await screen.findByRole('heading', { name: 'Panel principal' })
    expect(window.location.pathname).toBe('/')
  })

  it('/usuarios y /responsables redirigen a "/" si no hay permiso', async () => {
    auth.me.mockResolvedValue(STUDENT)
    go('/usuarios')
    await screen.findByRole('heading', { name: 'Panel principal' })
    expect(window.location.pathname).toBe('/')
    window.history.pushState({}, '', '/responsables')
  })

  it('/responsables redirige a "/" para un estudiante', async () => {
    auth.me.mockResolvedValue(STUDENT)
    go('/responsables')
    await screen.findByRole('heading', { name: 'Panel principal' })
    expect(window.location.pathname).toBe('/')
  })

  it('mientras se hidrata la sesión la ruta protegida no renderiza nada', async () => {
    let resolve!: (v: unknown) => void
    auth.me.mockReturnValue(new Promise((r) => { resolve = r }))
    go('/usuarios')
    expect(screen.queryByRole('heading', { name: 'Usuarios' })).not.toBeInTheDocument()
    resolve(ADMIN)
    expect(await screen.findByRole('heading', { name: 'Usuarios' })).toBeInTheDocument()
  })

  it('un error de render queda contenido por el ErrorBoundary', async () => {
    auth.me.mockResolvedValue(ADMIN)
    svc.reservations.mockResolvedValue([{ id: 1, status: 'approved', spaceId: 1, startTime: undefined, endTime: undefined }])
    svc.spaces.mockResolvedValue([])
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    go('/')
    await waitFor(() => expect(screen.getByText('Algo salió mal en esta pantalla')).toBeInTheDocument())
    err.mockRestore()
  })
})
