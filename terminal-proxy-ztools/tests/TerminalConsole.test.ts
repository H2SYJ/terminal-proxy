import { mount } from '@vue/test-utils'
import TerminalConsole from '../src/components/TerminalConsole.vue'
import type { TerminalSession } from '../src/types'

function createSession(): TerminalSession {
  return {
    id: 'session-1',
    label: '会话 000001',
    endpoint: 'ws://localhost:2330/terminal',
    status: 'open',
    messages: [
      {
        id: 'message-1',
        type: 'output',
        content: '<img src=x onerror=alert(1)>',
        timestamp: Date.now(),
      },
    ],
    history: [],
    historyCursor: 0,
    pendingCommands: [],
  }
}

describe('TerminalConsole', () => {
  it('将服务端 HTML 内容作为纯文本渲染', () => {
    const wrapper = mount(TerminalConsole, {
      props: { session: createSession(), modelValue: '' },
    })
    expect(wrapper.get('.message-content').text()).toBe('<img src=x onerror=alert(1)>')
    expect(wrapper.find('.message-content img').exists()).toBe(false)
  })

  it('发送按钮、Enter 和方向键发出正确事件', async () => {
    const wrapper = mount(TerminalConsole, {
      props: { session: createSession(), modelValue: 'pwd' },
    })
    await wrapper.get('.send-button').trigger('click')
    await wrapper.get('input').trigger('keydown', { key: 'Enter' })
    await wrapper.get('input').trigger('keydown', { key: 'ArrowUp' })
    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })

    expect(wrapper.emitted('send')).toHaveLength(2)
    expect(wrapper.emitted('history')).toEqual([['up'], ['down']])
  })
})

