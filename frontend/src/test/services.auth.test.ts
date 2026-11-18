import { beforeEach, describe, expect, it, vi } from 'vitest'

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { post, get } }))

import { authService } from '../services/auth.service'

beforeEach(() => {
  post.mockReset()
  get.mockReset()
})

describe('authService', () => {
  it('login sin MFA devuelve ok', async () => {
    post.mockResolvedValue({ data: {} })
    expect(await authService.login({ username: 'a', password: 'b' })).toEqual({ status: 'ok' })
    expect(post).toHaveBeenCalledWith('/auth/token/cookie/', { username: 'a', password: 'b' })
  })

  it('login sin cuerpo también devuelve ok', async () => {
    post.mockResolvedValue({ data: undefined })
    expect(await authService.login({ username: 'a', password: 'b' })).toEqual({ status: 'ok' })
  })

  it('login con MFA devuelve el desafío', async () => {
    post.mockResolvedValue({ data: { mfa_required: true, mfa_token: 't' } })
    expect(await authService.login({ username: 'a', password: 'b' })).toEqual({ status: 'mfa_required', mfaToken: 't' })
  })

  it('mfa_required sin token se trata como ok', async () => {
    post.mockResolvedValue({ data: { mfa_required: true } })
    expect(await authService.login({ username: 'a', password: 'b' })).toEqual({ status: 'ok' })
  })

  it('verifyMfa envía token y código', async () => {
    post.mockResolvedValue({})
    await authService.verifyMfa('tok', '123456')
    expect(post).toHaveBeenCalledWith('/auth/mfa/verify/cookie/', { mfa_token: 'tok', code: '123456' })
  })

  it('me devuelve el usuario', async () => {
    get.mockResolvedValue({ data: { id: 1 } })
    expect(await authService.me()).toEqual({ id: 1 })
    expect(get).toHaveBeenCalledWith('/users/me/')
  })

  it('logout ignora errores', async () => {
    post.mockRejectedValue(new Error('offline'))
    await expect(authService.logout()).resolves.toBeUndefined()
    expect(post).toHaveBeenCalledWith('/auth/token/cookie/logout/')
  })

  it('mfaStatus / mfaSetup', async () => {
    get.mockResolvedValue({ data: { enabled: true, recovery_codes_remaining: 3 } })
    expect(await authService.mfaStatus()).toEqual({ enabled: true, recovery_codes_remaining: 3 })
    post.mockResolvedValue({ data: { qr: 'q', secret: 's' } })
    expect(await authService.mfaSetup()).toEqual({ qr: 'q', secret: 's' })
    expect(post).toHaveBeenCalledWith('/auth/mfa/setup/')
  })

  it('mfaConfirm y regenerate devuelven los códigos de recuperación', async () => {
    post.mockResolvedValue({ data: { recovery_codes: ['a', 'b'] } })
    expect(await authService.mfaConfirm('111111')).toEqual(['a', 'b'])
    expect(post).toHaveBeenLastCalledWith('/auth/mfa/confirm/', { code: '111111' })
    expect(await authService.mfaRegenerateRecoveryCodes('222222')).toEqual(['a', 'b'])
    expect(post).toHaveBeenLastCalledWith('/auth/mfa/recovery-codes/', { code: '222222' })
  })

  it('mfaDisable envía contraseña y código', async () => {
    post.mockResolvedValue({})
    await authService.mfaDisable('pw', '333333')
    expect(post).toHaveBeenCalledWith('/auth/mfa/disable/', { password: 'pw', code: '333333' })
  })
})
