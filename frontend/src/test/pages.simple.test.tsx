import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({ usuario: null as Record<string, unknown> | null }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ usuario: authState.usuario, loading: false }) }))

const svc = vi.hoisted(() => ({
  reservations: vi.fn(), spaces: vi.fn(), users: vi.fn(), responsibilities: vi.fn(),
  assignResponsibility: vi.fn(), register: vi.fn(), setUserActive: vi.fn(),
  setUserRole: vi.fn(), deleteUser: vi.fn(), createUser: vi.fn(), setUserPassword: vi.fn(),
}))
vi.mock('../services/reservaTrack.service', () => ({ reservaTrackService: svc }))

import { AvailabilityPage } from '../pages/availability/AvailabilityPage'
import { DashboardPage } from '../pages/dashboard/DashboardPage'
import { RegistrationPage } from '../pages/registration/RegistrationPage'
import { ResponsibilitiesPage } from '../pages/users/ResponsibilitiesPage'
import { UsersPage } from '../pages/users/UsersPage'
import type { AppUser, Reservation, Responsibility, Space } from '../types/reservaTrack'

function Where() {
  const l = useLocation()
  return <span data-testid="where">{l.pathname}{l.state ? `|${(l.state as { notice?: string }).notice}` : ''}</span>
}
const mount = (ui: React.ReactNode, path = '/x') => render(
  <MemoryRouter initialEntries={[path]}>
    <Where />
    <Routes>
      <Route path="*" element={ui} />
    </Routes>
  </MemoryRouter>,
)
const where = () => screen.getByTestId('where').textContent

const res = (o: Partial<Reservation>): Reservation => ({
  id: 1, code: 'RT-1', userId: 7, applicantName: 'Ana', spaceId: 1, spaceName: 'Lab', date: '2999-01-01',
  startTime: '08:00', endTime: '10:00', status: 'pending', reason: 'motivo', ...o,
})
const space = (o: Partial<Space>): Space => ({
  id: 1, name: 'Lab', description: '', category: 'laboratory', capacity: 10, location: '', isActive: true, responsibleNames: [], ...o,
})
const user = (o: Partial<AppUser>): AppUser => ({
  id: 1, username: 'u', firstName: 'Ana', lastName: 'Pérez', email: 'ana@x.co', type: 'student', role: 'usuario', isActive: true, ...o,
})
const httpError = (status: number, data: unknown = {}) =>
  new AxiosError('x', 'E', undefined, {}, { status, data, headers: {}, statusText: '', config: {} } as never)

beforeEach(() => {
  authState.usuario = null
  Object.values(svc).forEach((f) => f.mockReset())
  svc.reservations.mockResolvedValue([])
  svc.spaces.mockResolvedValue([])
  svc.users.mockResolvedValue([])
  svc.responsibilities.mockResolvedValue([])
})

// ------------------------------------------------------------- Availability
function weekKey(offsetDays: number) {
  // misma lógica que AvailabilityPage.mondayFor(0)
  const d = new Date()
  d.setDate(d.getDate() + (d.getDay() === 0 ? 1 : 1 - d.getDay()) + offsetDays)
  d.setHours(12, 0, 0, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('AvailabilityPage', () => {
  const rows = [
    res({ id: 1, date: weekKey(0), startTime: '08:00', spaceId: 1, spaceName: 'Lab A', applicantName: 'Persona 1' }),
    res({ id: 2, date: weekKey(1), spaceId: 2, spaceName: 'Aula B', applicantName: 'Persona 2', status: 'approved' }),
    res({ id: 3, date: weekKey(2), status: 'rejected', applicantName: 'Rechazada X' }),
    res({ id: 4, date: weekKey(2), status: 'canceled', applicantName: 'Cancelada X' }),
  ]
  beforeEach(() => {
    svc.reservations.mockResolvedValue(rows)
    svc.spaces.mockResolvedValue([space({ id: 1, name: 'Lab A' }), space({ id: 2, name: 'Aula B' })])
  })

  it('muestra la semana con reservas, excluye rechazadas/canceladas y lista la ocupación', async () => {
    mount(<AvailabilityPage />)
    expect(await screen.findAllByText('Persona 1')).not.toHaveLength(0)
    expect(screen.getAllByText('Persona 2')).not.toHaveLength(0)
    expect(screen.queryByText('Rechazada X')).not.toBeInTheDocument()
    expect(screen.queryByText('Cancelada X')).not.toBeInTheDocument()
    expect(screen.getAllByText('Sin reservas').length).toBe(5)
    expect(screen.getByText('Ocupación registrada')).toBeInTheDocument()
  })

  it('filtra por espacio', async () => {
    mount(<AvailabilityPage />)
    await screen.findAllByText('Persona 1')
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por espacio'), '2')
    expect(screen.queryByText('Persona 1')).not.toBeInTheDocument()
    expect(screen.getAllByText('Persona 2')).not.toHaveLength(0)
  })

  it('navega entre semanas y vuelve a hoy', async () => {
    mount(<AvailabilityPage />)
    await screen.findAllByText('Persona 1')
    await userEvent.click(screen.getByLabelText('Semana siguiente'))
    expect(screen.queryByText('Persona 1')).not.toBeInTheDocument()
    expect(screen.getAllByText('Sin reservas')).toHaveLength(7)
    await userEvent.click(screen.getByLabelText('Semana anterior'))
    await userEvent.click(screen.getByLabelText('Semana anterior'))
    expect(screen.queryByText('Persona 1')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Hoy' }))
    expect(screen.getAllByText('Persona 1')).not.toHaveLength(0)
  })

  it('"Solicitar reserva" navega a /reservas', async () => {
    mount(<AvailabilityPage />)
    await userEvent.click(screen.getByRole('button', { name: /Solicitar reserva/ }))
    expect(where()).toBe('/reservas')
  })
})

// ---------------------------------------------------------------- Dashboard
describe('DashboardPage', () => {
  it('muestra estadísticas, solicitudes y actividad; navega con sus botones', async () => {
    authState.usuario = null
    mount(<DashboardPage />)
    expect(screen.getByRole('heading', { name: 'Panel principal' })).toBeInTheDocument()
    expect(screen.getByText('Espacios registrados')).toBeInTheDocument()
    expect(screen.getByText('RT-2026-041')).toBeInTheDocument()
    expect(screen.getByText('Aprobada')).toBeInTheDocument()
    expect(screen.getAllByText('Pendiente')).toHaveLength(2)
    expect(screen.getByText('Rechazada')).toBeInTheDocument()
    expect(screen.getByText('Actividad reciente')).toBeInTheDocument()
    await screen.findByText('Sin datos')
    await userEvent.click(screen.getByRole('button', { name: /Nueva reserva/ }))
    expect(where()).toBe('/reservas')
    await userEvent.click(screen.getByRole('button', { name: /Ver todas/ }))
    expect(where()).toBe('/reservas')
  })

  it('oculta "Nueva reserva" si el usuario no puede crear', async () => {
    authState.usuario = { role: 'usuario', type: 'other', is_superuser: false }
    mount(<DashboardPage />)
    expect(screen.queryByRole('button', { name: /Nueva reserva/ })).not.toBeInTheDocument()
    await screen.findByText('Sin datos')
  })
})

// ------------------------------------------------------------- Registration
describe('RegistrationPage', () => {
  const fillBase = async () => {
    await userEvent.type(screen.getByLabelText('Nombres'), 'Ana')
    await userEvent.type(screen.getByLabelText('Apellidos'), 'Pérez')
    await userEvent.type(screen.getByLabelText('Usuario'), 'ana.p')
    await userEvent.type(screen.getByLabelText('Correo institucional'), 'ana@x.co')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave12345')
  }

  it('estudiante: pide curso, registra y navega con aviso', async () => {
    svc.register.mockResolvedValue(user({}))
    mount(<RegistrationPage />)
    await fillBase()
    await userEvent.type(screen.getByLabelText('Curso'), 'Sistemas')
    await userEvent.click(screen.getByRole('button', { name: /Registrarme/ }))
    await waitFor(() => expect(svc.register).toHaveBeenCalledWith({
      username: 'ana.p', first_name: 'Ana', last_name: 'Pérez', email: 'ana@x.co', type: 'student',
      course: 'Sistemas', area: '', password: 'clave12345',
    }))
    await waitFor(() => expect(where()).toBe('/|Tu cuenta se registró correctamente.'))
  })

  it('docente: pide área', async () => {
    svc.register.mockResolvedValue(user({}))
    mount(<RegistrationPage />)
    await userEvent.selectOptions(screen.getByLabelText('Tipo de usuario'), 'teacher')
    expect(screen.queryByLabelText('Curso')).not.toBeInTheDocument()
    await fillBase()
    await userEvent.type(screen.getByLabelText('Área'), '  Ciencias ')
    await userEvent.click(screen.getByRole('button', { name: /Registrarme/ }))
    await waitFor(() => expect(svc.register).toHaveBeenCalledWith(expect.objectContaining({ type: 'teacher', area: 'Ciencias', course: '' })))
  })

  it('personal administrativo: área opcional', async () => {
    svc.register.mockResolvedValue(user({}))
    mount(<RegistrationPage />)
    await userEvent.selectOptions(screen.getByLabelText('Tipo de usuario'), 'personal_administrator')
    await fillBase()
    await userEvent.click(screen.getByRole('button', { name: /Registrarme/ }))
    await waitFor(() => expect(svc.register).toHaveBeenCalledWith(expect.objectContaining({ type: 'personal_administrator', area: '' })))
  })

  it('muestra el error del backend y vuelve a habilitar el botón', async () => {
    svc.register.mockRejectedValue(httpError(400, { username: ['Ya existe'] }))
    mount(<RegistrationPage />)
    await fillBase()
    await userEvent.type(screen.getByLabelText('Curso'), 'S')
    await userEvent.click(screen.getByRole('button', { name: /Registrarme/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe')
    expect(screen.getByRole('button', { name: /Registrarme/ })).toBeInTheDocument()
    expect(where()).toBe('/x')
  })

  it('muestra "Creando cuenta…" mientras guarda', async () => {
    let done!: (v: unknown) => void
    svc.register.mockReturnValue(new Promise((r) => { done = r }))
    mount(<RegistrationPage />)
    await fillBase()
    await userEvent.type(screen.getByLabelText('Curso'), 'S')
    await userEvent.click(screen.getByRole('button', { name: /Registrarme/ }))
    expect(await screen.findByRole('button', { name: /Creando cuenta/ })).toBeInTheDocument()
    done(user({}))
    await waitFor(() => expect(where()).toContain('/|'))
  })

  it('el enlace vuelve al panel', () => {
    mount(<RegistrationPage />)
    expect(screen.getByRole('link', { name: /Volver al panel/ })).toHaveAttribute('href', '/')
  })
})

// -------------------------------------------------------------------- Users
describe('UsersPage', () => {
  it('lista usuarios, etiquetas de rol/tipo/estado y filtra', async () => {
    svc.users.mockResolvedValue([
      user({ id: 1, firstName: 'Ana', lastName: 'Admin', role: 'admin', type: 'personal_administrator', email: 'a@x.co' }),
      user({ id: 2, firstName: 'Beto', lastName: 'Doc', role: 'usuario', type: 'teacher', email: 'b@x.co', isActive: false }),
      user({ id: 3, firstName: 'Cami', lastName: 'Est', type: 'student', email: 'c@x.co' }),
    ])
    mount(<UsersPage />)
    expect(await screen.findByText('Ana Admin')).toBeInTheDocument()
    expect(screen.getByText('3 cuentas')).toBeInTheDocument()
    expect(screen.getByText('Administrador')).toBeInTheDocument()
    expect(screen.getByText('Personal administrativo')).toBeInTheDocument()
    expect(screen.getByText('Docente')).toBeInTheDocument()
    expect(screen.getByText('Estudiante')).toBeInTheDocument()
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText('Buscar usuario…'), 'TEACHER')
    expect(screen.queryByText('Ana Admin')).not.toBeInTheDocument()
    expect(screen.getByText('Beto Doc')).toBeInTheDocument()
  })
})

describe('UsersPage · activar y desactivar', () => {
  it('desactiva un usuario activo y actualiza la fila', async () => {
    svc.users.mockResolvedValue([user({ id: 3, firstName: 'Cami', lastName: 'Est', isActive: true })])
    svc.setUserActive.mockResolvedValue(user({ id: 3, firstName: 'Cami', lastName: 'Est', isActive: false }))
    mount(<UsersPage />)
    await userEvent.click(await screen.findByLabelText('Desactivar Cami Est'))
    expect(svc.setUserActive).toHaveBeenCalledWith(3, false)
    expect(await screen.findByLabelText('Activar Cami Est')).toBeInTheDocument()
  })

  it('muestra el error si falla', async () => {
    svc.users.mockResolvedValue([user({ id: 3, firstName: 'Cami', lastName: 'Est' })])
    svc.setUserActive.mockRejectedValue(new Error('x'))
    mount(<UsersPage />)
    await userEvent.click(await screen.findByLabelText('Desactivar Cami Est'))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('UsersPage · acciones del superusuario', () => {
  beforeEach(() => { authState.usuario = { id: 1, role: 'admin', type: 'personal_administrator', is_superuser: true } })

  it('cambia el rol', async () => {
    svc.users.mockResolvedValue([user({ id: 3, firstName: 'Cami', lastName: 'Est' })])
    svc.setUserRole.mockResolvedValue(user({ id: 3, firstName: 'Cami', lastName: 'Est', role: 'admin' }))
    mount(<UsersPage />)
    await userEvent.selectOptions(await screen.findByLabelText('Rol de Cami Est'), 'admin')
    expect(svc.setUserRole).toHaveBeenCalledWith(3, 'admin')
    expect(await screen.findByText('Rol actualizado.')).toBeInTheDocument()
  })

  it('elimina un usuario y recarga la lista', async () => {
    svc.users.mockResolvedValue([user({ id: 3, firstName: 'Cami', lastName: 'Est' })])
    svc.deleteUser.mockResolvedValue([])
    mount(<UsersPage />)
    await userEvent.click(await screen.findByLabelText('Eliminar Cami Est'))
    expect(svc.deleteUser).toHaveBeenCalledWith(3)
    await waitFor(() => expect(screen.queryByText('Cami Est')).not.toBeInTheDocument())
  })

  it('crea un usuario', async () => {
    svc.users.mockResolvedValue([])
    svc.createUser.mockResolvedValue([user({ id: 9, firstName: 'Nuevo', lastName: 'Usr' })])
    mount(<UsersPage />)
    await userEvent.click(await screen.findByRole('button', { name: /Nuevo usuario/ }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('Nombre'), 'Nuevo')
    await userEvent.type(dialog.getByLabelText('Apellido'), 'Usr')
    await userEvent.type(dialog.getByLabelText('Usuario'), 'nuevo')
    await userEvent.type(dialog.getByLabelText('Correo'), 'n@x.co')
    await userEvent.type(dialog.getByLabelText('Contraseña'), 'Clave-Segura-123')
    await userEvent.click(dialog.getByRole('button', { name: 'Crear usuario' }))
    expect(svc.createUser).toHaveBeenCalledWith(expect.objectContaining({ username: 'nuevo', email: 'n@x.co', type: 'student', role: 'usuario' }))
    expect(await screen.findByText('Nuevo Usr')).toBeInTheDocument()
  })

  it('cierra el cuadro de nuevo usuario sin crear', async () => {
    svc.users.mockResolvedValue([])
    mount(<UsersPage />)
    await userEvent.click(await screen.findByRole('button', { name: /Nuevo usuario/ }))
    await userEvent.click(screen.getByLabelText('Cerrar'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(svc.createUser).not.toHaveBeenCalled()
  })

  it('muestra el error si falla crear', async () => {
    svc.users.mockResolvedValue([])
    svc.createUser.mockRejectedValue(httpError(400, { detail: 'Duplicado' }))
    mount(<UsersPage />)
    await userEvent.click(await screen.findByRole('button', { name: /Nuevo usuario/ }))
    const dialog = within(screen.getByRole('dialog'))
    for (const [label, value] of [['Nombre', 'A'], ['Apellido', 'B'], ['Usuario', 'ab'], ['Correo', 'a@b.co'], ['Contraseña', 'Clave-Segura-123']]) {
      await userEvent.type(dialog.getByLabelText(label), value)
    }
    await userEvent.click(dialog.getByRole('button', { name: 'Crear usuario' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('UsersPage · restablecer contraseña', () => {
  beforeEach(() => { authState.usuario = { id: 1, role: 'admin', type: 'personal_administrator', is_superuser: false } })

  it('el administrador no ve rol editable ni eliminar ni nuevo usuario', async () => {
    svc.users.mockResolvedValue([user({ id: 3, firstName: 'Cami', lastName: 'Est' })])
    mount(<UsersPage />)
    await screen.findByText('Cami Est')
    expect(screen.queryByLabelText('Rol de Cami Est')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Eliminar Cami Est')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nuevo usuario/ })).not.toBeInTheDocument()
  })

  it('restablece la contraseña y cierra el cuadro', async () => {
    svc.users.mockResolvedValue([user({ id: 3, firstName: 'Cami', lastName: 'Est' })])
    svc.setUserPassword.mockResolvedValue(undefined)
    mount(<UsersPage />)
    await userEvent.click(await screen.findByLabelText('Restablecer contraseña de Cami Est'))
    await userEvent.type(within(screen.getByRole('dialog')).getByLabelText('Nueva contraseña'), 'Otra-Clave-12345')
    await userEvent.click(screen.getByRole('button', { name: 'Restablecer' }))
    expect(svc.setUserPassword).toHaveBeenCalledWith(3, 'Otra-Clave-12345')
    expect(await screen.findByText('Contraseña restablecida.')).toBeInTheDocument()
  })

  it('cierra el cuadro sin guardar', async () => {
    svc.users.mockResolvedValue([user({ id: 3, firstName: 'Cami', lastName: 'Est' })])
    mount(<UsersPage />)
    await userEvent.click(await screen.findByLabelText('Restablecer contraseña de Cami Est'))
    await userEvent.click(screen.getByLabelText('Cerrar'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(svc.setUserPassword).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------- Responsibilities
describe('ResponsibilitiesPage', () => {
  const users = [user({ id: 3, firstName: 'Doc', lastName: 'Uno' }), user({ id: 4, firstName: 'Admin', lastName: 'X', role: 'admin' }), user({ id: 5, firstName: 'Off', lastName: 'Y', isActive: false })]
  const spaces = [space({ id: 1, name: 'Lab' }), space({ id: 2, name: 'Aula' }), space({ id: 3, name: 'Cerrada', isActive: false })]
  const asg: Responsibility[] = [
    { id: 1, userId: 3, userName: 'Doc Uno', spaceId: 1, spaceName: 'Lab', isActive: true, assignmentDate: '2026-10-15' },
    { id: 2, userId: 3, userName: 'Doc Uno', spaceId: 2, spaceName: 'Aula', isActive: false, assignmentDate: '2026-10-16' },
  ]
  beforeEach(() => {
    svc.users.mockResolvedValue(users)
    svc.spaces.mockResolvedValue(spaces)
    svc.responsibilities.mockResolvedValue(asg)
  })

  it('administrador: ve todas las asignaciones y puede asignar', async () => {
    authState.usuario = { id: 99, role: 'admin' }
    svc.assignResponsibility.mockResolvedValue([...asg, { ...asg[0], id: 9 }])
    mount(<ResponsibilitiesPage />)
    expect(await screen.findByText('2 responsables')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Asignar responsable/ }))
    const dialog = screen.getByRole('dialog')
    // solo usuarios activos con rol "usuario" y espacios activos
    expect(within(dialog).getAllByRole('option').map((o) => o.textContent)).toEqual(['Doc Uno', 'Lab', 'Aula'])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Asignar espacio' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Responsable asignado al espacio.')
    expect(svc.assignResponsibility).toHaveBeenCalledWith(users[0], spaces[0])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('3 responsables')).toBeInTheDocument()
  })

  it('cambia usuario/espacio seleccionados', async () => {
    authState.usuario = null
    svc.assignResponsibility.mockResolvedValue([])
    mount(<ResponsibilitiesPage />)
    await screen.findByText('2 responsables')
    await userEvent.click(screen.getByRole('button', { name: /Asignar responsable/ }))
    const dialog = screen.getByRole('dialog')
    const [userSel, spaceSel] = within(dialog).getAllByRole('combobox')
    await userEvent.selectOptions(userSel, '3')
    await userEvent.selectOptions(spaceSel, '2')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Asignar espacio' }))
    await waitFor(() => expect(svc.assignResponsibility).toHaveBeenCalledWith(users[0], spaces[1]))
  })

  it('no administrador: solo puede asignar sus espacios activos', async () => {
    authState.usuario = { id: 3, role: 'usuario', type: 'personal_administrator', is_superuser: false }
    mount(<ResponsibilitiesPage />)
    await screen.findByText('2 responsables')
    await userEvent.click(screen.getByRole('button', { name: /Asignar responsable/ }))
    expect(within(screen.getByRole('dialog')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Doc Uno', 'Lab'])
  })

  it('error al asignar', async () => {
    authState.usuario = { id: 99, role: 'admin' }
    svc.assignResponsibility.mockRejectedValue(httpError(400, { detail: 'No permitido' }))
    mount(<ResponsibilitiesPage />)
    await screen.findByText('2 responsables')
    await userEvent.click(screen.getByRole('button', { name: /Asignar responsable/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Asignar espacio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No permitido')
  })

  it('sin asignaciones y envío sin selección válida no llama al servicio', async () => {
    authState.usuario = { id: 99, role: 'admin' }
    svc.users.mockResolvedValue([])
    svc.spaces.mockResolvedValue([])
    svc.responsibilities.mockResolvedValue([])
    mount(<ResponsibilitiesPage />)
    expect(await screen.findByText('No hay asignaciones para mostrar.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Asignar responsable/ }))
    fireEvent.submit(screen.getByRole('dialog'))
    expect(svc.assignResponsibility).not.toHaveBeenCalled()
  })

  it('cierra el modal con Cancelar', async () => {
    authState.usuario = null
    mount(<ResponsibilitiesPage />)
    await screen.findByText('2 responsables')
    await userEvent.click(screen.getByRole('button', { name: /Asignar responsable/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
