import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const refreshUser = vi.hoisted(() => vi.fn())
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ refreshUser }) }))

const auth = vi.hoisted(() => ({
  mfaStatus: vi.fn(), mfaSetup: vi.fn(), mfaConfirm: vi.fn(), mfaRegenerateRecoveryCodes: vi.fn(), mfaDisable: vi.fn(),
}))
vi.mock('../services/auth.service', () => ({ authService: auth }))

import { SecurityPage } from '../pages/security/SecurityPage'

const httpError = (status: number, data: unknown = {}) =>
  new AxiosError('x', 'E', undefined, {}, { status, data, headers: {}, statusText: '', config: {} } as never)

beforeEach(() => {
  Object.values(auth).forEach((f) => f.mockReset())
  refreshUser.mockReset().mockResolvedValue(undefined)
})

describe('SecurityPage · MFA desactivado', () => {
  beforeEach(() => auth.mfaStatus.mockResolvedValue({ enabled: false, recovery_codes_remaining: 0 }))

  it('muestra el estado "Desactivada"', async () => {
    render(<SecurityPage />)
    expect(await screen.findByText(/Desactivada/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activar con código QR' })).toBeInTheDocument()
  })

  it('flujo completo de activación y guardado de códigos', async () => {
    auth.mfaSetup.mockResolvedValue({ qr: 'data:image/svg+xml;base64,AAA', secret: 'SECRETO123' })
    auth.mfaConfirm.mockResolvedValue(['c1', 'c2'])
    render(<SecurityPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Activar con código QR' }))
    expect(await screen.findByAltText('Código QR para la app autenticadora')).toHaveAttribute('src', 'data:image/svg+xml;base64,AAA')
    expect(screen.getByText('SECRETO123')).toBeInTheDocument()

    const activate = screen.getByRole('button', { name: 'Activar' })
    expect(activate).toBeDisabled()
    // solo dígitos y máximo 6
    await userEvent.type(screen.getByLabelText('Código de verificación'), '12ab34567890')
    expect(screen.getByLabelText('Código de verificación')).toHaveValue('123456')
    expect(activate).toBeEnabled()

    auth.mfaStatus.mockResolvedValue({ enabled: true, recovery_codes_remaining: 2 })
    await userEvent.click(activate)
    expect(await screen.findByText('Guarda tus códigos de recuperación')).toBeInTheDocument()
    expect(auth.mfaConfirm).toHaveBeenCalledWith('123456')
    expect(screen.getByText('c1')).toBeInTheDocument()
    expect(refreshUser).toHaveBeenCalled()

    // descargar
    const createObjectURL = vi.fn(() => 'blob:x')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }))
    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x')
    click.mockRestore()

    await userEvent.click(screen.getByRole('button', { name: 'Ya los guardé' }))
    expect(await screen.findByText(/Activada/)).toBeInTheDocument()
    expect(screen.getByText(/Códigos de recuperación disponibles: 2/)).toHaveTextContent('considera generar nuevos')
  })

  it('error al iniciar la activación', async () => {
    auth.mfaSetup.mockRejectedValue(httpError(500, '<html>'))
    render(<SecurityPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Activar con código QR' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo iniciar la activación.')
  })

  it('código inválido al confirmar; cancelar reinicia', async () => {
    auth.mfaSetup.mockResolvedValue({ qr: 'q', secret: 's' })
    auth.mfaConfirm.mockRejectedValue(httpError(400, { detail: 'Código incorrecto' }))
    render(<SecurityPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Activar con código QR' }))
    await userEvent.type(await screen.findByLabelText('Código de verificación'), '111111')
    await userEvent.click(screen.getByRole('button', { name: 'Activar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Código incorrecto')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByAltText('Código QR para la app autenticadora')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('SecurityPage · MFA activado', () => {
  beforeEach(() => auth.mfaStatus.mockResolvedValue({ enabled: true, recovery_codes_remaining: 8 }))

  it('muestra el estado y los botones de gestión (sin aviso con 8 códigos)', async () => {
    render(<SecurityPage />)
    expect(await screen.findByText(/Activada/)).toBeInTheDocument()
    expect(screen.getByText('Códigos de recuperación disponibles: 8')).not.toHaveTextContent('considera')
  })

  it('regenera códigos de recuperación', async () => {
    auth.mfaRegenerateRecoveryCodes.mockResolvedValue(['n1', 'n2'])
    render(<SecurityPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Generar nuevos códigos de recuperación' }))
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
    const submit = screen.getByRole('button', { name: 'Generar códigos' })
    expect(submit).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Código de la app'), '654321')
    await userEvent.click(submit)
    expect(await screen.findByText('n1')).toBeInTheDocument()
    expect(auth.mfaRegenerateRecoveryCodes).toHaveBeenCalledWith('654321')
    expect(refreshUser).not.toHaveBeenCalled()
  })

  it('error al regenerar usa el fallback', async () => {
    auth.mfaRegenerateRecoveryCodes.mockRejectedValue('raro')
    render(<SecurityPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Generar nuevos códigos de recuperación' }))
    await userEvent.type(screen.getByLabelText('Código de la app'), '654321')
    await userEvent.click(screen.getByRole('button', { name: 'Generar códigos' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido')
  })

  it('desactiva con contraseña y código', async () => {
    auth.mfaDisable.mockResolvedValue(undefined)
    render(<SecurityPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar' }))
    const submit = screen.getAllByRole('button', { name: 'Desactivar' }).find((b) => (b as HTMLButtonElement).type === 'submit')!
    expect(submit).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mi-clave')
    expect(submit).toBeDisabled() // falta el código
    await userEvent.type(screen.getByLabelText('Código de la app'), '123456')
    auth.mfaStatus.mockResolvedValue({ enabled: false, recovery_codes_remaining: 0 })
    await userEvent.click(submit)
    await waitFor(() => expect(auth.mfaDisable).toHaveBeenCalledWith('mi-clave', '123456'))
    expect(await screen.findByText(/Desactivada/)).toBeInTheDocument()
    expect(refreshUser).toHaveBeenCalled()
  })

  it('error al desactivar y Cancelar vuelve al estado base', async () => {
    auth.mfaDisable.mockRejectedValue(httpError(400, { detail: 'Contraseña incorrecta' }))
    render(<SecurityPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar' }))
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x')
    await userEvent.type(screen.getByLabelText('Código de la app'), '123456')
    const submit = screen.getAllByRole('button', { name: 'Desactivar' }).find((b) => (b as HTMLButtonElement).type === 'submit')!
    await userEvent.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent('Contraseña incorrecta')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generar nuevos códigos de recuperación' })).toBeInTheDocument()
  })

  it('fallback del error al desactivar', async () => {
    auth.mfaDisable.mockRejectedValue('raro')
    render(<SecurityPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar' }))
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x')
    await userEvent.type(screen.getByLabelText('Código de la app'), '123456')
    const submit = screen.getAllByRole('button', { name: 'Desactivar' }).find((b) => (b as HTMLButtonElement).type === 'submit')!
    await userEvent.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo desactivar.')
  })
})
