import { watch } from 'vue'
import { createTerminalManager } from '../src/terminal-manager'
import type { WebSocketClient } from '../src/types'

class MockWebSocket implements WebSocketClient {
  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  readonly sent: string[] = []
  closed = false

  send(data: string): void {
    if (this.readyState !== 1) throw new Error('Socket 未连接')
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
    this.readyState = 3
  }

  open(): void {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }

  message(data: string): void {
    this.onmessage?.({ data } as MessageEvent<string>)
  }

  error(): void {
    this.onerror?.(new Event('error'))
  }

  remoteClose(): void {
    this.readyState = 3
    this.onclose?.(new CloseEvent('close'))
  }
}

function createFixture() {
  const sockets: MockWebSocket[] = []
  let sequence = 0
  const manager = createTerminalManager({
    getEndpoint: () => 'ws://127.0.0.1:2330/terminal',
    webSocketFactory: () => {
      const socket = new MockWebSocket()
      sockets.push(socket)
      return socket
    },
    idFactory: () => `id-${++sequence}`,
    now: () => 123456,
  })
  return { manager, sockets }
}

describe('terminal manager', () => {
  it('连接成功后发送排队命令并接收纯文本输出', () => {
    const { manager, sockets } = createFixture()
    const session = manager.createSession('echo hello')

    expect(session.status).toBe('connecting')
    expect(sockets[0].sent).toEqual([])
    sockets[0].open()

    expect(session.status).toBe('open')
    expect(sockets[0].sent).toEqual(['echo hello'])
    expect(session.messages.some((message) => message.type === 'command' && message.content === 'echo hello')).toBe(true)

    sockets[0].message('<img src=x onerror=alert(1)>')
    expect(session.messages.at(-1)?.content).toBe('<img src=x onerror=alert(1)>')
  })

  it('收到 WebSocket 消息时立即触发 Vue 响应式更新', () => {
    const { manager, sockets } = createFixture()
    const session = manager.createSession()
    const observedLengths: number[] = []
    const stopWatching = watch(
      () => manager.activeSession.value?.messages.length,
      (length) => observedLengths.push(length ?? 0),
      { flush: 'sync' },
    )

    sockets[0].message('实时输出')

    expect(session.messages.at(-1)?.content).toBe('实时输出')
    expect(observedLengths).toEqual([2])
    stopWatching()
  })

  it('连接建立前接受手动命令并维护独立历史', () => {
    const { manager, sockets } = createFixture()
    const session = manager.createSession()

    expect(manager.sendCommand('pwd', session.id)).toBe(true)
    expect(manager.navigateHistory('up', '', session.id)).toBe('pwd')
    expect(manager.navigateHistory('down', 'pwd', session.id)).toBe('')

    sockets[0].open()
    expect(sockets[0].sent).toEqual(['pwd'])
  })

  it('记录错误状态，允许重连并在关闭时释放 Socket', () => {
    const { manager, sockets } = createFixture()
    const session = manager.createSession()

    sockets[0].error()
    expect(session.status).toBe('error')
    manager.reconnectSession(session.id)
    expect(sockets[0].closed).toBe(true)
    expect(sockets).toHaveLength(2)

    sockets[1].open()
    manager.closeSession(session.id)
    expect(sockets[1].closed).toBe(true)
    expect(manager.sessions).toHaveLength(0)
    expect(manager.activeSession.value).toBeNull()
  })

  it('强制清理全部会话连接', () => {
    const { manager, sockets } = createFixture()
    manager.createSession()
    manager.createSession()
    sockets.forEach((socket) => socket.open())

    manager.closeAll()

    expect(sockets.every((socket) => socket.closed)).toBe(true)
    expect(manager.sessions.every((session) => session.status === 'closed')).toBe(true)
  })
})
