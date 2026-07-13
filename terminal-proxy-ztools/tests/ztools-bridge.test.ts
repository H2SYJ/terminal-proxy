import { createTerminalManager } from '../src/terminal-manager'
import type {
  DynamicFeature,
  WebSocketClient,
  ZToolsAdapter,
  ZToolsLaunchParam,
} from '../src/types'
import { parseDynamicFeature, registerZToolsBridge, resolveLaunchCommand } from '../src/ztools-bridge'

class BridgeSocket implements WebSocketClient {
  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  closed = false
  send(): void {}
  close(): void {
    this.closed = true
    this.readyState = 3
  }
}

function createZToolsMock(features: DynamicFeature[] = []) {
  let enterCallback: (param: ZToolsLaunchParam) => void = () => undefined
  let outCallback: (isKill: boolean) => void = () => undefined
  const ztools: ZToolsAdapter = {
    onPluginEnter(callback) {
      enterCallback = callback
    },
    onPluginOut(callback) {
      outCallback = callback
    },
    getFeatures: vi.fn(() => features),
    setFeature: vi.fn(() => true),
    showNotification: vi.fn(),
    dbStorage: {
      getItem: vi.fn(),
      setItem: vi.fn(),
    },
  }
  return {
    ztools,
    enter: (param: ZToolsLaunchParam) => enterCallback(param),
    out: (isKill: boolean) => outCallback(isKill),
  }
}

describe('ztools bridge', () => {
  it('解析并校验动态 Feature', () => {
    expect(parseDynamicFeature('{"code":"build","explain":"构建","cmds":["构建"]}')).toMatchObject({
      code: 'build',
      explain: '构建',
    })
    expect(() => parseDynamicFeature('{bad json}')).toThrow('不是有效的 JSON')
    expect(() => parseDynamicFeature('{"code":"build","cmds":[]}')).toThrow('explain')
  })

  it('普通终端触发不发送触发词，全局触发发送选中文本', () => {
    const { ztools } = createZToolsMock()
    expect(resolveLaunchCommand({ code: 'terminal', type: 'text', payload: '终端' }, ztools)).toBeUndefined()
    expect(resolveLaunchCommand({ code: 'terminal', type: 'over', payload: 'npm test' }, ztools)).toBe('npm test')
  })

  it('动态文本和正则 Feature 按 explain 生成命令', () => {
    const feature = { code: 'build', explain: 'npm run', cmds: ['构建'] }
    const { ztools } = createZToolsMock([feature])
    expect(resolveLaunchCommand({ code: 'build', type: 'text', payload: '构建' }, ztools)).toBe('npm run')
    expect(resolveLaunchCommand({ code: 'build', type: 'regex', payload: 'test' }, ztools)).toBe('npm run test')
  })

  it('注册生命周期、添加 Feature 并仅在强制退出时关闭连接', () => {
    const sockets: BridgeSocket[] = []
    const manager = createTerminalManager({
      getEndpoint: () => 'ws://localhost:2330/terminal',
      webSocketFactory: () => {
        const socket = new BridgeSocket()
        sockets.push(socket)
        return socket
      },
    })
    const mock = createZToolsMock()
    const feedback = vi.fn()
    registerZToolsBridge(mock.ztools, manager, feedback)

    mock.enter({ code: 'terminal', type: 'text', payload: '终端' })
    expect(manager.sessions).toHaveLength(1)
    expect(manager.sessions[0].pendingCommands).toEqual([])

    mock.enter({
      code: 'addCommand',
      type: 'regex',
      payload: '{"code":"build","explain":"构建","cmds":["构建"]}',
    })
    expect(mock.ztools.setFeature).toHaveBeenCalledWith(expect.objectContaining({ code: 'build' }))
    expect(feedback).toHaveBeenCalledWith('指令“构建”添加成功', 'success')

    mock.enter({ code: 'addCommand', type: 'regex', payload: '{invalid}' })
    expect(feedback).toHaveBeenLastCalledWith('指令配置不是有效的 JSON', 'error')

    mock.out(false)
    expect(sockets[0].closed).toBe(false)
    mock.out(true)
    expect(sockets[0].closed).toBe(true)
  })
})

