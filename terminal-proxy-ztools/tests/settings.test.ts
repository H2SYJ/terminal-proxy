import {
  DEFAULT_ENDPOINT,
  SETTINGS_STORAGE_KEY,
  createSettingsStore,
  isValidWebSocketEndpoint,
  loadSettings,
} from '../src/settings'
import type { ZToolsStorage } from '../src/types'

function createStorage(initial?: unknown): ZToolsStorage & { value: unknown } {
  let value = initial
  return {
    get value() {
      return value
    },
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, nextValue: unknown) => {
      value = nextValue
    }),
  }
}

describe('settings', () => {
  it('只接受 ws 和 wss 地址', () => {
    expect(isValidWebSocketEndpoint('ws://127.0.0.1:2330/terminal')).toBe(true)
    expect(isValidWebSocketEndpoint('wss://example.com/terminal')).toBe(true)
    expect(isValidWebSocketEndpoint('http://example.com')).toBe(false)
    expect(isValidWebSocketEndpoint('not-a-url')).toBe(false)
  })

  it('无效存储值回退到默认地址', () => {
    const storage = createStorage({ endpoint: 'http://example.com' })
    expect(loadSettings(storage)).toEqual({ endpoint: DEFAULT_ENDPOINT })
  })

  it('保存、恢复并重置连接地址', () => {
    const storage = createStorage({ endpoint: 'wss://example.com/terminal' })
    const store = createSettingsStore(storage)
    expect(store.endpoint.value).toBe('wss://example.com/terminal')

    expect(store.saveEndpoint(' ws://localhost:2330/terminal ')).toEqual({ ok: true })
    expect(store.endpoint.value).toBe('ws://localhost:2330/terminal')
    expect(storage.setItem).toHaveBeenCalledWith(SETTINGS_STORAGE_KEY, {
      endpoint: 'ws://localhost:2330/terminal',
    })

    expect(store.saveEndpoint('ftp://localhost')).toEqual({
      ok: false,
      message: '请输入有效的 ws:// 或 wss:// 地址',
    })
    store.resetEndpoint()
    expect(store.endpoint.value).toBe(DEFAULT_ENDPOINT)
  })
})
