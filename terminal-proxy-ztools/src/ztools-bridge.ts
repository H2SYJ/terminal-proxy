import type { TerminalManager } from './terminal-manager'
import type { DynamicFeature, ZToolsAdapter, ZToolsLaunchParam } from './types'

export type FeedbackLevel = 'success' | 'error'
export type FeedbackHandler = (message: string, level: FeedbackLevel) => void

export function parseDynamicFeature(payload: unknown): DynamicFeature {
  let feature: unknown = payload
  if (typeof payload === 'string') {
    try {
      feature = JSON.parse(payload)
    } catch {
      throw new Error('指令配置不是有效的 JSON')
    }
  }
  if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
    throw new Error('指令配置必须是 JSON 对象')
  }
  const candidate = feature as Partial<DynamicFeature>
  if (typeof candidate.code !== 'string' || !candidate.code.trim()) {
    throw new Error('指令配置缺少有效的 code')
  }
  if (typeof candidate.explain !== 'string' || !candidate.explain.trim()) {
    throw new Error('指令配置缺少有效的 explain')
  }
  if (!Array.isArray(candidate.cmds) || candidate.cmds.length === 0) {
    throw new Error('指令配置缺少有效的 cmds')
  }
  return feature as DynamicFeature
}

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
): void {
  ztools.onPluginEnter((launch) => {
    if (launch.code === 'addCommand') {
      try {
        const feature = parseDynamicFeature(launch.payload)
        if (!ztools.setFeature(feature)) throw new Error('ZTools 未能保存该指令')
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

