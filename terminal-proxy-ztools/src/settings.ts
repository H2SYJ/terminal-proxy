import { ref } from 'vue'
import type { PluginSettings, ZToolsStorage } from './types'

export const DEFAULT_ENDPOINT = 'ws://192.168.3.33:2330/terminal'
export const SETTINGS_STORAGE_KEY = 'terminal-proxy.settings'

export function isValidWebSocketEndpoint(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'ws:' || url.protocol === 'wss:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

export function loadSettings(storage?: ZToolsStorage): PluginSettings {
  const stored = storage?.getItem(SETTINGS_STORAGE_KEY)
  if (
    stored &&
    typeof stored === 'object' &&
    'endpoint' in stored &&
    typeof stored.endpoint === 'string' &&
    isValidWebSocketEndpoint(stored.endpoint)
  ) {
    return { endpoint: stored.endpoint }
  }
  return { endpoint: DEFAULT_ENDPOINT }
}

export function createSettingsStore(storage?: ZToolsStorage) {
  const endpoint = ref(loadSettings(storage).endpoint)

  function saveEndpoint(value: string): { ok: true } | { ok: false; message: string } {
    const normalized = value.trim()
    if (!isValidWebSocketEndpoint(normalized)) {
      return { ok: false, message: '请输入有效的 ws:// 或 wss:// 地址' }
    }
    endpoint.value = normalized
    storage?.setItem(SETTINGS_STORAGE_KEY, { endpoint: normalized })
    return { ok: true }
  }

  function resetEndpoint(): void {
    endpoint.value = DEFAULT_ENDPOINT
    storage?.setItem(SETTINGS_STORAGE_KEY, { endpoint: DEFAULT_ENDPOINT })
  }

  return { endpoint, saveEndpoint, resetEndpoint }
}

export type SettingsStore = ReturnType<typeof createSettingsStore>

