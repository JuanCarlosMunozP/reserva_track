import { describe, expect, it, vi } from 'vitest'

const render = vi.fn()
const createRoot = vi.fn(() => ({ render }))
vi.mock('react-dom/client', () => ({ createRoot }))
vi.mock('../App.tsx', () => ({ default: () => null }))
vi.mock('../index.css', () => ({}))

describe('main.tsx', () => {
  it('monta <App /> dentro de StrictMode en #root', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    await import('../main')
    expect(createRoot).toHaveBeenCalledWith(document.getElementById('root'))
    expect(render).toHaveBeenCalledTimes(1)
  })
})
