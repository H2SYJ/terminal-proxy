import { computed, markRaw, reactive, ref } from 'vue'
import type {
  TerminalMessage,
  TerminalMessageType,
  TerminalSession,
  WebSocketClient,
} from './types'

const CONNECTING = 0
const OPEN = 1

export type WebSocketFactory = (endpoint: string) => WebSocketClient

export interface TerminalManagerOptions {
  getEndpoint: () => string
  webSocketFactory?: WebSocketFactory
  idFactory?: () => string
  now?: () => number
}

interface OutputState {
  message?: TerminalMessage
  content: string
  cursor: number
  controlSequence: string
}

function defaultIdFactory(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function createTerminalManager(options: TerminalManagerOptions) {
  const webSocketFactory = options.webSocketFactory ?? ((endpoint) => new WebSocket(endpoint))
  const idFactory = options.idFactory ?? defaultIdFactory
  const now = options.now ?? Date.now
  const sessions = reactive<TerminalSession[]>([])
  const outputStates = new WeakMap<TerminalSession, OutputState>()
  const activeSessionId = ref<string | null>(null)
  const activeSession = computed(
    () => sessions.find((session) => session.id === activeSessionId.value) ?? null,
  )

  function addMessage(
    session: TerminalSession,
    type: TerminalMessageType,
    content: string,
  ): TerminalMessage {
    // 输出进度会在不增加数组元素的情况下修改 content，因此消息对象自身也必须是响应式的。
    const message = reactive<TerminalMessage>({
      id: idFactory(),
      type,
      content,
      timestamp: now(),
    })
    session.messages.push(message)
    return message
  }

  function getOutputState(session: TerminalSession): OutputState {
    let state = outputStates.get(session)
    if (!state) {
      state = { content: '', cursor: 0, controlSequence: '' }
      outputStates.set(session, state)
    }
    return state
  }

  function ensureOutputMessage(session: TerminalSession, state: OutputState): TerminalMessage {
    if (!state.message) state.message = addMessage(session, 'output', state.content)
    return state.message
  }

  function updateOutputMessage(session: TerminalSession, state: OutputState): void {
    ensureOutputMessage(session, state).content = state.content
  }

  function finishOutputLine(session: TerminalSession, state: OutputState): void {
    updateOutputMessage(session, state)
    state.message = undefined
    state.content = ''
    state.cursor = 0
  }

  function writeOutputText(state: OutputState, text: string): void {
    const before = state.content.slice(0, state.cursor)
    const after = state.content.slice(state.cursor + text.length)
    state.content = `${before}${text}${after}`
    state.cursor += text.length
  }

  function applyCsiSequence(state: OutputState, sequence: string): void {
    const match = /^\x1b\[([?\d;]*)([@-~])$/.exec(sequence)
    if (!match) return
    const parameters = match[1].replace(/^\?/, '').split(';')
    const first = Number(parameters[0] || 0)

    switch (match[2]) {
      case 'K':
        if (first === 1) {
          state.content = `${' '.repeat(state.cursor)}${state.content.slice(state.cursor)}`
        } else if (first === 2) {
          state.content = ''
          state.cursor = 0
        } else {
          state.content = state.content.slice(0, state.cursor)
        }
        break
      case 'G':
        state.cursor = Math.max(0, (first || 1) - 1)
        break
      case 'C':
        state.cursor = Math.min(state.content.length, state.cursor + (first || 1))
        break
      case 'D':
        state.cursor = Math.max(0, state.cursor - (first || 1))
        break
    }
  }

  function isControlSequenceComplete(sequence: string): boolean {
    if (sequence.startsWith('\x1b]')) {
      return sequence.endsWith('\x07') || sequence.endsWith('\x1b\\')
    }
    if (sequence.startsWith('\x1b[')) {
      return sequence.length > 2 && /[@-~]$/.test(sequence)
    }
    return sequence.length >= 2
  }

  function appendOutput(session: TerminalSession, chunk: string): void {
    const state = getOutputState(session)

    for (const character of chunk) {
      if (state.controlSequence) {
        state.controlSequence += character
        if (isControlSequenceComplete(state.controlSequence)) {
          applyCsiSequence(state, state.controlSequence)
          state.controlSequence = ''
        } else if (state.controlSequence.length > 256) {
          state.controlSequence = ''
        }
        continue
      }

      if (character === '\x1b') {
        state.controlSequence = character
      } else if (character === '\r') {
        state.cursor = 0
      } else if (character === '\n') {
        finishOutputLine(session, state)
      } else if (character === '\b') {
        state.cursor = Math.max(0, state.cursor - 1)
      } else if (character === '\t') {
        writeOutputText(state, ' '.repeat(8 - (state.cursor % 8)))
      } else if (character >= ' ') {
        writeOutputText(state, character)
      }
    }

    if (state.message || state.content) updateOutputMessage(session, state)
  }

  function finishPendingOutput(session: TerminalSession): void {
    const state = outputStates.get(session)
    if (!state) return
    if (state.message || state.content) finishOutputLine(session, state)
    state.controlSequence = ''
  }

  function findSession(sessionId?: string): TerminalSession | undefined {
    const id = sessionId ?? activeSessionId.value
    return sessions.find((session) => session.id === id)
  }

  function detachAndCloseSocket(session: TerminalSession): void {
    const socket = session.socket
    if (!socket) return
    socket.onopen = null
    socket.onmessage = null
    socket.onerror = null
    socket.onclose = null
    if (socket.readyState === CONNECTING || socket.readyState === OPEN) {
      socket.close()
    }
    session.socket = undefined
  }

  function transmit(session: TerminalSession, command: string): boolean {
    const socket = session.socket
    if (!socket || socket.readyState !== OPEN) return false
    try {
      finishPendingOutput(session)
      socket.send(command)
      addMessage(session, 'command', command)
      return true
    } catch (error) {
      session.status = 'error'
      addMessage(session, 'error', `发送失败：${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  function connectSession(session: TerminalSession): void {
    finishPendingOutput(session)
    detachAndCloseSocket(session)
    session.endpoint = options.getEndpoint()
    session.status = 'connecting'
    addMessage(session, 'system', `正在连接 ${session.endpoint}`)

    let socket: WebSocketClient
    try {
      socket = markRaw(webSocketFactory(session.endpoint))
    } catch (error) {
      session.status = 'error'
      addMessage(session, 'error', `创建连接失败：${error instanceof Error ? error.message : String(error)}`)
      return
    }

    session.socket = socket
    socket.onopen = () => {
      if (session.socket !== socket) return
      session.status = 'open'
      addMessage(session, 'system', '连接成功')
      const pending = session.pendingCommands.splice(0)
      pending.forEach((command) => transmit(session, command))
    }
    socket.onmessage = (event) => {
      if (session.socket !== socket) return
      const content = String(event.data)
      if (content === '连接成功') {
        // WebSocket 的 onopen 已记录连接状态，忽略服务端的兼容性问候消息。
        return
      } else if (/^!exit:-?\d+$/.test(content)) {
        finishPendingOutput(session)
        addMessage(session, 'system', `进程结束，退出码 ${content.slice(6)}`)
      } else {
        appendOutput(session, content)
      }
    }
    socket.onerror = () => {
      if (session.socket !== socket) return
      session.status = 'error'
      addMessage(session, 'error', '连接发生异常，请检查服务地址和网络状态')
    }
    socket.onclose = () => {
      if (session.socket !== socket) return
      if (session.status !== 'error') session.status = 'closed'
      addMessage(session, 'system', '连接已关闭')
    }
  }

  function createSession(initialCommand?: string): TerminalSession {
    const id = idFactory()
    const session = reactive<TerminalSession>({
      id,
      label: `会话 ${id.slice(-6)}`,
      endpoint: options.getEndpoint(),
      status: 'connecting',
      messages: [],
      history: [],
      historyCursor: 0,
      pendingCommands: [],
    })
    if (initialCommand?.trim()) {
      const command = initialCommand.trim()
      session.pendingCommands.push(command)
      session.history.push(command)
      session.historyCursor = session.history.length
    }
    sessions.push(session)
    activeSessionId.value = id
    connectSession(session)
    return session
  }

  function sendCommand(command: string, sessionId?: string): boolean {
    const normalized = command.trim()
    const session = findSession(sessionId)
    if (!normalized || !session) return false

    session.history.push(normalized)
    session.historyCursor = session.history.length
    if (session.status === 'connecting' && session.socket?.readyState === CONNECTING) {
      session.pendingCommands.push(normalized)
      addMessage(session, 'system', '连接建立后将自动发送该命令')
      return true
    }
    if (session.status !== 'open') {
      addMessage(session, 'error', '当前会话未连接，请先重新连接')
      return false
    }
    return transmit(session, normalized)
  }

  function navigateHistory(
    direction: 'up' | 'down',
    currentValue: string,
    sessionId?: string,
  ): string {
    const session = findSession(sessionId)
    if (!session || session.history.length === 0) return currentValue
    if (direction === 'up') {
      session.historyCursor = Math.max(0, session.historyCursor - 1)
      return session.history[session.historyCursor] ?? currentValue
    }
    session.historyCursor = Math.min(session.history.length, session.historyCursor + 1)
    return session.historyCursor === session.history.length
      ? ''
      : (session.history[session.historyCursor] ?? '')
  }

  function activateSession(sessionId: string): void {
    if (findSession(sessionId)) activeSessionId.value = sessionId
  }

  function reconnectSession(sessionId: string): void {
    const session = findSession(sessionId)
    if (!session) return
    session.pendingCommands.splice(0)
    connectSession(session)
  }

  function closeSession(sessionId: string): void {
    const index = sessions.findIndex((session) => session.id === sessionId)
    if (index < 0) return
    detachAndCloseSocket(sessions[index])
    outputStates.delete(sessions[index])
    sessions.splice(index, 1)
    if (activeSessionId.value === sessionId) {
      activeSessionId.value = sessions[Math.min(index, sessions.length - 1)]?.id ?? null
    }
  }

  function closeAll(): void {
    sessions.forEach((session) => {
      detachAndCloseSocket(session)
      session.status = 'closed'
    })
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    createSession,
    sendCommand,
    navigateHistory,
    activateSession,
    reconnectSession,
    closeSession,
    closeAll,
  }
}

export type TerminalManager = ReturnType<typeof createTerminalManager>
