import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Api = typeof import('../lib/api')
type Reply = { status: number; data?: unknown; headers?: Record<string, string> }

let calls: InternalAxiosRequestConfig[] = []
let handler: (cfg: InternalAxiosRequestConfig) => Reply | Promise<Reply>

const adapter: AxiosAdapter = async (config) => {
  calls.push(config)
  const r = await handler(config)
  const response = { status: r.status, statusText: '', data: r.data, headers: r.headers ?? {}, config, request: {} }
  if (r.status >= 200 && r.status < 300) return response
  throw new AxiosError(`HTTP ${r.status}`, 'ERR_BAD_REQUEST', config, {}, response as never)
}

async function load(): Promise<Api> {
  vi.resetModules()
  axios.defaults.adapter = adapter
  return import('../lib/api')
}

function stubLocation(pathname: string, search = '') {
  const assign = vi.fn()
  vi.stubGlobal('location', { pathname, search, assign })
  return assign
}

const clearCsrf = () => { document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT' }

beforeEach(() => {
  calls = []
  handler = () => ({ status: 200, data: {} })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  clearCsrf()
})

describe('userCache', () => {
  it('guarda, lee y borra el perfil', async () => {
    const { userCache, USER_KEY } = await load()
    expect(userCache.get()).toBeNull()
    userCache.set({ id: 1 })
    expect(localStorage.getItem(USER_KEY)).toBe('{"id":1}')
    expect(userCache.get()).toEqual({ id: 1 })
    userCache.clear()
    expect(userCache.get()).toBeNull()
  })
  it('JSON corrupto devuelve null', async () => {
    const { userCache, USER_KEY } = await load()
    localStorage.setItem(USER_KEY, '{no-json')
    expect(userCache.get()).toBeNull()
  })
})

describe('baseURL', () => {
  it('en DEV usa /api/v1', async () => {
    const { api } = await load()
    expect(api.defaults.baseURL).toBe('/api/v1')
  })
  it('en build usa VITE_API_BASE_URL o el valor por defecto', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_API_BASE_URL', 'https://x.test/api')
    expect((await load()).api.defaults.baseURL).toBe('https://x.test/api')
    vi.stubEnv('VITE_API_BASE_URL', '')
    expect((await load()).api.defaults.baseURL).toBe('/api/v1')
  })
})

describe('CSRF', () => {
  it('adjunta X-CSRFToken en métodos que mutan', async () => {
    const { api } = await load()
    document.cookie = 'csrftoken=abc%20123'
    await api.post('/x/')
    expect(calls[0].headers.get('X-CSRFToken')).toBe('abc 123')
  })
  it('no lo adjunta en GET ni si falta la cookie', async () => {
    const { api } = await load()
    document.cookie = 'csrftoken=abc'
    await api.get('/x/')
    expect(calls[0].headers.get('X-CSRFToken')).toBeFalsy()
    clearCsrf()
    await api.delete('/x/')
    expect(calls[1].headers.get('X-CSRFToken')).toBeFalsy()
  })
})

describe('interceptor de 401', () => {
  it('refresca y reintenta una vez', async () => {
    const { api } = await load()
    let first = true
    handler = (cfg) => {
      if (cfg.url === '/auth/token/cookie/refresh/') return { status: 200 }
      if (first) { first = false; return { status: 401 } }
      return { status: 200, data: { ok: 1 } }
    }
    const res = await api.get('/users/me/')
    expect(res.data).toEqual({ ok: 1 })
    expect(calls.map((c) => c.url)).toEqual(['/users/me/', '/auth/token/cookie/refresh/', '/users/me/'])
  })
  it('errores que no son 401 se propagan', async () => {
    const { api } = await load()
    handler = () => ({ status: 500 })
    await expect(api.get('/x/')).rejects.toBeInstanceOf(AxiosError)
    expect(calls).toHaveLength(1)
  })
  it('no refresca en endpoints de auth', async () => {
    const { api } = await load()
    handler = () => ({ status: 401 })
    await expect(api.post('/auth/token/cookie/')).rejects.toBeInstanceOf(AxiosError)
    await expect(api.post('/auth/mfa/verify/cookie/')).rejects.toBeInstanceOf(AxiosError)
    expect(calls).toHaveLength(2)
  })
  it('no reintenta más de una vez', async () => {
    const { api } = await load()
    handler = (cfg) => (cfg.url?.includes('refresh') ? { status: 200 } : { status: 401 })
    await expect(api.get('/x/')).rejects.toBeInstanceOf(AxiosError)
    // original + refresh + reintento (que vuelve a fallar y ya no refresca)
    expect(calls).toHaveLength(3)
  })
  it('refresh fallido en zona pública: limpia caché y rechaza sin redirigir', async () => {
    const { api, userCache } = await load()
    const assign = stubLocation('/')
    userCache.set({ id: 1 })
    handler = () => ({ status: 401 })
    await expect(api.get('/users/me/')).rejects.toBeInstanceOf(AxiosError)
    expect(userCache.get()).toBeNull()
    expect(assign).not.toHaveBeenCalled()
  })
  it('refresh fallido en zona privada redirige al login con next', async () => {
    const { api } = await load()
    const assign = stubLocation('/admin/equipos', '?a=1')
    handler = () => ({ status: 401 })
    await expect(api.get('/x/')).rejects.toBeInstanceOf(AxiosError)
    expect(assign).toHaveBeenCalledWith(`/?next=${encodeURIComponent('/admin/equipos?a=1')}`)
  })
  it('peticiones concurrentes esperan al mismo refresh', async () => {
    const { api } = await load()
    let refreshes = 0
    const seen = new Set<string>()
    handler = async (cfg) => {
      if (cfg.url === '/auth/token/cookie/refresh/') {
        refreshes++
        await new Promise((r) => setTimeout(r, 20))
        return { status: 200 }
      }
      const key = cfg.url!
      if (!seen.has(key)) { seen.add(key); return { status: 401 } }
      return { status: 200, data: key }
    }
    const [a, b] = await Promise.all([api.get('/a/'), api.get('/b/')])
    expect([a.data, b.data]).toEqual(['/a/', '/b/'])
    expect(refreshes).toBe(1)
  })
  it('concurrentes rechazan si el refresh falla', async () => {
    const { api } = await load()
    handler = async (cfg) => {
      if (cfg.url?.includes('refresh')) await new Promise((r) => setTimeout(r, 20))
      return { status: 401 }
    }
    const results = await Promise.allSettled([api.get('/a/'), api.get('/b/')])
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
  })
})

describe('getApiErrorMessage', () => {
  const mk = (data: unknown, headers: Record<string, string> = {}, status = 400, message = 'axios msg') =>
    new AxiosError(message, 'E', undefined, {}, { status, data, headers, statusText: '', config: {} as never } as never)

  it('detail de DRF', async () => {
    const { getApiErrorMessage } = await load()
    expect(getApiErrorMessage(mk({ detail: 'No autorizado' }))).toBe('No autorizado')
  })
  it('primer campo en lista o string', async () => {
    const { getApiErrorMessage } = await load()
    expect(getApiErrorMessage(mk({ name: ['Requerido'] }))).toBe('Requerido')
    expect(getApiErrorMessage(mk({ name: 'Inválido' }))).toBe('Inválido')
  })
  it('string plano', async () => {
    const { getApiErrorMessage } = await load()
    expect(getApiErrorMessage(mk('texto plano'))).toBe('texto plano')
  })
  it('HTML o CSS de Django devuelve el fallback', async () => {
    const { getApiErrorMessage } = await load()
    expect(getApiErrorMessage(mk('x', { 'content-type': 'text/html' }), 'fb')).toBe('fb')
    expect(getApiErrorMessage(mk('<html></html>'), 'fb')).toBe('fb')
    expect(getApiErrorMessage(mk('<!DOCTYPE html>'), 'fb')).toBe('fb')
    expect(getApiErrorMessage(mk('h1 { font-weight: 1 }'), 'fb')).toBe('fb')
  })
  it('cuerpo vacío o sin forma usa error.message', async () => {
    const { getApiErrorMessage } = await load()
    expect(getApiErrorMessage(mk(''))).toBe('')
    expect(getApiErrorMessage(mk({ campo: 5 }))).toBe('axios msg')
    expect(getApiErrorMessage(mk(null))).toBe('axios msg')
  })
  it('cabeceras estilo AxiosHeaders (get) y Content-Type en mayúscula', async () => {
    const { getApiErrorMessage } = await load()
    const e1 = mk('plain')
    ;(e1.response as { headers: unknown }).headers = { get: () => 'text/html' }
    expect(getApiErrorMessage(e1, 'fb')).toBe('fb')
    const e2 = mk('plain', { 'Content-Type': 'text/html' })
    expect(getApiErrorMessage(e2, 'fb')).toBe('fb')
  })
  it('error genérico, no-Error y fallback por defecto', async () => {
    const { getApiErrorMessage } = await load()
    expect(getApiErrorMessage(new Error('boom'))).toBe('boom')
    expect(getApiErrorMessage(42)).toBe('Ocurrió un error')
    expect(getApiErrorMessage(42, 'otro')).toBe('otro')
  })
  it('axios error sin respuesta ni mensaje cae al fallback', async () => {
    const { getApiErrorMessage } = await load()
    const e = new AxiosError('', 'E')
    e.message = ''
    expect(getApiErrorMessage(e, 'fb')).toBe('')
  })
})

describe('getApiFieldErrors', () => {
  const mk = (data: unknown, status = 400) =>
    new AxiosError('m', 'E', undefined, {}, { status, data, headers: {}, statusText: '', config: {} as never } as never)

  it('aplana errores de validación', async () => {
    const { getApiFieldErrors } = await load()
    expect(getApiFieldErrors(mk({
      name: ['Req'], email: 'Mal', non_field_errors: ['General'], detail: 'D', num: [1], other: 5,
    }))).toEqual({ name: 'Req', email: 'Mal', '': 'D' })
  })
  it('devuelve {} cuando no aplica', async () => {
    const { getApiFieldErrors } = await load()
    expect(getApiFieldErrors(new Error('x'))).toEqual({})
    expect(getApiFieldErrors(mk({ a: ['b'] }, 500))).toEqual({})
    expect(getApiFieldErrors(mk(null))).toEqual({})
    expect(getApiFieldErrors(mk('texto'))).toEqual({})
    expect(getApiFieldErrors(mk(['a']))).toEqual({})
  })
})
