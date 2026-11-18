import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { request } }))

import { reservaTrackService as svc } from '../services/reservaTrack.service'
import type { AppUser, Space } from '../types/reservaTrack'

const httpError = (status?: number) =>
  new AxiosError('x', 'E', undefined, {}, status === undefined ? undefined : ({ status, data: {}, headers: {}, statusText: '', config: {} } as never))
const ok = (data: unknown) => Promise.resolve({ data })
const store = (k: string) => JSON.parse(localStorage.getItem(`reservatrack.demo.${k}`) ?? 'null')

beforeEach(() => {
  request.mockReset()
})

const spaceRow = { id: 9, name: 'Lab', description: null, category: 'laboratory', capacity: '12', location: null, is_active: 1, responsible_names: ['Ana'] }
const reservationRow = {
  id: 5, code: 'RT-5', user: '2', applicant_name: 'Ana', applicant_type: 'student', applicant_course: 'C', applicant_area: 'A',
  space: '9', space_name: 'Lab', date: '2026-11-20', start_time: '08:00:00', end_time: '10:00:00', status: 'pending',
  reason: 'r', subject: 'S', group: 'G', attendees: '4',
}
const userRow = { id: 3, username: 'u', first_name: 'N', last_name: 'L', email: 'e@x.co', course: null, area: null, type: 'student', role: 'usuario', is_active: true }

describe('spaces()', () => {
  it('mapea la respuesta paginada y la cachea', async () => {
    request.mockReturnValue(ok({ results: [spaceRow] }))
    const rows = await svc.spaces()
    expect(rows).toEqual([{ id: 9, name: 'Lab', description: '', category: 'laboratory', capacity: 12, location: '', isActive: true, responsibleNames: ['Ana'] }])
    expect(store('spaces')).toEqual(rows)
    expect(request).toHaveBeenCalledWith({ url: '/spaces/?page_size=200', method: 'GET', data: undefined })
  })
  it('acepta lista simple y responsible_names ausente', async () => {
    request.mockReturnValue(ok([{ ...spaceRow, responsible_names: undefined }]))
    expect((await svc.spaces())[0].responsibleNames).toEqual([])
  })
  it('lista vacía usa demo (e inserta aula si falta)', async () => {
    request.mockReturnValue(ok([]))
    const rows = await svc.spaces()
    expect(rows.length).toBe(7)
    expect(rows.some((s) => s.category === 'classroom')).toBe(true)
  })
  it('sin aula en el caché agrega la de demostración', async () => {
    localStorage.setItem('reservatrack.demo.spaces', JSON.stringify([{ id: 1, name: 'X', category: 'gym', capacity: 1, location: '', description: '', isActive: true, responsibleNames: [] }]))
    request.mockRejectedValue(httpError(503))
    const rows = await svc.spaces()
    expect(rows[0].category).toBe('classroom')
    expect(rows[0].id).toBe(2)
    expect(rows).toHaveLength(2)
  })
  it('caché corrupto se descarta y se regenera', async () => {
    localStorage.setItem('reservatrack.demo.spaces', '{bad')
    request.mockRejectedValue(httpError(404))
    expect((await svc.spaces()).length).toBe(7)
  })
  it('caché vacío (array vacío) se regenera', async () => {
    localStorage.setItem('reservatrack.demo.spaces', '[]')
    request.mockRejectedValue(httpError())
    expect((await svc.spaces()).length).toBe(7)
  })
  it('errores no recuperables (400) se propagan', async () => {
    request.mockRejectedValue(httpError(400))
    await expect(svc.spaces()).rejects.toBeInstanceOf(AxiosError)
    request.mockRejectedValue(new Error('no axios'))
    await expect(svc.spaces()).rejects.toThrow('no axios')
  })
})

describe('saveSpace()', () => {
  const input = { name: 'N', description: 'd', category: 'gym' as const, capacity: 5, location: 'L', is_active: false }
  it('crea por POST y antepone al listado', async () => {
    request
      .mockReturnValueOnce(ok(spaceRow)) // POST
      .mockReturnValueOnce(ok([])) // this.spaces()
    const rows = await svc.saveSpace(input)
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/spaces/', method: 'POST', data: JSON.stringify(input) })
    expect(rows[0].id).toBe(9)
  })
  it('edita por PATCH', async () => {
    request.mockReturnValueOnce(ok(spaceRow)).mockReturnValueOnce(ok([spaceRow]))
    const rows = await svc.saveSpace(input, 9)
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/spaces/9/', method: 'PATCH' })
    expect(rows.filter((r) => r.id === 9)).toHaveLength(1)
  })
  it('sin backend crea localmente', async () => {
    request.mockRejectedValue(httpError(500))
    const rows = await svc.saveSpace(input)
    expect(rows[0]).toMatchObject({ name: 'N', isActive: false, responsibleNames: [] })
    expect(rows[0].id).toBe(8)
  })
  it('sin backend edita localmente reemplazando el id', async () => {
    request.mockRejectedValue(httpError(401))
    const rows = await svc.saveSpace(input, 1)
    expect(rows[0].id).toBe(1)
    expect(rows.filter((r) => r.id === 1)).toHaveLength(1)
  })
  it('propaga errores de validación', async () => {
    request.mockRejectedValue(httpError(400))
    await expect(svc.saveSpace(input)).rejects.toBeInstanceOf(AxiosError)
  })
})

describe('registerBranch()', () => {
  it('usa la respuesta del backend', async () => {
    request.mockReturnValue(ok({ id: 7, name: 'Norte' }))
    const rows = await svc.registerBranch('Norte')
    expect(rows[0]).toEqual({ id: 7, name: 'Norte' })
  })
  it('reemplaza una sede con el mismo id', async () => {
    request.mockReturnValue(ok({ id: 1, name: 'Renombrada' }))
    const rows = await svc.registerBranch('Renombrada')
    expect(rows).toEqual([{ id: 1, name: 'Renombrada' }])
  })
  it('fallback local con trim', async () => {
    request.mockRejectedValue(httpError(403))
    const rows = await svc.registerBranch('  Sur ')
    expect(rows[0]).toEqual({ id: 2, name: 'Sur' })
  })
  it('propaga errores reales', async () => {
    request.mockRejectedValue(httpError(400))
    await expect(svc.registerBranch('x')).rejects.toBeInstanceOf(AxiosError)
  })
})

describe('reservations()', () => {
  it('mapea campos y recorta horas', async () => {
    request.mockReturnValue(ok({ results: [reservationRow] }))
    const [r] = await svc.reservations()
    expect(r).toMatchObject({ id: 5, userId: 2, spaceId: 9, startTime: '08:00', endTime: '10:00', attendees: 4, subject: 'S', group: 'G' })
  })
  it('campos opcionales ausentes', async () => {
    request.mockReturnValue(ok([{ ...reservationRow, applicant_name: undefined, applicant_course: undefined, applicant_area: undefined, space_name: undefined, subject: undefined, group: undefined, attendees: null }]))
    const [r] = await svc.reservations()
    expect(r).toMatchObject({ applicantName: '', applicantCourse: '', applicantArea: '', spaceName: '', subject: '', group: '', attendees: null })
  })
  it('vacío o error usan datos demo', async () => {
    request.mockReturnValue(ok([]))
    expect((await svc.reservations()).length).toBe(8)
    localStorage.clear()
    request.mockRejectedValue(httpError(502))
    expect((await svc.reservations()).length).toBe(8)
  })
  it('propaga errores no recuperables', async () => {
    request.mockRejectedValue(httpError(422))
    await expect(svc.reservations()).rejects.toBeInstanceOf(AxiosError)
  })
})

describe('createReservation()', () => {
  const space = { id: 3, name: 'Gimnasio' } as Space
  const input = { space: 3, date: '2026-12-01', start_time: '08:00', end_time: '09:00', reason: '', subject: 'Mat', group: 'A', attendees: 2 }
  it('crea en backend y refresca el listado', async () => {
    request.mockReturnValueOnce(ok(reservationRow)).mockReturnValueOnce(ok([reservationRow]))
    const rows = await svc.createReservation(input, space)
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/reservations/', method: 'POST' })
    expect(rows).toHaveLength(2)
  })
  it('fallback local: motivo compuesto cuando reason está vacío', async () => {
    request.mockRejectedValue(httpError(500))
    const rows = await svc.createReservation(input, space)
    expect(rows[0]).toMatchObject({ id: 42, code: 'RT-2026-042', status: 'pending', reason: 'Mat · A', spaceName: 'Gimnasio' })
  })
  it('fallback local: usa el motivo dado y tolera subject/group indefinidos', async () => {
    request.mockRejectedValue(httpError(500))
    const a = await svc.createReservation({ ...input, reason: 'Evento' }, space)
    expect(a[0].reason).toBe('Evento')
    localStorage.clear()
    const b = await svc.createReservation({ ...input, subject: undefined, group: undefined }, space)
    expect(b[0].reason).toBe(' · ')
  })
  it('propaga errores de validación', async () => {
    request.mockRejectedValue(httpError(400))
    await expect(svc.createReservation(input, space)).rejects.toBeInstanceOf(AxiosError)
  })
})

describe('reviewReservation()', () => {
  it('aprueba usando el endpoint approve', async () => {
    request.mockReturnValueOnce(ok({ ...reservationRow, id: 41, status: 'approved' })).mockReturnValueOnce(ok([{ ...reservationRow, id: 41 }, { ...reservationRow, id: 40 }]))
    const rows = await svc.reviewReservation(41, 'approved')
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/reservations/41/approve/', method: 'POST' })
    expect(rows.find((r) => r.id === 41)?.status).toBe('approved')
    expect(rows.find((r) => r.id === 40)?.status).toBe('pending')
  })
  it('rechaza usando reject', async () => {
    request.mockReturnValueOnce(ok({ ...reservationRow, id: 41, status: 'rejected' })).mockReturnValueOnce(ok([]))
    await svc.reviewReservation(41, 'rejected')
    expect(request.mock.calls[0][0].url).toBe('/reservations/41/reject/')
  })
  it('fallback local cambia solo el estado de la reserva indicada', async () => {
    request.mockRejectedValue(httpError(404))
    const rows = await svc.reviewReservation(41, 'rejected')
    expect(rows.find((r) => r.id === 41)?.status).toBe('rejected')
    expect(rows.find((r) => r.id === 40)?.status).toBe('approved')
  })
  it('propaga errores reales', async () => {
    request.mockRejectedValue(httpError(400))
    await expect(svc.reviewReservation(1, 'approved')).rejects.toBeInstanceOf(AxiosError)
  })
})

describe('users()', () => {
  it('mapea usuarios', async () => {
    request.mockReturnValue(ok([userRow]))
    const [u] = await svc.users()
    expect(u).toEqual({ id: 3, username: 'u', firstName: 'N', lastName: 'L', email: 'e@x.co', course: '', area: '', type: 'student', role: 'usuario', isActive: true })
  })
  it('vacío/error → demo; error real se propaga', async () => {
    request.mockReturnValue(ok([]))
    expect((await svc.users()).length).toBe(4)
    localStorage.clear()
    request.mockRejectedValue(httpError(503))
    expect((await svc.users()).length).toBe(4)
    request.mockRejectedValue(httpError(400))
    await expect(svc.users()).rejects.toBeInstanceOf(AxiosError)
  })
})

describe('responsibilities()', () => {
  const row = { id: 1, user: 3, user_name: 'N L', space: 9, space_name: 'Lab', is_active: true, assignment_date: '2026-11-01T10:00:00Z' }
  it('mapea y recorta la fecha', async () => {
    request.mockReturnValue(ok([row]))
    expect(await svc.responsibilities()).toEqual([{ id: 1, userId: 3, userName: 'N L', spaceId: 9, spaceName: 'Lab', isActive: true, assignmentDate: '2026-11-01' }])
  })
  it('vacío/error → demo; error real se propaga', async () => {
    request.mockReturnValue(ok([]))
    expect((await svc.responsibilities()).length).toBe(3)
    localStorage.clear()
    request.mockRejectedValue(httpError(500))
    expect((await svc.responsibilities()).length).toBe(3)
    request.mockRejectedValue(httpError(400))
    await expect(svc.responsibilities()).rejects.toBeInstanceOf(AxiosError)
  })
})

describe('assignResponsibility()', () => {
  const user = { id: 3, firstName: 'Ana', lastName: 'P' } as AppUser
  const space = { id: 3, name: 'Gimnasio' } as Space
  it('POST y recarga las asignaciones', async () => {
    request.mockReturnValueOnce(ok({})).mockReturnValueOnce(ok([]))
    const rows = await svc.assignResponsibility(user, space)
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/responsibilities/', method: 'POST', data: JSON.stringify({ user: 3, space: 3, is_active: true }) })
    expect(rows).toHaveLength(3)
  })
  it('fallback local agrega la asignación y el responsable al espacio', async () => {
    request.mockRejectedValue(httpError(500))
    const rows = await svc.assignResponsibility(user, space)
    expect(rows[0]).toMatchObject({ id: 4, userName: 'Ana P', spaceName: 'Gimnasio', isActive: true })
    expect(rows[0].assignmentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(store('spaces').find((s: Space) => s.id === 3).responsibleNames).toContain('Ana P')
    expect(store('spaces').find((s: Space) => s.id === 2).responsibleNames).not.toContain('Ana P')
  })
  it('propaga errores reales', async () => {
    request.mockRejectedValue(httpError(400))
    await expect(svc.assignResponsibility(user, space)).rejects.toBeInstanceOf(AxiosError)
  })
})

describe('register()', () => {
  const input = { username: 'nuevo', first_name: 'N', last_name: 'U', email: 'n@x.co', type: 'student' as const, course: 'C', password: 'secret123' }
  it('registra en backend', async () => {
    request.mockReturnValue(ok(userRow))
    expect((await svc.register(input)).id).toBe(3)
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/auth/register/', method: 'POST' })
  })
  it('fallback local con rol usuario', async () => {
    request.mockRejectedValue(httpError(503))
    const user = await svc.register(input)
    expect(user).toMatchObject({ id: 8, username: 'nuevo', role: 'usuario', isActive: true, course: 'C' })
    expect(store('users')[0].username).toBe('nuevo')
  })
  it('propaga errores de validación', async () => {
    request.mockRejectedValue(httpError(400))
    await expect(svc.register(input)).rejects.toBeInstanceOf(AxiosError)
  })
})

describe('paginación y modo demo (FR-029, FR-034, FR-049)', () => {
  it('sigue los enlaces `next` y reúne todas las páginas', async () => {
    request
      .mockReturnValueOnce(ok({ results: [{ ...spaceRow, id: 1 }], next: 'http://api.test/api/v1/spaces/?page=2&page_size=200' }))
      .mockReturnValueOnce(ok({ results: [{ ...spaceRow, id: 2 }], next: null }))
    const rows = await svc.spaces()
    expect(rows.map((r) => r.id)).toEqual([1, 2])
    expect(request).toHaveBeenNthCalledWith(2, { url: '/spaces/?page=2&page_size=200', method: 'GET', data: undefined })
  })

  it('con el modo demo desactivado (producción) un error se propaga y una lista vacía sigue vacía', async () => {
    vi.resetModules()
    vi.doMock('../lib/featureFlags', () => ({ PUBLIC_REGISTRATION_ENABLED: true, DEMO_FALLBACK_ENABLED: false }))
    vi.doMock('../lib/api', () => ({ api: { request } }))
    const { reservaTrackService: prod } = await import('../services/reservaTrack.service')
    request.mockReturnValueOnce(ok({ results: [], next: null }))
    expect(await prod.reservations()).toEqual([])
    request.mockRejectedValueOnce(httpError(503))
    await expect(prod.reservations()).rejects.toBeDefined()
    vi.doUnmock('../lib/featureFlags')
  })
})

describe('cancelReservation()', () => {
  it('usa cancel y reemplaza la fila', async () => {
    request.mockReturnValueOnce(ok({ ...reservationRow, id: 41, status: 'canceled' })).mockReturnValueOnce(ok([{ ...reservationRow, id: 41 }, { ...reservationRow, id: 40 }]))
    const rows = await svc.cancelReservation(41)
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/reservations/41/cancel/', method: 'POST' })
    expect(rows.find((r) => r.id === 41)?.status).toBe('canceled')
    expect(rows.find((r) => r.id === 40)?.status).toBe('pending')
  })
  it('propaga errores', async () => {
    request.mockRejectedValue(httpError(409))
    await expect(svc.cancelReservation(1)).rejects.toBeInstanceOf(AxiosError)
  })
})

describe('edición de reservas y gestión de usuarios', () => {
  it('updateReservation hace PATCH y recarga la lista', async () => {
    request.mockReturnValueOnce(ok(reservationRow)).mockReturnValueOnce(ok([reservationRow]))
    const rows = await svc.updateReservation(5, { reason: 'Nuevo' })
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/reservations/5/', method: 'PATCH' })
    expect(rows).toHaveLength(1)
  })
  it('createUser hace POST y recarga', async () => {
    request.mockReturnValueOnce(ok(userRow)).mockReturnValueOnce(ok([userRow]))
    const rows = await svc.createUser({ username: 'u', email: 'e@x.co', first_name: 'N', last_name: 'L', type: 'student', role: 'usuario', password: 'x' })
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/users/', method: 'POST' })
    expect(rows[0].username).toBe('u')
  })
  it('setUserRole y setUserActive hacen PATCH y devuelven el usuario', async () => {
    request.mockReturnValueOnce(ok({ ...userRow, role: 'admin' })).mockReturnValueOnce(ok({ ...userRow, is_active: false }))
    expect((await svc.setUserRole(3, 'admin')).role).toBe('admin')
    expect((await svc.setUserActive(3, false)).isActive).toBe(false)
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/users/3/', method: 'PATCH' })
  })
  it('deleteUser hace DELETE y recarga', async () => {
    request.mockReturnValueOnce(ok(null)).mockReturnValueOnce(ok([]))
    await svc.deleteUser(3)
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/users/3/', method: 'DELETE' })
  })
  it('setUserPassword hace POST a set_password', async () => {
    request.mockReturnValueOnce(ok(null))
    await svc.setUserPassword(3, 'Nueva-Clave-123')
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/users/3/set_password/', method: 'POST' })
  })
})
