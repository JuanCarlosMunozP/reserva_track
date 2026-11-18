import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const refreshUser = vi.hoisted(() => vi.fn())
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ refreshUser }) }))
const auth = vi.hoisted(() => ({ mfaStatus: vi.fn(), mfaSetup: vi.fn(), mfaConfirm: vi.fn() }))
vi.mock('../services/auth.service', () => ({ authService: auth }))

import { SecurityPage } from '../pages/security/SecurityPage'

describe('SecurityPage · carga del estado (rama de error del efecto)', () => {
  it('sin red: el error de carga se muestra', async () => {
    auth.mfaStatus.mockReset().mockRejectedValue('raro')
    render(<SecurityPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el estado de seguridad.')
  })

  it('no actualiza el error si se desmonta antes de fallar', async () => {
    let reject!: (e: unknown) => void
    auth.mfaStatus.mockReset().mockReturnValue(new Promise((_, r) => { reject = r }))
    const { unmount } = render(<SecurityPage />)
    unmount()
    reject(new Error('x'))
    await new Promise((r) => setTimeout(r, 20))
  })

  it('si falla la recarga del estado tras activar MFA, igualmente muestra los códigos', async () => {
    refreshUser.mockReset().mockResolvedValue(undefined)
    auth.mfaStatus.mockReset().mockResolvedValueOnce({ enabled: false, recovery_codes_remaining: 0 })
    auth.mfaSetup.mockReset().mockResolvedValue({ qr: 'q', secret: 's' })
    auth.mfaConfirm.mockReset().mockResolvedValue(['k1'])
    render(<SecurityPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Activar con código QR' }))
    await userEvent.type(await screen.findByLabelText('Código de verificación'), '123456')
    auth.mfaStatus.mockReset().mockRejectedValue('raro')
    await userEvent.click(screen.getByRole('button', { name: 'Activar' }))
    expect(await screen.findByText('k1')).toBeInTheDocument()
    expect(auth.mfaStatus).toHaveBeenCalledTimes(1)
  })
})
