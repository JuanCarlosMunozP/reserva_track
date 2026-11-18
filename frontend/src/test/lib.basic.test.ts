import { describe, expect, it } from 'vitest'
import { cn } from '../lib/cn'
import { PUBLIC_REGISTRATION_ENABLED } from '../lib/featureFlags'
import {
  ASSIGNABLE_ROLES, ROLE_LABEL, can, canAssignRole, canCreateReservation, canEditAssignedSpaces,
  canManageAllSpaces, canReviewReservations, canViewResponsibilitiesPage, canViewUsersPage, panelHome,
} from '../lib/permissions'

type U = Parameters<typeof canViewUsersPage>[0]
const u = (role: 'admin' | 'usuario', type: 'student' | 'teacher' | 'personal_administrator', is_superuser = false): U =>
  ({ role, type, is_superuser }) as U

describe('cn', () => {
  it('une clases y descarta valores falsy', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c')
  })
})

describe('featureFlags', () => {
  it('el registro público está habilitado', () => {
    expect(PUBLIC_REGISTRATION_ENABLED).toBe(true)
  })
})

describe('permissions.can', () => {
  it('ingeniero de software siempre puede', () => {
    expect(can(undefined, 'users', 'delete', undefined, true)).toBe(true)
  })
  it('sin rol no puede', () => {
    expect(can(undefined, 'users', 'view')).toBe(false)
  })
  it('admin según la matriz', () => {
    expect(can('admin', 'branches', 'delete')).toBe(true)
    expect(can('admin', 'users', 'delete')).toBe(false)
  })
  it('usuario solo lectura en catálogos', () => {
    expect(can('usuario', 'spaces', 'view')).toBe(true)
    expect(can('usuario', 'spaces', 'edit')).toBe(false)
    expect(can('usuario', 'users', 'view')).toBe(false)
  })
  it('suma permisos por tipo de usuario', () => {
    expect(can('usuario', 'reservations', 'create', 'student')).toBe(true)
    expect(can('usuario', 'reservations', 'review', 'teacher')).toBe(true)
    expect(can('usuario', 'spaces', 'edit', 'personal_administrator')).toBe(true)
    expect(can('usuario', 'reservations', 'review', 'student')).toBe(false)
  })
  it('rol desconocido no rompe', () => {
    expect(can('otro' as never, 'users', 'view')).toBe(false)
  })
})

describe('permissions helpers', () => {
  it('canAssignRole', () => {
    expect(canAssignRole('admin', 'usuario', true)).toBe(true)
    expect(canAssignRole('admin', 'usuario', false)).toBe(false)
    expect(canAssignRole('admin', 'otro' as never, true)).toBe(false)
    expect(ASSIGNABLE_ROLES).toEqual(['admin', 'usuario'])
  })
  it('canViewUsersPage / canManageAllSpaces', () => {
    for (const fn of [canViewUsersPage, canManageAllSpaces]) {
      expect(fn(null)).toBe(true)
      expect(fn(u('usuario', 'student', true))).toBe(true)
      expect(fn(u('admin', 'student'))).toBe(true)
      expect(fn(u('usuario', 'student'))).toBe(false)
    }
  })
  it('canViewResponsibilitiesPage', () => {
    expect(canViewResponsibilitiesPage(u('admin', 'student'))).toBe(true)
    expect(canViewResponsibilitiesPage(u('usuario', 'personal_administrator'))).toBe(true)
    expect(canViewResponsibilitiesPage(u('usuario', 'teacher'))).toBe(false)
  })
  it('canEditAssignedSpaces', () => {
    expect(canEditAssignedSpaces(null)).toBe(false)
    expect(canEditAssignedSpaces(u('usuario', 'personal_administrator'))).toBe(true)
    expect(canEditAssignedSpaces(u('usuario', 'student'))).toBe(false)
    expect(canEditAssignedSpaces(u('admin', 'personal_administrator'))).toBe(false)
  })
  it('canCreateReservation', () => {
    expect(canCreateReservation(null)).toBe(true)
    expect(canCreateReservation(u('admin', 'student'))).toBe(true)
    expect(canCreateReservation(u('usuario', 'student'))).toBe(true)
    expect(canCreateReservation(u('usuario', 'teacher'))).toBe(true)
    expect(canCreateReservation(u('usuario', 'personal_administrator'))).toBe(true)
    expect(canCreateReservation(u('usuario', 'other' as never))).toBe(false)
  })
  it('canReviewReservations', () => {
    expect(canReviewReservations(u('admin', 'student'))).toBe(true)
    expect(canReviewReservations(u('usuario', 'teacher'))).toBe(true)
    expect(canReviewReservations(u('usuario', 'student'))).toBe(false)
  })
  it('etiquetas y panelHome', () => {
    expect(ROLE_LABEL.admin).toBe('Administrador')
    expect(ROLE_LABEL.usuario).toBe('Usuario')
    expect(panelHome('admin')).toBe('/')
    expect(panelHome(undefined)).toBe('/')
  })
})
