import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({ usuario: null as Record<string, unknown> | null }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ usuario: authState.usuario, loading: false }) }))

const svc = vi.hoisted(() => ({ spaces: vi.fn(), responsibilities: vi.fn(), saveSpace: vi.fn(), registerBranch: vi.fn() }))
vi.mock('../services/reservaTrack.service', () => ({ reservaTrackService: svc }))

import { SpacesPage } from '../pages/spaces/SpacesPage'
import type { Space } from '../types/reservaTrack'

const space = (o: Partial<Space>): Space => ({
  id: 1, name: 'Lab', description: 'Prácticas', category: 'laboratory', capacity: 10, location: 'Piso 1', isActive: true, responsibleNames: [], ...o,
})
const httpError = (status: number, data: unknown = {}) =>
  new AxiosError('x', 'E', undefined, {}, { status, data, headers: {}, statusText: '', config: {} } as never)

const SPACES = [
  space({ id: 1, name: 'Laboratorio', responsibleNames: ['Ana', 'Beto'] }),
  space({ id: 2, name: 'Aula', category: 'classroom', description: '', isActive: false }),
  space({ id: 3, name: 'Auditorio', category: 'auditory' }),
  space({ id: 4, name: 'Gym', category: 'gym' }),
  space({ id: 5, name: 'Sala', category: 'study_room' }),
  space({ id: 6, name: 'Otro lugar', category: 'other' }),
  space({ id: 7, name: 'Raro', category: 'desconocida' as never }),
]

const mount = () => render(<SpacesPage />)
const loaded = async () => { await screen.findByText('Laboratorio') }

beforeEach(() => {
  authState.usuario = null // admin implícito
  Object.values(svc).forEach((f) => f.mockReset())
  svc.spaces.mockResolvedValue(SPACES)
  svc.responsibilities.mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

describe('SpacesPage · listado', () => {
  it('muestra tarjetas con categoría, capacidad y responsables', async () => {
    mount()
    await loaded()
    expect(screen.getByText('Responsable: Ana, Beto')).toBeInTheDocument()
    expect(screen.getByText('Laboratorio · Cap. 10', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Activos', { selector: 'option' })).toBeInTheDocument()
    expect(screen.getAllByText('Inactivo')).toHaveLength(1)
  })

  it('filtra por texto y por estado; vacío', async () => {
    mount()
    await loaded()
    await userEvent.selectOptions(screen.getByDisplayValue('Todos los estados'), 'inactive')
    expect(screen.queryByText('Laboratorio')).not.toBeInTheDocument()
    expect(screen.getByText('Aula')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByDisplayValue('Inactivos'), 'active')
    expect(screen.queryByText('Aula')).not.toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText('Buscar espacio…'), 'sin-resultados')
    expect(screen.getByText('No se encontraron espacios.')).toBeInTheDocument()
  })
})

describe('SpacesPage · permisos', () => {
  it('usuario sin privilegios no ve crear/editar/sede', async () => {
    authState.usuario = { id: 5, role: 'usuario', type: 'student', is_superuser: false }
    mount()
    await loaded()
    expect(screen.queryByRole('button', { name: /Registrar espacio/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Registrar sede/ })).not.toBeInTheDocument()
  })

  it('personal administrativo edita solo sus espacios activos asignados', async () => {
    authState.usuario = { id: 5, role: 'usuario', type: 'personal_administrator', is_superuser: false }
    svc.responsibilities.mockResolvedValue([
      { id: 1, userId: 5, spaceId: 1, isActive: true },
      { id: 2, userId: 5, spaceId: 3, isActive: false },
      { id: 3, userId: 9, spaceId: 4, isActive: true },
    ])
    mount()
    await loaded()
    expect(screen.getAllByRole('button', { name: /Editar/ })).toHaveLength(1)
  })
})

describe('SpacesPage · detalle', () => {
  it('abre y cierra por botón, X y fondo; muestra textos por defecto', async () => {
    mount()
    await loaded()
    const detailButtons = screen.getAllByRole('button', { name: /Ver detalles/ })
    await userEvent.click(detailButtons[0])
    let dialog = screen.getByRole('dialog', { name: 'Detalle del espacio' })
    expect(within(dialog).getByText('Ana, Beto')).toBeInTheDocument()
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Cerrar' })[1])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(detailButtons[1])
    dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Sin descripción')).toBeInTheDocument()
    expect(within(dialog).getByText('Sin responsable asignado')).toBeInTheDocument()
    // clic dentro no cierra
    await userEvent.pointer({ keys: '[MouseLeft>]', target: dialog })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // clic en el fondo cierra
    await userEvent.pointer({ keys: '[MouseLeft>]', target: dialog.parentElement! })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(detailButtons[2])
    const closeButtons = within(screen.getByRole('dialog')).getAllByRole('button')
    await userEvent.click(closeButtons[0]) // la X
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('SpacesPage · crear y editar', () => {
  it('crea un espacio', async () => {
    svc.saveSpace.mockResolvedValue([...SPACES, space({ id: 8, name: 'Nuevo' })])
    mount()
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: /Registrar espacio/ }))
    const dialog = screen.getByRole('dialog', { name: 'Registrar espacio' })
    await userEvent.type(within(dialog).getByLabelText('Nombre del espacio'), 'Nuevo')
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Categoría/), 'gym')
    fireEvent.change(within(dialog).getByLabelText('Capacidad'), { target: { value: '33' } })
    await userEvent.type(within(dialog).getByLabelText('Ubicación'), 'Sótano')
    await userEvent.type(within(dialog).getByLabelText('Descripción'), 'Desc')
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Estado/), 'false')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar espacio' }))
    await waitFor(() => expect(svc.saveSpace).toHaveBeenCalledWith(
      { name: 'Nuevo', description: 'Desc', category: 'gym', capacity: 33, location: 'Sótano', is_active: false }, undefined,
    ))
    expect(await screen.findByText('Nuevo')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Espacio registrado.')
  })

  it('edita un espacio existente y el aviso desaparece', async () => {
    svc.saveSpace.mockResolvedValue(SPACES)
    mount()
    await loaded()
    await userEvent.click(screen.getAllByRole('button', { name: /Editar/ })[0])
    const dialog = screen.getByRole('dialog', { name: 'Editar espacio' })
    expect(within(dialog).getByLabelText('Nombre del espacio')).toHaveValue('Laboratorio')
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(svc.saveSpace).toHaveBeenCalledWith(expect.objectContaining({ name: 'Laboratorio', is_active: true }), 1))
    expect(await screen.findByRole('status')).toHaveTextContent('Espacio actualizado.')
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('muestra el error al guardar', async () => {
    svc.saveSpace.mockRejectedValue(httpError(400, { name: ['Nombre duplicado'] }))
    mount()
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: /Registrar espacio/ }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Nombre del espacio'), 'X')
    await userEvent.type(within(dialog).getByLabelText('Ubicación'), 'Y')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar espacio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nombre duplicado')
  })

  it('fallback del error al guardar', async () => {
    svc.saveSpace.mockRejectedValue('raro')
    mount()
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: /Registrar espacio/ }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Nombre del espacio'), 'X')
    await userEvent.type(within(dialog).getByLabelText('Ubicación'), 'Y')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar espacio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el espacio.')
  })

  it('cancelar cierra el modal', async () => {
    mount()
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: /Registrar espacio/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('SpacesPage · sedes', () => {
  const openBranch = async () => {
    mount()
    await loaded()
    await userEvent.click(screen.getAllByRole('button', { name: /Registrar sede/ })[0])
    return screen.getByRole('dialog', { name: 'Registrar sede' })
  }

  it('registra una sede', async () => {
    svc.registerBranch.mockResolvedValue([{ id: 2, name: 'Norte' }])
    const dialog = await openBranch()
    await userEvent.type(within(dialog).getByLabelText('Nombre de la sede'), 'Norte')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar sede' }))
    await waitFor(() => expect(svc.registerBranch).toHaveBeenCalledWith('Norte'))
    expect(await screen.findByRole('status')).toHaveTextContent('Sede "Norte" registrada.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('muestra el error al registrar sede, y se limpia al reabrir', async () => {
    svc.registerBranch.mockRejectedValue(httpError(400, { name: ['Ya existe'] }))
    const dialog = await openBranch()
    await userEvent.type(within(dialog).getByLabelText('Nombre de la sede'), 'Norte')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar sede' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(screen.getAllByRole('button', { name: /Registrar sede/ })[0])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nombre de la sede')).toHaveValue('')
  })

  it('fallback del error de sede', async () => {
    svc.registerBranch.mockRejectedValue('raro')
    const dialog = await openBranch()
    await userEvent.type(within(dialog).getByLabelText('Nombre de la sede'), 'Norte')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar sede' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo registrar la sede.')
  })
})
