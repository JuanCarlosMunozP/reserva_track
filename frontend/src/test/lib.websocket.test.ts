import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class MockWS {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3
  static instances: MockWS[] = []
  readyState = MockWS.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((ev: { code: number }) => void) | null = null
  closed: Array<[number | undefined, string | undefined]> = []
  constructor(public url: string) { MockWS.instances.push(this) }
  close(code?: number, reason?: string) { this.closed.push([code, reason]); this.readyState = MockWS.CLOSED }
  open() { this.readyState = MockWS.OPEN; this.onopen?.() }
  msg(data: unknown) { this.onmessage?.({ data }) }
  drop(code = 1006) { this.readyState = MockWS.CLOSED; this.onclose?.({ code }) }
}

async function load() {
  vi.resetModules()
  return (await import('../lib/websocket')).notificationsSocket
}
const last = () => MockWS.instances[MockWS.instances.length - 1]

beforeEach(() => {
  MockWS.instances = []
  vi.stubGlobal('WebSocket', MockWS)
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('notificationsSocket', () => {
  it('conecta contra el origen de la pestaña (ws:)', async () => {
    const s = await load()
    s.connect()
    expect(last().url).toBe(`ws://${window.location.host}/ws/notifications/`)
  })

  it('usa wss: si la página es https', async () => {
    vi.stubGlobal('location', { protocol: 'https:', host: 'app.test' })
    const s = await load()
    s.connect()
    expect(last().url).toBe('wss://app.test/ws/notifications/')
  })

  it('respeta VITE_WS_BASE_URL salvo que apunte a :8000', async () => {
    vi.stubEnv('VITE_WS_BASE_URL', 'wss://ws.test/')
    let s = await load()
    s.connect()
    expect(last().url).toBe('wss://ws.test/ws/notifications/')
    vi.stubEnv('VITE_WS_BASE_URL', 'ws://localhost:8000')
    s = await load()
    s.connect()
    expect(last().url).toBe(`ws://${window.location.host}/ws/notifications/`)
  })

  it('no abre una segunda conexión si ya hay una viva', async () => {
    const s = await load()
    s.connect()
    s.connect()
    expect(MockWS.instances).toHaveLength(1)
    last().open()
    s.connect()
    expect(MockWS.instances).toHaveLength(1)
  })

  it('entrega los eventos a los suscriptores y soporta darse de baja', async () => {
    const s = await load()
    const h1 = vi.fn()
    const off = s.on(h1)
    s.connect()
    last().open()
    const ev = { type: 'reservation_created', code: 'X' }
    last().msg(JSON.stringify(ev))
    expect(h1).toHaveBeenCalledWith(ev)
    off()
    last().msg(JSON.stringify(ev))
    expect(h1).toHaveBeenCalledTimes(1)
  })

  it('ignora mensajes inválidos y un handler que lanza no afecta a los demás', async () => {
    const s = await load()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = vi.fn(() => { throw new Error('x') })
    const good = vi.fn()
    s.on(bad); s.on(good)
    s.connect()
    last().msg('{no-json')
    last().msg('null')
    last().msg('5')
    expect(good).not.toHaveBeenCalled()
    last().msg('{"type":"a"}')
    expect(good).toHaveBeenCalledTimes(1)
    expect(err).toHaveBeenCalled()
  })

  it('cierra un socket obsoleto que abre tras disconnect', async () => {
    const s = await load()
    s.connect()
    const ws = last()
    ws.onopen!.call(ws)
    // simula que disconnect ocurrió y el socket sigue referenciado
    s.disconnect()
    ws.readyState = MockWS.OPEN
    ws.onopen?.()
    expect(ws.onopen).toBeNull()
  })

  it('onopen detecta stale cuando intentionallyClosed y socket distinto', async () => {
    const s = await load()
    s.connect()
    const first = last()
    const onopen = first.onopen!
    s.disconnect()
    onopen()
    expect(first.closed).toContainEqual([1000, 'stale'])
  })

  it('disconnect cierra con 1000 solo si está abierto', async () => {
    const s = await load()
    s.connect()
    const ws = last()
    ws.open()
    s.disconnect()
    expect(ws.closed).toEqual([[1000, 'client_disconnect']])
    s.connect()
    const ws2 = last()
    s.disconnect() // CONNECTING: no cierra
    expect(ws2.closed).toEqual([])
    s.disconnect() // sin socket
  })

  it('reconecta con backoff exponencial y reinicia al abrir', async () => {
    const s = await load()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    s.connect()
    last().onerror?.()
    last().drop()
    expect(MockWS.instances).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(MockWS.instances).toHaveLength(2)
    last().drop()
    vi.advanceTimersByTime(1999)
    expect(MockWS.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(MockWS.instances).toHaveLength(3)
    last().open() // reinicia el contador
    last().drop()
    vi.advanceTimersByTime(1000)
    expect(MockWS.instances).toHaveLength(4)
  })

  it('el backoff se topa a 30 s', async () => {
    const s = await load()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    s.connect()
    for (let i = 0; i < 7; i++) {
      last().drop()
      vi.advanceTimersByTime(30_000)
    }
    const before = MockWS.instances.length
    last().drop()
    vi.advanceTimersByTime(29_999)
    expect(MockWS.instances).toHaveLength(before)
    vi.advanceTimersByTime(1)
    expect(MockWS.instances).toHaveLength(before + 1)
  })

  it('no reintenta con código 4401', async () => {
    const s = await load()
    s.connect()
    last().drop(4401)
    vi.advanceTimersByTime(60_000)
    expect(MockWS.instances).toHaveLength(1)
  })

  it('no reintenta tras disconnect voluntario y cancela el timer pendiente', async () => {
    const s = await load()
    s.connect()
    last().drop()
    s.disconnect()
    vi.advanceTimersByTime(60_000)
    expect(MockWS.instances).toHaveLength(1)
  })

  it('el cierre llega cuando ya se desconectó voluntariamente', async () => {
    const s = await load()
    s.connect()
    const ws = last()
    const onclose = ws.onclose!
    s.disconnect()
    onclose({ code: 1006 })
    vi.advanceTimersByTime(60_000)
    expect(MockWS.instances).toHaveLength(1)
  })

  it('open() y scheduleReconnect() no hacen nada si no está conectado', async () => {
    const s = await load()
    s.connect()
    const ws = last()
    const onclose = ws.onclose!
    s.disconnect()
    // fuerza intentionallyClosed=false para llegar a scheduleReconnect con connected=false
    ;(s as unknown as { intentionallyClosed: boolean }).intentionallyClosed = false
    onclose({ code: 1006 })
    vi.advanceTimersByTime(60_000)
    expect(MockWS.instances).toHaveLength(1)
    ;(s as unknown as { open: () => void }).open()
    expect(MockWS.instances).toHaveLength(1)
  })
})
