import { ref } from 'vue'
import type {
  DynamicFeature,
  DynamicFeatureCommand,
  RegexFeatureCommand,
  ZToolsAdapter,
} from './types'

export interface StructuredFeatureDraft {
  code: string
  explain: string
  keywordsText: string
  regexEnabled: boolean
  regexLabel: string
  regexMatch: string
  minLength: string
  maxLength: string
}

export type FeatureEditor =
  | { mode: 'structured'; draft: StructuredFeatureDraft }
  | { mode: 'json'; json: string }

export type OperationResult = { ok: true } | { ok: false; message: string }

const REGEX_COMMAND_KEYS = new Set(['type', 'label', 'match', 'minLength', 'maxLength'])

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

export function isRegexFeatureCommand(command: DynamicFeatureCommand): command is RegexFeatureCommand {
  return typeof command === 'object' && command !== null && command.type === 'regex'
}

export function validateRegexLiteral(value: string): boolean {
  const normalized = value.trim()
  if (!normalized.startsWith('/')) return false
  const delimiterIndex = normalized.lastIndexOf('/')
  if (delimiterIndex <= 0) return false
  try {
    new RegExp(normalized.slice(1, delimiterIndex), normalized.slice(delimiterIndex + 1))
    return true
  } catch {
    return false
  }
}

function parsePositiveInteger(value: string, fieldName: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${fieldName}必须是正整数`)
  }
  return parsed
}

export function createEmptyFeatureDraft(): StructuredFeatureDraft {
  return {
    code: '',
    explain: '',
    keywordsText: '',
    regexEnabled: false,
    regexLabel: '',
    regexMatch: '',
    minLength: '1',
    maxLength: '10000',
  }
}

export function featureToEditor(feature: DynamicFeature): FeatureEditor {
  const regexCommands = feature.cmds.filter(isRegexFeatureCommand)
  const hasUnsupportedCommand = feature.cmds.some(
    (command) =>
      typeof command !== 'string' &&
      (!isRegexFeatureCommand(command) || Object.keys(command).some((key) => !REGEX_COMMAND_KEYS.has(key))),
  )
  if (hasUnsupportedCommand || regexCommands.length > 1) {
    return { mode: 'json', json: JSON.stringify(feature, null, 2) }
  }

  const regex = regexCommands[0]
  return {
    mode: 'structured',
    draft: {
      code: feature.code,
      explain: feature.explain,
      keywordsText: feature.cmds.filter((command): command is string => typeof command === 'string').join('\n'),
      regexEnabled: Boolean(regex),
      regexLabel: regex?.label ?? '',
      regexMatch: regex?.match ?? '',
      minLength: String(regex?.minLength ?? 1),
      maxLength: String(regex?.maxLength ?? 10000),
    },
  }
}

export function buildStructuredFeature(
  draft: StructuredFeatureDraft,
  baseFeature?: DynamicFeature,
): DynamicFeature {
  const code = draft.code.trim()
  const explain = draft.explain.trim()
  if (!code) throw new Error('请输入指令标识')
  if (!explain) throw new Error('请输入执行命令')

  const keywords = [...new Set(draft.keywordsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))]
  const cmds: DynamicFeatureCommand[] = [...keywords]
  if (draft.regexEnabled) {
    const label = draft.regexLabel.trim()
    const match = draft.regexMatch.trim()
    if (!label) throw new Error('请输入正则匹配结果名称')
    if (!validateRegexLiteral(match)) throw new Error('正则表达式必须使用 /pattern/flags 格式')
    const minLength = parsePositiveInteger(draft.minLength, '最小长度')
    const maxLength = parsePositiveInteger(draft.maxLength, '最大长度')
    if (maxLength < minLength) throw new Error('最大长度不能小于最小长度')
    cmds.push({ type: 'regex', label, match, minLength, maxLength })
  }
  if (cmds.length === 0) throw new Error('请至少添加一个关键词或正则触发规则')

  return {
    ...baseFeature,
    code,
    explain,
    cmds,
  }
}

export function summarizeFeature(feature: DynamicFeature): string {
  const keywords = feature.cmds.filter((command): command is string => typeof command === 'string')
  const regexCommands = feature.cmds.filter(isRegexFeatureCommand)
  const parts: string[] = []
  if (keywords.length) parts.push(`关键词：${keywords.join('、')}`)
  if (regexCommands.length) parts.push(`正则：${regexCommands.map((command) => command.label).join('、')}`)
  const advancedCount = feature.cmds.length - keywords.length - regexCommands.length
  if (advancedCount > 0) parts.push(`高级规则 ${advancedCount} 项`)
  return parts.join('；') || '未识别的触发规则'
}

export function createDynamicFeatureStore(ztools: ZToolsAdapter) {
  const features = ref<DynamicFeature[]>([])
  const errorMessage = ref('')

  function refresh(): OperationResult {
    try {
      const result = ztools.getFeatures()
      features.value = Array.isArray(result) ? result : []
      errorMessage.value = ''
      return { ok: true }
    } catch (error) {
      const message = `读取快捷指令失败：${error instanceof Error ? error.message : String(error)}`
      errorMessage.value = message
      return { ok: false, message }
    }
  }

  function persist(feature: DynamicFeature): OperationResult {
    try {
      if (!ztools.setFeature(feature)) return { ok: false, message: 'ZTools 未能保存该指令' }
      return refresh()
    } catch (error) {
      return { ok: false, message: `保存快捷指令失败：${error instanceof Error ? error.message : String(error)}` }
    }
  }

  function create(feature: DynamicFeature): OperationResult {
    const refreshResult = refresh()
    if (!refreshResult.ok) return refreshResult
    if (features.value.some((item) => item.code === feature.code)) {
      return { ok: false, message: `指令标识“${feature.code}”已存在，请编辑原指令` }
    }
    return persist(feature)
  }

  function update(originalCode: string, feature: DynamicFeature): OperationResult {
    if (feature.code !== originalCode) return { ok: false, message: '编辑时不能修改指令标识' }
    return persist(feature)
  }

  function upsert(feature: DynamicFeature): OperationResult {
    return persist(feature)
  }

  function remove(code: string): OperationResult {
    try {
      if (!ztools.removeFeature(code)) return { ok: false, message: 'ZTools 未能删除该指令' }
      return refresh()
    } catch (error) {
      return { ok: false, message: `删除快捷指令失败：${error instanceof Error ? error.message : String(error)}` }
    }
  }

  return { features, errorMessage, refresh, create, update, upsert, remove }
}

export type DynamicFeatureStore = ReturnType<typeof createDynamicFeatureStore>

