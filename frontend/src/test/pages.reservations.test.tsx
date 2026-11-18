import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({ usuario: null as Record<string, unknown> | null }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ usuario: authState.usuario, loading: false }) }))

const svc = vi.hoisted(() => ({
  reservations: vi.fn(), spaces: vi.fn(), createReservation: vi.fn(), reviewReservation: vi.fn(), cancelReservation: vi.fn(), updateReservation: vi.fn(),
}))
vi.mock('../services/reservaTrack.service', () => ({ reservaTrackService: svc }))

import { ReservationsPage } from '../pages/reservations/ReservationsPage'
import type { Reservation, Space } from '../types/reservaTrack'

const res = (o: Partial<Reservation>): Reservation => ({
  id: 1, code: 'RT-1', userId: 7, applicantName: 'Ana', spaceId: 1, spaceName: 'Lab', date: '2026-11-20',
  startTime: '08:00', endTime: '10:00', status: 'pending', reason: 'motivo', ...o,
})
const space = (o: Partial<Space>): Space => ({
  id: 1, name: 'Lab', description: '', category: 'laboratory', capacity: 10, location: 'Bloque', isActive: true, responsibleNames: [], ...o,
})
const httpError = (status: number, data: unknown = {}) =>
  new AxiosError('x', 'E', undefined, {}, { status, data, headers: {}, statusText: '', config: {} } as never)

const SPACES = [
  space({ id: 1, name: 'Lab', category: 'laboratory' }),
  space({ id: 2, name: 'Aula', category: 'classroom' }),
  space({ id: 3, name: 'Auditorio', category: 'auditory', capacity: 50 }),
  space({ id: 4, name: 'Gimnasio', category: 'gym' }),
  space({ id: 5, name: 'Cerrado', category: 'gym', isActive: false }),
]
const ROWS = [
  res({ id: 1, code: 'RT-1', applicantName: 'Ana', spaceName: 'Lab', status: 'pending', subject: 'Mat', group: 'A', attendees: 12 }),
  res({ id: 2, code: 'RT-2', applicantName: 'Beto', spaceName: 'Aula', status: 'approved', reason: 'Clase' }),
  res({ id: 3, code: 'RT-3', applicantName: 'Cami', spaceName: 'Gimnasio', status: 'rejected' }),
  res({ id: 4, code: 'RT-4', applicantName: 'Dani', spaceName: 'Lab', status: 'pending', subject: 'Fis', group: 'B' }),
]

const mount = (props: { timonelModule?: boolean } = {}) => render(<MemoryRouter><ReservationsPage {...props} /></MemoryRouter>)
const loaded = async () => { await screen.findByText('RT-1') }

beforeEach(() => {
  authState.usuario = { id: 1, role: 'admin', type: 'personal_administrator', is_superuser: false }
  Object.values(svc).forEach((f) => f.mockReset())
  svc.reservations.mockResolvedValue(ROWS)
  svc.spaces.mockResolvedValue(SPACES)
})
afterEach(() => { vi.useRealTimers() })

describe('ReservationsPage · listado', () => {
  it('muestra reservas con detalle académico y motivo', async () => {
    authState.usuario = { id: 5, role: 'usuario', type: 'student', is_superuser: false }
    mount()
    await loaded()
    expect(screen.getByText('Mat · A · 12 asistentes')).toBeInTheDocument()
    expect(screen.getByText('Fis · B')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Motivo' })).toBeInTheDocument()
    expect(screen.getByText('Clase')).toBeInTheDocument()
    expect(screen.queryByLabelText('Aprobar reserva')).not.toBeInTheDocument()
  })

  it('filtra por estado y por texto, y muestra el vacío', async () => {
    mount()
    await loaded()
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'approved')
    expect(screen.queryByText('RT-1')).not.toBeInTheDocument()
    expect(screen.getByText('RT-2')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'all')
    await userEvent.type(screen.getByPlaceholderText('Buscar por código o solicitante…'), 'cami')
    expect(screen.getAllByRole('row')).toHaveLength(2)
    await userEvent.type(screen.getByPlaceholderText('Buscar por código o solicitante…'), 'zzz')
    expect(screen.getByText('No hay solicitudes que coincidan con los filtros.')).toBeInTheDocument()
  })
})

describe('ReservationsPage · revisión', () => {
  it('aprueba y rechaza reservas pendientes (solo las pendientes tienen botones)', async () => {
    svc.reviewReservation.mockResolvedValue([res({ id: 1, status: 'approved' })])
    mount()
    await loaded()
    expect(screen.getAllByLabelText('Aprobar reserva')).toHaveLength(2)
    await userEvent.click(screen.getAllByLabelText('Aprobar reserva')[0])
    expect(svc.reviewReservation).toHaveBeenCalledWith(1, 'approved')
    await waitFor(() => expect(screen.queryByText('RT-4')).not.toBeInTheDocument())
  })

  it('rechazar', async () => {
    svc.reviewReservation.mockResolvedValue(ROWS)
    mount()
    await loaded()
    await userEvent.click(screen.getAllByLabelText('Rechazar reserva')[1])
    expect(svc.reviewReservation).toHaveBeenCalledWith(4, 'rejected')
  })

  it('muestra el error si falla la revisión', async () => {
    svc.reviewReservation.mockRejectedValue(httpError(409, { detail: 'Conflicto de horario' }))
    mount()
    await loaded()
    await userEvent.click(screen.getAllByLabelText('Aprobar reserva')[0])
    expect(await screen.findByRole('alert')).toHaveTextContent('Conflicto de horario')
  })

  it('fallback del error de revisión', async () => {
    svc.reviewReservation.mockRejectedValue('raro')
    mount()
    await loaded()
    await userEvent.click(screen.getAllByLabelText('Aprobar reserva')[0])
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo actualizar la reserva.')
  })
})

describe('ReservationsPage · crear', () => {
  const open = async () => {
    mount()
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: /Solicitar espacio/ }))
    return screen.getByRole('dialog')
  }

  it('sin permiso no hay botón', async () => {
    authState.usuario = { role: 'usuario', type: 'other', is_superuser: false }
    mount()
    await loaded()
    expect(screen.queryByRole('button', { name: /Solicitar espacio/ })).not.toBeInTheDocument()
  })

  it('sin espacios activos no hay botón', async () => {
    svc.spaces.mockResolvedValue([space({ id: 9, isActive: false })])
    mount()
    await loaded()
    expect(screen.queryByRole('button', { name: /Solicitar espacio/ })).not.toBeInTheDocument()
  })

  it('espacio de laboratorio pide asignatura y grupo', async () => {
    svc.createReservation.mockResolvedValue([res({ id: 99, code: 'NUEVA' })])
    const dialog = await open()
    expect(within(dialog).getByLabelText('Asignatura')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Motivo')).not.toBeInTheDocument()
    expect(within(dialog).getByText(/registrará la asignatura/)).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText('Asignatura'), 'Química')
    await userEvent.type(within(dialog).getByLabelText('Grupo'), 'G1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))
    await waitFor(() => expect(svc.createReservation).toHaveBeenCalled())
    const [input, sp] = svc.createReservation.mock.calls[0]
    expect(input).toMatchObject({ space: 1, subject: 'Química', group: 'G1', start_time: '08:00', end_time: '10:00' })
    expect(sp.id).toBe(1)
    expect(await screen.findByText('NUEVA')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Solicitud creada y agregada a la lista.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('el aviso desaparece solo', async () => {
    svc.createReservation.mockResolvedValue([res({ id: 99, code: 'NUEVA' })])
    const dialog = await open()
    await userEvent.type(within(dialog).getByLabelText('Asignatura'), 'Q')
    await userEvent.type(within(dialog).getByLabelText('Grupo'), 'G')
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))
    await screen.findByRole('status')
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('aula pide motivo; gimnasio también', async () => {
    svc.createReservation.mockResolvedValue(ROWS)
    const dialog = await open()
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Espacio/), '2')
    expect(within(dialog).queryByLabelText('Asignatura')).not.toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Clase magistral')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))
    await waitFor(() => expect(svc.createReservation).toHaveBeenCalled())
    expect(svc.createReservation.mock.calls[0][0]).toMatchObject({ space: 2, reason: 'Clase magistral', subject: '', group: '', attendees: null })
  })

  it('auditorio pide asistentes', async () => {
    svc.createReservation.mockResolvedValue(ROWS)
    const dialog = await open()
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Espacio/), '3')
    const att = within(dialog).getByLabelText('Cantidad de asistentes')
    expect(att).toHaveAttribute('max', '50')
    await userEvent.type(within(dialog).getByLabelText('Asignatura'), 'Conf')
    await userEvent.type(within(dialog).getByLabelText('Grupo'), 'X')
    await userEvent.type(att, '30')
    // vaciar el campo vuelve a null
    await userEvent.clear(att)
    expect(att).toHaveValue(null)
    await userEvent.type(att, '30')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))
    await waitFor(() => expect(svc.createReservation.mock.calls[0][0]).toMatchObject({ space: 3, attendees: 30 }))
  })

  it('cambia fecha y horas', async () => {
    svc.createReservation.mockResolvedValue(ROWS)
    const dialog = await open()
    await userEvent.type(within(dialog).getByLabelText('Asignatura'), 'Q')
    await userEvent.type(within(dialog).getByLabelText('Grupo'), 'G')
    fireEvent.change(within(dialog).getByLabelText('Fecha'), { target: { value: '2999-12-31' } })
    fireEvent.change(within(dialog).getByLabelText('Hora de inicio'), { target: { value: '09:00' } })
    fireEvent.change(within(dialog).getByLabelText('Hora de finalización'), { target: { value: '11:30' } })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))
    await waitFor(() => expect(svc.createReservation.mock.calls[0][0]).toMatchObject({ date: '2999-12-31', start_time: '09:00', end_time: '11:30' }))
  })

  it('no envía si la hora final no es posterior a la inicial', async () => {
    const dialog = await open()
    await userEvent.type(within(dialog).getByLabelText('Asignatura'), 'Q')
    await userEvent.type(within(dialog).getByLabelText('Grupo'), 'G')
    fireEvent.change(within(dialog).getByLabelText('Hora de finalización'), { target: { value: '08:00' } })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))
    expect(svc.createReservation).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('no envía si el espacio seleccionado no existe', async () => {
    const dialog = await open()
    fireEvent.change(within(dialog).getByLabelText(/^Espacio/), { target: { value: '' } })
    fireEvent.submit(dialog)
    expect(svc.createReservation).not.toHaveBeenCalled()
  })

  it('muestra el error del backend y mantiene el modal abierto', async () => {
    svc.createReservation.mockRejectedValue(httpError(400, { non_field_errors: ['Horario ocupado'], detail: 'Horario ocupado' }))
    const dialog = await open()
    await userEvent.type(within(dialog).getByLabelText('Asignatura'), 'Q')
    await userEvent.type(within(dialog).getByLabelText('Grupo'), 'G')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Horario ocupado')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('fallback del error de creación', async () => {
    svc.createReservation.mockRejectedValue('raro')
    const dialog = await open()
    await userEvent.type(within(dialog).getByLabelText('Asignatura'), 'Q')
    await userEvent.type(within(dialog).getByLabelText('Grupo'), 'G')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo crear la solicitud.')
  })

  it('cierra el modal con Cancelar', async () => {
    const dialog = await open()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('ReservationsPage · módulo Timonel', () => {
  it('limita los espacios a aulas, laboratorios y auditorios, y no permite revisar', async () => {
    mount({ timonelModule: true })
    expect(await screen.findByRole('heading', { name: 'Reserva de aulas y espacios académicos' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument() // FR-041: solo el formulario
    expect(screen.queryByLabelText('Aprobar reserva')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Solicitar espacio/ }))
    const options = within(screen.getByRole('dialog')).getAllByRole('option').map((o) => o.textContent)
    expect(options.filter((o) => o?.includes('·')).map((o) => o!.split(' · ')[1])).toEqual(['Lab', 'Aula', 'Auditorio'])
  })

  it('sin espacios académicos no hay botón de solicitar', async () => {
    svc.spaces.mockResolvedValue([space({ id: 4, category: 'gym' })])
    mount({ timonelModule: true })
    await screen.findByRole('heading', { name: 'Reserva de aulas y espacios académicos' })
    await waitFor(() => expect(svc.spaces).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Solicitar espacio/ })).not.toBeInTheDocument()
  })
})

describe('ReservationsPage · cancelar', () => {
  it('el administrador cancela pendientes y aprobadas, no las rechazadas', async () => {
    svc.cancelReservation.mockResolvedValue(ROWS)
    mount()
    await loaded()
    expect(screen.getAllByLabelText('Cancelar reserva')).toHaveLength(3)
    await userEvent.click(screen.getAllByLabelText('Cancelar reserva')[1])
    expect(svc.cancelReservation).toHaveBeenCalledWith(2)
    expect(await screen.findByText('Reserva cancelada.')).toBeInTheDocument()
  })

  it('un usuario común solo cancela las suyas', async () => {
    authState.usuario = { id: 7, role: 'user', type: 'student', is_superuser: false }
    svc.reservations.mockResolvedValue([res({ id: 1, code: 'RT-1', userId: 7 }), res({ id: 2, code: 'RT-2', userId: 9 })])
    mount()
    await loaded()
    expect(screen.getAllByLabelText('Cancelar reserva')).toHaveLength(1)
  })

  it('muestra el error si falla la cancelación', async () => {
    svc.cancelReservation.mockRejectedValue(httpError(409, { detail: 'No se puede cancelar una reserva que ya inició.' }))
    mount()
    await loaded()
    await userEvent.click(screen.getAllByLabelText('Cancelar reserva')[0])
    expect(await screen.findByRole('alert')).toHaveTextContent('ya inició')
  })
})

describe('ReservationsPage · editar', () => {
  it('el solicitante edita su solicitud pendiente', async () => {
    authState.usuario = { id: 7, role: 'usuario', type: 'student', is_superuser: false }
    svc.reservations.mockResolvedValue([res({ id: 1, code: 'RT-1', userId: 7, spaceId: 2, reason: 'Clase' }), res({ id: 2, code: 'RT-2', userId: 9 })])
    svc.updateReservation.mockResolvedValue([res({ id: 1, code: 'RT-1', userId: 7, reason: 'Nuevo' })])
    mount()
    await loaded()
    expect(screen.getAllByLabelText('Editar reserva')).toHaveLength(1)
    await userEvent.click(screen.getByLabelText('Editar reserva'))
    const dialog = within(screen.getByRole('dialog', { name: 'Editar solicitud' }))
    const reason = dialog.getByLabelText('Motivo')
    await userEvent.clear(reason)
    await userEvent.type(reason, 'Nuevo')
    await userEvent.click(dialog.getByRole('button', { name: 'Guardar cambios' }))
    expect(svc.updateReservation).toHaveBeenCalledWith(1, expect.objectContaining({ reason: 'Nuevo' }))
    expect(await screen.findByText('Solicitud actualizada.')).toBeInTheDocument()
  })

  it('el administrador puede editar también las aprobadas y muestra el error si falla', async () => {
    svc.updateReservation.mockRejectedValue(httpError(400, { detail: 'Horario ocupado' }))
    mount()
    await loaded()
    expect(screen.getAllByLabelText('Editar reserva')).toHaveLength(3)
    await userEvent.click(screen.getAllByLabelText('Editar reserva')[0])
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('al cerrar y abrir una nueva solicitud vuelve al modo crear', async () => {
    mount()
    await loaded()
    await userEvent.click(screen.getAllByLabelText('Editar reserva')[0])
    await userEvent.click(screen.getByLabelText('Cerrar'))
    await userEvent.click(screen.getByRole('button', { name: /Solicitar espacio/ }))
    expect(screen.getByRole('dialog', { name: 'Solicitar nueva reserva' })).toBeInTheDocument()
  })
})
