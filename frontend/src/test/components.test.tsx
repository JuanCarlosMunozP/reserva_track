import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({ usuario: null as Record<string, unknown> | null }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ usuario: authState.usuario, loading: false }) }))

const svc = vi.hoisted(() => ({ reservations: vi.fn(), responsibilities: vi.fn(), spaces: vi.fn() }))
vi.mock('../services/reservaTrack.service', () => ({ reservaTrackService: svc }))

import { ErrorBoundary } from '../components/ErrorBoundary'
import { FormField, Modal, PageHeader, Panel, PrimaryButton, StatusBadge, inputClass } from '../components/domain/DomainUI'
import { HistorySection } from '../components/domain/HistorySection'
import { ReportsSection } from '../components/domain/ReportsSection'
import { ReservaLayout } from '../components/layout/ReservaLayout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Toast } from '../components/ui/Toast'
import { ToastContainer } from '../components/ui/ToastContainer'
import type { Reservation, Responsibility, Space } from '../types/reservaTrack'

const res = (o: Partial<Reservation>): Reservation => ({
  id: 1, code: 'RT-1', userId: 7, applicantName: 'Ana', spaceId: 1, spaceName: 'Lab', date: '2999-01-01',
  startTime: '08:00', endTime: '10:00', status: 'pending', reason: 'motivo', ...o,
})
const space = (o: Partial<Space>): Space => ({
  id: 1, name: 'Lab', description: '', category: 'laboratory', capacity: 10, location: '', isActive: true, responsibleNames: [], ...o,
})

// ---------------------------------------------------------------- ui/Button
describe('Button', () => {
  it('renderiza hijos, variante y tamaño', () => {
    render(<Button variant="danger" size="lg" fullWidth className="extra">Borrar</Button>)
    const b = screen.getByRole('button', { name: 'Borrar' })
    expect(b).toHaveClass('bg-red-600', 'h-12', 'w-full', 'extra')
  })
  it('muestra íconos izquierdo/derecho y dispara onClick', async () => {
    const onClick = vi.fn()
    render(<Button leftIcon={<i data-testid="l" />} rightIcon={<i data-testid="r" />} onClick={onClick}>Ok</Button>)
    expect(screen.getByTestId('l')).toBeInTheDocument()
    expect(screen.getByTestId('r')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })
  it('loading deshabilita y reemplaza los íconos por el spinner', () => {
    const { container } = render(<Button loading leftIcon={<i data-testid="l" />} rightIcon={<i data-testid="r" />}>Ok</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.queryByTestId('l')).not.toBeInTheDocument()
    expect(screen.queryByTestId('r')).not.toBeInTheDocument()
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })
  it('disabled', () => {
    render(<Button disabled>X</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})

// ---------------------------------------------------------------- ui/Input
describe('Input', () => {
  it('asocia label, muestra hint y acepta ícono', () => {
    render(<Input label="Nombre" hint="Ayuda" leftIcon={<i data-testid="ic" />} />)
    expect(screen.getByLabelText('Nombre')).toHaveClass('pl-10')
    expect(screen.getByText('Ayuda')).toBeInTheDocument()
    expect(screen.getByTestId('ic')).toBeInTheDocument()
  })
  it('el error tiene prioridad sobre el hint', () => {
    render(<Input label="N" hint="Ayuda" error="Malo" id="mi-id" />)
    expect(screen.getByText('Malo')).toBeInTheDocument()
    expect(screen.queryByText('Ayuda')).not.toBeInTheDocument()
    expect(screen.getByLabelText('N')).toHaveAttribute('id', 'mi-id')
  })
  it('sin label ni mensajes', () => {
    render(<Input placeholder="p" />)
    expect(screen.getByPlaceholderText('p')).toHaveAttribute('type', 'text')
  })
  it('contraseña: alterna visibilidad', async () => {
    render(<Input label="Clave" type="password" />)
    const input = screen.getByLabelText('Clave')
    expect(input).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(input).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }))
    expect(input).toHaveAttribute('type', 'password')
  })
  it('reenvía la ref', () => {
    const ref = { current: null as HTMLInputElement | null }
    render(<Input ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })
})

// ---------------------------------------------------------------- ui/Toast
describe('Toast / ToastContainer', () => {
  afterEach(() => vi.useRealTimers())

  it('muestra título, cuerpo y meta; cierra con el botón', async () => {
    const onDismiss = vi.fn()
    render(<Toast toast={{ id: 'a', title: 'T', body: 'B', meta: 'M' }} onDismiss={onDismiss} />)
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('M')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Cerrar notificación'))
    expect(onDismiss).toHaveBeenCalledWith('a')
  })
  it('solo título', () => {
    render(<Toast toast={{ id: 'a', title: 'Solo' }} onDismiss={() => {}} />)
    expect(screen.getByText('Solo')).toBeInTheDocument()
  })
  it('se autodescarta (6 s por defecto o duración propia)', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const { rerender } = render(<Toast toast={{ id: 'a', title: 'T' }} onDismiss={onDismiss} />)
    vi.advanceTimersByTime(5999)
    expect(onDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDismiss).toHaveBeenCalledWith('a')
    rerender(<Toast toast={{ id: 'b', title: 'T', duration: 100 }} onDismiss={onDismiss} />)
    vi.advanceTimersByTime(100)
    expect(onDismiss).toHaveBeenCalledWith('b')
  })
  it('el contenedor no renderiza nada sin toasts y usa portal con ellos', () => {
    const { rerender, baseElement } = render(<ToastContainer toasts={[]} onDismiss={() => {}} />)
    expect(baseElement.querySelector('[aria-label="Notificaciones"]')).toBeNull()
    rerender(<ToastContainer toasts={[{ id: '1', title: 'Uno' }, { id: '2', title: 'Dos' }]} onDismiss={() => {}} />)
    expect(within(document.body).getByLabelText('Notificaciones')).toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(2)
  })
})

// ---------------------------------------------------------------- ErrorBoundary
describe('ErrorBoundary', () => {
  let shouldThrow = true
  const Bomb = () => { if (shouldThrow) throw new Error('boom'); return <p>ok</p> }
  beforeEach(() => {
    shouldThrow = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('renderiza hijos si no hay error', () => {
    shouldThrow = false
    render(<ErrorBoundary><Bomb /></ErrorBoundary>)
    expect(screen.getByText('ok')).toBeInTheDocument()
  })
  it('muestra el fallback y registra con y sin scope', () => {
    const { unmount } = render(<ErrorBoundary><Bomb /></ErrorBoundary>)
    expect(screen.getByText('Algo salió mal en esta pantalla')).toBeInTheDocument()
    expect(console.error).toHaveBeenCalledWith('[ErrorBoundary]', expect.any(Error), expect.any(String))
    unmount()
    render(<ErrorBoundary scope="panel"><Bomb /></ErrorBoundary>)
    expect(console.error).toHaveBeenCalledWith('[ErrorBoundary · panel]', expect.any(Error), expect.any(String))
  })
  it('Reintentar vuelve a renderizar los hijos', async () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>)
    shouldThrow = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(screen.getByText('ok')).toBeInTheDocument()
  })
  it('se limpia al cambiar resetKey', () => {
    const { rerender } = render(<ErrorBoundary resetKey="a"><Bomb /></ErrorBoundary>)
    shouldThrow = false
    rerender(<ErrorBoundary resetKey="a"><Bomb /></ErrorBoundary>)
    expect(screen.getByText('Algo salió mal en esta pantalla')).toBeInTheDocument()
    rerender(<ErrorBoundary resetKey="b"><Bomb /></ErrorBoundary>)
    expect(screen.getByText('ok')).toBeInTheDocument()
  })
  it('Recargar la página llama a location.reload', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    render(<ErrorBoundary><Bomb /></ErrorBoundary>)
    await userEvent.click(screen.getByRole('button', { name: 'Recargar la página' }))
    expect(reload).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

// ---------------------------------------------------------------- DomainUI
describe('DomainUI', () => {
  it('PageHeader con y sin acción', () => {
    const { rerender } = render(<PageHeader eyebrow="E" title="Título" description="Desc" action={<button>Acción</button>} />)
    expect(screen.getByRole('heading', { name: 'Título' })).toBeInTheDocument()
    expect(screen.getByText('E')).toBeInTheDocument()
    expect(screen.getByText('Desc')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Acción' })).toBeInTheDocument()
    rerender(<PageHeader eyebrow="E" title="Título" description="Desc" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('PrimaryButton por defecto es type=button y acepta submit', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<PrimaryButton onClick={onClick}>Ir</PrimaryButton>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
    rerender(<PrimaryButton type="submit">Enviar</PrimaryButton>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })
  it('Panel aplica className', () => {
    const { container, rerender } = render(<Panel className="x-y">Hola</Panel>)
    expect(container.querySelector('section')).toHaveClass('x-y')
    rerender(<Panel>Hola</Panel>)
    expect(screen.getByText('Hola')).toBeInTheDocument()
  })
  it.each([
    ['approved', 'Aprobada'], ['active', 'Activo'], ['pending', 'Pendiente'],
    ['rejected', 'Rechazada'], ['canceled', 'Cancelada'], ['inactive', 'Inactivo'],
  ] as const)('StatusBadge %s', (status, label) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
  it('FormField asocia etiqueta y control', () => {
    render(<FormField label="Nombre"><input className={inputClass} /></FormField>)
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
  })
  it('Modal cerrado no renderiza', () => {
    render(<Modal open={false} title="M" onClose={() => {}} onSubmit={() => {}} submitLabel="Ok">x</Modal>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('Modal abierto: enviar, cancelar, cerrar y clic en el fondo', async () => {
    const onClose = vi.fn()
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(<Modal open title="Mi modal" onClose={onClose} onSubmit={onSubmit} submitLabel="Guardar"><p>contenido</p></Modal>)
    const dialog = screen.getByRole('dialog', { name: 'Mi modal' })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(onSubmit).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    // clic dentro del diálogo no cierra
    await userEvent.pointer({ keys: '[MouseLeft>]', target: dialog })
    expect(onClose).toHaveBeenCalledTimes(2)
    // clic en el fondo sí
    await userEvent.pointer({ keys: '[MouseLeft>]', target: dialog.parentElement! })
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})

// ---------------------------------------------------------------- HistorySection
describe('HistorySection', () => {
  beforeEach(() => {
    authState.usuario = { id: 7, area: 'Ciencias' }
    svc.reservations.mockReset(); svc.responsibilities.mockReset()
  })

  it('modo estudiante: estadísticas, tabla y filtro de próximas', async () => {
    svc.reservations.mockResolvedValue([
      res({ id: 1, code: 'A-1', status: 'approved', date: '2999-05-05' }),
      res({ id: 2, code: 'A-2', status: 'pending', date: '2000-01-01' }),
      res({ id: 3, code: 'A-3', status: 'canceled', date: '2999-06-06' }),
      res({ id: 4, code: 'OTRO', userId: 99 }),
    ])
    render(<HistorySection mode="student" />)
    expect(await screen.findByText('A-1')).toBeInTheDocument()
    expect(screen.getByText('Solicitudes realizadas').parentElement).toHaveTextContent('03')
    expect(screen.queryByText('OTRO')).not.toBeInTheDocument()
    expect(screen.queryByText('Solicitante')).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox'), 'upcoming')
    expect(screen.queryByText('A-2')).not.toBeInTheDocument()
    expect(screen.getByText('A-1')).toBeInTheDocument()
  })

  it('modo estudiante sin reservas muestra el vacío (usuario anónimo usa id 7)', async () => {
    authState.usuario = null
    svc.reservations.mockResolvedValue([])
    render(<HistorySection mode="student" />)
    expect(await screen.findByText('Todavía no tienes reservas en este periodo.')).toBeInTheDocument()
  })

  it('modo docente: agrupa por curso y muestra solicitudes propias', async () => {
    svc.reservations.mockResolvedValue([
      res({ id: 1, code: 'S-1', userId: 2, applicantType: 'student', applicantCourse: 'Zeta', status: 'pending', spaceId: 1 }),
      res({ id: 2, code: 'S-2', userId: 3, applicantType: 'student', applicantCourse: 'Alfa', status: 'approved', spaceId: 1 }),
      res({ id: 3, code: 'S-3', userId: 4, applicantType: 'student', applicantCourse: '  ', status: 'approved', spaceId: 1 }),
      res({ id: 4, code: 'S-4', userId: 5, applicantType: 'student', status: 'approved', spaceId: 1 }),
      res({ id: 5, code: 'MIA', userId: 7, applicantType: 'teacher', spaceId: 1 }),
      res({ id: 6, code: 'AJENA', userId: 2, applicantType: 'student', spaceId: 99 }),
    ])
    const r: Responsibility[] = [
      { id: 1, userId: 7, userName: 'Yo', spaceId: 1, spaceName: 'Lab', isActive: true, assignmentDate: '2026-01-01' },
      { id: 2, userId: 7, userName: 'Yo', spaceId: 99, spaceName: 'X', isActive: false, assignmentDate: '2026-01-01' },
    ]
    svc.responsibilities.mockResolvedValue(r)
    render(<HistorySection mode="teacher" />)
    expect(await screen.findByText('Curso: Alfa')).toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(['Curso: Alfa', 'Curso: Curso sin especificar', 'Curso: Zeta', 'Mis solicitudes · Área: Ciencias'])
    expect(screen.queryByText('AJENA')).not.toBeInTheDocument()
    expect(screen.getByText('MIA')).toBeInTheDocument()
    expect(screen.getByText(/Área: Ciencias/, { selector: 'p' })).toBeInTheDocument()
  })

  it('modo docente sin datos y sin área', async () => {
    authState.usuario = { id: 7 }
    svc.reservations.mockResolvedValue([])
    svc.responsibilities.mockResolvedValue([])
    render(<HistorySection mode="teacher" />)
    expect(await screen.findByText('No hay solicitudes en tus espacios asignados.')).toBeInTheDocument()
    expect(screen.getByText(/Sin área asignada/)).toBeInTheDocument()
    expect(screen.getByText('Sin área')).toBeInTheDocument()
  })

  it('el filtro "Próximas" también aplica al docente', async () => {
    svc.reservations.mockResolvedValue([
      res({ id: 1, code: 'VIEJA', userId: 2, applicantType: 'student', date: '2000-01-01', spaceId: 1 }),
      res({ id: 2, code: 'NUEVA', userId: 2, applicantType: 'student', date: '2999-01-01', spaceId: 1 }),
    ])
    svc.responsibilities.mockResolvedValue([{ id: 1, userId: 7, userName: 'Yo', spaceId: 1, spaceName: 'Lab', isActive: true, assignmentDate: '2026-01-01' }])
    render(<HistorySection mode="teacher" />)
    await screen.findByText('VIEJA')
    await userEvent.selectOptions(screen.getByRole('combobox'), 'upcoming')
    expect(screen.queryByText('VIEJA')).not.toBeInTheDocument()
    expect(screen.getByText('NUEVA')).toBeInTheDocument()
  })

  it('no actualiza el estado tras desmontar', async () => {
    let resolve!: (v: Reservation[]) => void
    svc.reservations.mockReturnValue(new Promise<Reservation[]>((r) => { resolve = r }))
    const { unmount } = render(<HistorySection mode="student" />)
    unmount()
    await act(async () => { resolve([res({})]) })
  })
})

// ---------------------------------------------------------------- ReportsSection
describe('ReportsSection', () => {
  beforeEach(() => { svc.reservations.mockReset(); svc.spaces.mockReset() })

  it('sin datos', async () => {
    svc.reservations.mockResolvedValue([])
    svc.spaces.mockResolvedValue([])
    render(<ReportsSection />)
    expect(await screen.findByText('Sin datos')).toBeInTheDocument()
    expect(screen.getAllByText('0%').length).toBeGreaterThan(0)
    expect(screen.getByText('0 h')).toBeInTheDocument()
    expect(screen.getByText('0 reservas')).toBeInTheDocument()
  })

  it('calcula tasa, horas, espacio más pedido y uso por categoría', async () => {
    svc.reservations.mockResolvedValue([
      res({ id: 1, status: 'approved', spaceId: 1, startTime: '08:00', endTime: '10:00' }),
      res({ id: 2, status: 'approved', spaceId: 1, startTime: '10:00', endTime: '13:00' }),
      res({ id: 3, status: 'rejected', spaceId: 2 }),
      res({ id: 4, status: 'pending', spaceId: 2 }),
    ])
    svc.spaces.mockResolvedValue([space({ id: 1, name: 'Lab A', category: 'laboratory' }), space({ id: 2, name: 'Aula B', category: 'classroom' })])
    render(<ReportsSection />)
    expect(await screen.findByText('Lab A')).toBeInTheDocument()
    expect(screen.getByText('67%')).toBeInTheDocument() // 2 de 3 revisadas
    expect(screen.getByText('5 h')).toBeInTheDocument()
    expect(screen.getByText('2 reservas')).toBeInTheDocument()
    expect(screen.getByText('Laboratorios').nextSibling).toHaveTextContent('50%')
    expect(screen.getByText('Aulas').nextSibling).toHaveTextContent('50%')
    expect(screen.getByText('Auditorios').nextSibling).toHaveTextContent('0%')
  })
})

// ---------------------------------------------------------------- ReservaLayout
describe('ReservaLayout', () => {
  const renderAt = (path: string) => render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ReservaLayout />}>
          <Route path="/" element={<p>HOME</p>} />
          <Route path="/espacios" element={<p>ESPACIOS</p>} />
          <Route path="/usuarios" element={<p>USUARIOS</p>} />
          <Route path="/timonel/reservas" element={<p>TIMONEL</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )

  it('usuario anónimo: nombre por defecto y enlaces de administración visibles', () => {
    authState.usuario = null
    renderAt('/')
    expect(screen.getByText('Timonel')).toBeInTheDocument()
    expect(screen.getByText('Módulo institucional')).toBeInTheDocument()
    expect(screen.getByText('HOME')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Usuarios/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Responsables/ })).toBeInTheDocument()
  })

  it('etiquetas de rol e iniciales', () => {
    authState.usuario = { first_name: 'Ana', last_name: 'Pérez', is_superuser: true, role: 'admin' }
    const { unmount } = renderAt('/')
    expect(screen.getByText('Ingeniero de software')).toBeInTheDocument()
    expect(screen.getByText('AP')).toBeInTheDocument()
    unmount()
    authState.usuario = { first_name: 'Ana', last_name: 'Pérez', is_superuser: false, role: 'admin' }
    const second = renderAt('/')
    expect(screen.getByText('Administrador')).toBeInTheDocument()
    second.unmount()
    authState.usuario = { first_name: 'Ana', last_name: 'Pérez', role: 'usuario', type: 'student', type_display: 'Estudiante' }
    renderAt('/')
    expect(screen.getByText('Estudiante')).toBeInTheDocument()
  })

  it('usuario normal no ve enlaces de administración; personal administrativo ve Responsables', () => {
    authState.usuario = { first_name: 'A', last_name: 'B', role: 'usuario', type: 'student' }
    const { unmount } = renderAt('/')
    expect(screen.queryByRole('link', { name: /Usuarios/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Administración')).not.toBeInTheDocument()
    unmount()
    authState.usuario = { first_name: 'A', last_name: 'B', role: 'usuario', type: 'personal_administrator' }
    renderAt('/')
    expect(screen.getByRole('link', { name: /Responsables/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Usuarios/ })).not.toBeInTheDocument()
  })

  it('menú: abre, navega (y cierra) y se cierra con el fondo', async () => {
    authState.usuario = { first_name: 'A', last_name: 'B', role: 'admin' }
    renderAt('/')
    const toggle = () => screen.getAllByRole('button', { name: /menú/ })[0]
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    // el fondo (segundo botón "Cerrar menú") cierra
    await userEvent.click(screen.getAllByRole('button', { name: 'Cerrar menú' })[1])
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle())
    await userEvent.click(screen.getByRole('link', { name: /Espacios/ }))
    expect(screen.getByText('ESPACIOS')).toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    // enlaces de administración también cierran
    await userEvent.click(toggle())
    await userEvent.click(screen.getByRole('link', { name: /Usuarios/ }))
    expect(screen.getByText('USUARIOS')).toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('rutas /timonel/ usan el layout mínimo sin cabecera', () => {
    authState.usuario = null
    renderAt('/timonel/reservas')
    expect(screen.getByText('TIMONEL')).toBeInTheDocument()
    expect(screen.queryByText('ReservaTrack')).not.toBeInTheDocument()
  })
})
