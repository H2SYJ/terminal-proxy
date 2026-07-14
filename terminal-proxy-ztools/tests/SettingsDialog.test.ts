import { mount, type VueWrapper } from '@vue/test-utils'
import { createDynamicFeatureStore } from '../src/dynamic-features'
import SettingsDialog from '../src/components/SettingsDialog.vue'
import TopBar from '../src/components/TopBar.vue'
import type { DynamicFeature, ZToolsAdapter } from '../src/types'

function createFeatureFixture(initial: DynamicFeature[] = []) {
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
  return { adapter, store: createDynamicFeatureStore(adapter), features }
}

function findButton(wrapper: VueWrapper, text: string) {
  const button = wrapper.findAll('button').find((item) => item.text() === text)
  if (!button) throw new Error(`找不到按钮：${text}`)
  return button
}

describe('settings UI', () => {
  it('顶部入口显示为“设置”', () => {
    const wrapper = mount(TopBar, { props: { endpoint: 'ws://localhost:2330/terminal' } })
    expect(findButton(wrapper, '设置').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('连接设置设置')
  })

  it('在设置页切换连接设置和快捷指令', async () => {
    const feature: DynamicFeature = { code: 'build', explain: 'npm run build', cmds: ['构建'] }
    const fixture = createFeatureFixture([feature])
    const wrapper = mount(SettingsDialog, {
      props: {
        open: true,
        endpoint: 'ws://localhost:2330/terminal',
        featureStore: fixture.store,
      },
    })

    expect(wrapper.get('[role="dialog"]').text()).toContain('WebSocket 服务')
    await findButton(wrapper, '快捷指令').trigger('click')
    expect(wrapper.text()).toContain('npm run build')
    expect(fixture.adapter.getFeatures).toHaveBeenCalled()
  })

  it('通过结构化表单添加关键词指令并两步确认删除', async () => {
    const fixture = createFeatureFixture()
    const wrapper = mount(SettingsDialog, {
      props: {
        open: true,
        endpoint: 'ws://localhost:2330/terminal',
        featureStore: fixture.store,
      },
    })

    await findButton(wrapper, '快捷指令').trigger('click')
    await findButton(wrapper, '添加指令').trigger('click')
    await wrapper.get('#feature-code').setValue('download')
    await wrapper.get('#feature-command').setValue('sh download.sh')
    await wrapper.get('#feature-keywords').setValue('download\n下载脚本')
    await wrapper.get('.feature-editor').trigger('submit')

    expect(fixture.adapter.setFeature).toHaveBeenCalledWith({
      code: 'download',
      explain: 'sh download.sh',
      cmds: ['download', '下载脚本'],
    })
    expect(wrapper.text()).toContain('sh download.sh')

    await findButton(wrapper, '删除').trigger('click')
    expect(wrapper.text()).toContain('确认删除？')
    await findButton(wrapper, '确认').trigger('click')
    expect(fixture.adapter.removeFeature).toHaveBeenCalledWith('download')
    expect(wrapper.text()).toContain('还没有动态快捷指令')
  })
})

