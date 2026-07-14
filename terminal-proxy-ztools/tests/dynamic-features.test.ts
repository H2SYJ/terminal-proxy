import {
  buildStructuredFeature,
  createDynamicFeatureStore,
  createEmptyFeatureDraft,
  featureToEditor,
  validateRegexLiteral,
} from '../src/dynamic-features'
import type { DynamicFeature, ZToolsAdapter } from '../src/types'

function createAdapter(initial: DynamicFeature[] = []) {
  const features = [...initial]
  const adapter: ZToolsAdapter = {
    onPluginEnter: vi.fn(),
    onPluginOut: vi.fn(),
    getFeatures: vi.fn(() => [...features]),
    setFeature: vi.fn((feature) => {
      const index = features.findIndex((item) => item.code === feature.code)
      if (index >= 0) features[index] = feature
      else features.push(feature)
      return true
    }),
    removeFeature: vi.fn((code) => {
      const index = features.findIndex((item) => item.code === code)
      if (index < 0) return false
      features.splice(index, 1)
      return true
    }),
    dbStorage: { getItem: vi.fn(), setItem: vi.fn() },
  }
  return { adapter, features }
}

describe('dynamic features', () => {
  it('从结构化表单生成去重关键词和正则 Feature', () => {
    const draft = createEmptyFeatureDraft()
    Object.assign(draft, {
      code: 'download-url',
      explain: 'sh download.sh',
      keywordsText: 'download\n下载\ndownload',
      regexEnabled: true,
      regexLabel: '下载 HTTPS 网址',
      regexMatch: '/^https:\\/\\/[^\\s]+$/i',
      minLength: '8',
      maxLength: '2048',
    })

    expect(buildStructuredFeature(draft)).toEqual({
      code: 'download-url',
      explain: 'sh download.sh',
      cmds: [
        'download',
        '下载',
        {
          type: 'regex',
          label: '下载 HTTPS 网址',
          match: '/^https:\\/\\/[^\\s]+$/i',
          minLength: 8,
          maxLength: 2048,
        },
      ],
    })
  })

  it('校验触发规则、正则格式和长度范围', () => {
    expect(validateRegexLiteral('/^https:\\/\\//i')).toBe(true)
    expect(validateRegexLiteral('^https://')).toBe(false)

    const draft = createEmptyFeatureDraft()
    Object.assign(draft, { code: 'download', explain: 'sh download.sh' })
    expect(() => buildStructuredFeature(draft)).toThrow('至少添加一个关键词或正则')

    Object.assign(draft, {
      regexEnabled: true,
      regexLabel: '下载网址',
      regexMatch: '/^https:/i',
      minLength: '10',
      maxLength: '8',
    })
    expect(() => buildStructuredFeature(draft)).toThrow('最大长度不能小于最小长度')
  })

  it('高级 Feature 使用 JSON 兼容编辑模式', () => {
    const feature: DynamicFeature = {
      code: 'files',
      explain: '处理文件',
      cmds: [{ type: 'files', label: '处理文件' }],
    }
    const editor = featureToEditor(feature)
    expect(editor.mode).toBe('json')
    if (editor.mode === 'json') expect(JSON.parse(editor.json)).toEqual(feature)
  })

  it('创建时拒绝重复 code，支持编辑和删除后刷新', () => {
    const original: DynamicFeature = { code: 'build', explain: 'npm run build', cmds: ['构建'] }
    const { adapter } = createAdapter([original])
    const store = createDynamicFeatureStore(adapter)

    expect(store.create(original)).toEqual({
      ok: false,
      message: '指令标识“build”已存在，请编辑原指令',
    })
    expect(store.update('build', { ...original, explain: 'npm run build:prod' })).toEqual({ ok: true })
    expect(store.features.value[0].explain).toBe('npm run build:prod')
    expect(store.update('build', { ...original, code: 'other' })).toEqual({
      ok: false,
      message: '编辑时不能修改指令标识',
    })
    expect(store.remove('build')).toEqual({ ok: true })
    expect(store.features.value).toEqual([])
  })

  it('向界面返回 ZTools API 失败信息', () => {
    const { adapter } = createAdapter()
    vi.mocked(adapter.getFeatures).mockImplementation(() => {
      throw new Error('读取失败')
    })
    const store = createDynamicFeatureStore(adapter)
    expect(store.refresh()).toEqual({ ok: false, message: '读取快捷指令失败：读取失败' })
    expect(store.errorMessage.value).toBe('读取快捷指令失败：读取失败')
  })
})

