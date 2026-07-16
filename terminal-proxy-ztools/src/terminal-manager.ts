import { computed, markRaw, reactive, ref } from 'vue'
import type {
  TerminalMessage,
  TerminalMessageType,
  TerminalSession,
  WebSocketClient,
} from './types'

const CONNECTING = 0
const OPEN = 1
const MAX_OUTPUT_ROWS = 1000

export type WebSocketFactory = (endpoint: string) => WebSocketClient

export interface TerminalManagerOptions {
  getEndpoint: () => string
  webSocketFactory?: WebSocketFactory
  idFactory?: () => string
  now?: () => number
}

interface OutputLine {
  message: TerminalMessage
  content: string
  cursor: number
}

interface OutputState {
  lines: OutputLine[]
  row: number
  controlSequence: string
  savedRow?: number
  savedCursor?: number
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
      state = { lines: [], row: 0, controlSequence: '' }
      outputStates.set(session, state)
    }
    return state
  }

  function ensureOutputLine(session: TerminalSession, state: OutputState): OutputLine {
    while (state.lines.length <= state.row) {
      state.lines.push({
        message: addMessage(session, 'output', ''),
        content: '',
        cursor: 0,
      })
    }
    return state.lines[state.row]
  }

  function syncOutputLines(state: OutputState): void {
    state.lines.forEach((line) => {
      if (line.message.content !== line.content) line.message.content = line.content
    })
  }

  function moveOutputRow(state: OutputState, offset: number): void {
    state.row = Math.max(0, Math.min(MAX_OUTPUT_ROWS - 1, state.row + offset))
  }

  function writeOutputText(session: TerminalSession, state: OutputState, text: string): void {
    const line = ensureOutputLine(session, state)
    const before = line.content.slice(0, line.cursor)
    const after = line.content.slice(line.cursor + text.length)
    line.content = `${before}${text}${after}`
    line.cursor += text.length
  }

  function applyCsiSequence(session: TerminalSession, state: OutputState, sequence: string): void {
    const match = /^\x1b\[([?\d;]*)([@-~])$/.exec(sequence)
    if (!match) return
    const parameters = match[1].replace(/^\?/, '').split(';')
    const first = Number(parameters[0] || 0)
    const line = () => ensureOutputLine(session, state)

    switch (match[2]) {
      case 'A':
        moveOutputRow(state, -(first || 1))
        break
      case 'B':
        moveOutputRow(state, first || 1)
        break
      case 'K':
        if (first === 1) {
          line().content = `${' '.repeat(line().cursor)}${line().content.slice(line().cursor)}`
        } else if (first === 2) {
          line().content = ''
          line().cursor = 0
        } else {
          line().content = line().content.slice(0, line().cursor)
        }
        break
      case 'G':
        line().cursor = Math.max(0, (first || 1) - 1)
        break
      case 'C':
        line().cursor = Math.min(line().content.length, line().cursor + (first || 1))
        break
      case 'D':
        line().cursor = Math.max(0, line().cursor - (first || 1))
        break
      case 'E':
        moveOutputRow(state, first || 1)
        line().cursor = 0
        break
      case 'F':
        moveOutputRow(state, -(first || 1))
        line().cursor = 0
        break
      case 'H':
      case 'f': {
        const targetRow = Math.max(0, Number(parameters[0] || 1) - 1)
        state.row = Math.min(MAX_OUTPUT_ROWS - 1, targetRow)
        line().cursor = Math.max(0, Number(parameters[1] || 1) - 1)
        break
      }
      case 'J':
        if (first === 2 || first === 3) {
          state.lines.forEach((outputLine) => {
            outputLine.content = ''
            outputLine.cursor = 0
          })
          state.row = 0
        }
        break
      case 's':
        state.savedRow = state.row
        state.savedCursor = line().cursor
        break
      case 'u':
        state.row = Math.min(MAX_OUTPUT_ROWS - 1, state.savedRow ?? state.row)
        line().cursor = state.savedCursor ?? line().cursor
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
          applyCsiSequence(session, state, state.controlSequence)
          state.controlSequence = ''
        } else if (state.controlSequence.length > 256) {
          state.controlSequence = ''
        }
        continue
      }

      if (character === '\x1b') {
        state.controlSequence = character
      } else if (character === '\r') {
        ensureOutputLine(session, state).cursor = 0
      } else if (character === '\n') {
        ensureOutputLine(session, state)
        moveOutputRow(state, 1)
        if (state.row < state.lines.length) state.lines[state.row].cursor = 0
      } else if (character === '\b') {
        const line = ensureOutputLine(session, state)
        line.cursor = Math.max(0, line.cursor - 1)
      } else if (character === '\t') {
        const line = ensureOutputLine(session, state)
        writeOutputText(session, state, ' '.repeat(8 - (line.cursor % 8)))
      } else if (character >= ' ') {
        writeOutputText(session, state, character)
      }
    }

    syncOutputLines(state)
  }

  function finishPendingOutput(session: TerminalSession): void {
    const state = outputStates.get(session)
    if (!state) return
    syncOutputLines(state)
    outputStates.delete(session)
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
      finishPendingOutput(session)
      session.status = 'error'
      addMessage(session, 'error', '连接发生异常，请检查服务地址和网络状态')
    }
    socket.onclose = () => {
      if (session.socket !== socket) return
      finishPendingOutput(session)
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
