import {
  createDynamicFeatureStore,
  parseDynamicFeature,
  type DynamicFeatureStore,
} from './dynamic-features'
import type { TerminalManager } from './terminal-manager'
import type { ZToolsAdapter, ZToolsLaunchParam } from './types'

export { parseDynamicFeature } from './dynamic-features'

export type FeedbackLevel = 'success' | 'error'
export type FeedbackHandler = (message: string, level: FeedbackLevel) => void

export function resolveLaunchCommand(
  launch: ZToolsLaunchParam,
  ztools: ZToolsAdapter,
): string | undefined {
  if (launch.code === 'terminal') {
    if (launch.type !== 'over') return undefined
    const payload = String(launch.payload ?? '').trim()
    return payload || undefined
  }

  const feature = ztools.getFeatures([launch.code])[0]
  const payload = String(launch.payload ?? '').trim()
  if (!feature) return payload || undefined
  if (launch.type === 'regex') return `${feature.explain} ${payload}`.trim()
  if (launch.type === 'text') return feature.explain.trim() || undefined
  return payload || undefined
}

export function registerZToolsBridge(
  ztools: ZToolsAdapter,
  terminalManager: TerminalManager,
  feedback: FeedbackHandler,
  featureStore: DynamicFeatureStore = createDynamicFeatureStore(ztools),
): void {
  ztools.onPluginEnter((launch) => {
    if (launch.code === 'addCommand') {
      try {
        const feature = parseDynamicFeature(launch.payload)
        const result = featureStore.upsert(feature)
        if (!result.ok) throw new Error(result.message)
        const message = `指令“${feature.explain}”添加成功`
        ztools.showNotification?.(message)
        feedback(message, 'success')
      } catch (error) {
        feedback(error instanceof Error ? error.message : String(error), 'error')
      }
      return
    }
    terminalManager.createSession(resolveLaunchCommand(launch, ztools))
  })

  ztools.onPluginOut((isKill) => {
    if (isKill) terminalManager.closeAll()
  })
}
