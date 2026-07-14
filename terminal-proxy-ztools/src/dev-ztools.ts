import type { DynamicFeature, ZToolsAdapter, ZToolsLaunchParam } from './types'

export function getZToolsAdapter(): ZToolsAdapter {
  const hostAdapter = (window as unknown as { ztools?: ZToolsAdapter }).ztools
  if (hostAdapter) return hostAdapter

  console.warn('未检测到 ZTools API，当前使用预览适配器')

  const features: DynamicFeature[] = []
  const storage = new Map<string, unknown>()
  let enterCallback: ((param: ZToolsLaunchParam) => void) | undefined
  let outCallback: ((isKill: boolean) => void) | undefined

  return {
    onPluginEnter(callback) {
      enterCallback = callback
      void enterCallback
    },
    onPluginOut(callback) {
      outCallback = callback
      void outCallback
    },
    getFeatures(codes) {
      return codes?.length ? features.filter((feature) => codes.includes(feature.code)) : features
    },
    setFeature(feature) {
      const index = features.findIndex((item) => item.code === feature.code)
      if (index >= 0) features[index] = feature
      else features.push(feature)
      return true
    },
    removeFeature(code) {
      const index = features.findIndex((item) => item.code === code)
      if (index < 0) return false
      features.splice(index, 1)
      return true
    },
    showNotification(body) {
      console.info(`[ZTools 通知] ${body}`)
    },
    dbStorage: {
      getItem(key) {
        return storage.get(key) ?? null
      },
      setItem(key, value) {
        storage.set(key, value)
      },
      removeItem(key) {
        storage.delete(key)
      },
    },
  }
}
