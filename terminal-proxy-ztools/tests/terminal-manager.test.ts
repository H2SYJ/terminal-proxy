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

    const messageCount = session.messages.length
    sockets[0].message('连接成功')
    expect(session.messages).toHaveLength(messageCount)

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

  it('使用回车符原位更新进度，不为每次刷新新增输出行', () => {
    const { manager, sockets } = createFixture()
    const session = manager.createSession()

    sockets[0].message('下载进度 10%\r')
    const outputMessage = session.messages.find((message) => message.type === 'output')
    const observedContents: string[] = []
    const stopWatching = watch(
      () => outputMessage?.content,
      (content) => {
        if (content !== undefined) observedContents.push(content)
      },
      { flush: 'sync' },
    )
    sockets[0].message('下载进度 50%\r下载进度 100%\n')

    const outputMessages = session.messages.filter((message) => message.type === 'output')
    expect(outputMessages).toHaveLength(1)
    expect(outputMessages[0].content).toBe('下载进度 100%')
    expect(observedContents).toEqual(['下载进度 100%'])
    stopWatching()
  })

  it('支持跨 WebSocket 消息传输的 ANSI 清行和光标定位指令', () => {
    const { manager, sockets } = createFixture()
    const session = manager.createSession()

    sockets[0].message('处理中 10%')
    sockets[0].message('\x1b[')
    sockets[0].message('2K\x1b[1G处理中 80%\n完成\n')

    const outputMessages = session.messages.filter((message) => message.type === 'output')
    expect(outputMessages.map((message) => message.content)).toEqual(['处理中 80%', '完成'])
  })

  it('支持 ANSI 光标上下移动并原位刷新多行进度', () => {
    const { manager, sockets } = createFixture()
    const session = manager.createSession()

    sockets[0].message('任务 A   0%\n任务 B   0%\n任务 C   0%')
    const outputMessages = session.messages.filter((message) => message.type === 'output')
    const firstLineChanges: string[] = []
    const stopWatching = watch(
      () => outputMessages[0]?.content,
      (content) => {
        if (content !== undefined) firstLineChanges.push(content)
      },
      { flush: 'sync' },
    )

    sockets[0].message(
      '\x1b[2A\r\x1b[2K任务 A  50%\n' +
      '\r\x1b[2K任务 B  40%\n' +
      '\r\x1b[2K任务 C  30%',
    )

    expect(session.messages.filter((message) => message.type === 'output')).toHaveLength(3)
    expect(outputMessages.map((message) => message.content)).toEqual([
      '任务 A  50%',
      '任务 B  40%',
      '任务 C  30%',
    ])
    expect(firstLineChanges).toEqual(['任务 A  50%'])
    stopWatching()
  })

  it('保留普通多行输出，并将退出状态显示为系统消息', () => {
    const { manager, sockets } = createFixture()
    const session = manager.createSession()

    sockets[0].message('第一行\n第二行\n')
    sockets[0].message('!exit:0')

    expect(session.messages.filter((message) => message.type === 'output').map((message) => message.content))
      .toEqual(['第一行', '第二行'])
    expect(session.messages.at(-1)).toMatchObject({ type: 'system', content: '进程结束，退出码 0' })
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
