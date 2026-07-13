export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error'

export type TerminalMessageType = 'system' | 'command' | 'output' | 'error'

export interface TerminalMessage {
  id: string
  type: TerminalMessageType
  content: string
  timestamp: number
}

export interface WebSocketClient {
  readonly readyState: number
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent<string>) => void) | null
  onerror: ((event: Event) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  send(data: string): void
  close(): void
}

export interface TerminalSession {
  id: string
  label: string
  endpoint: string
  status: ConnectionStatus
  messages: TerminalMessage[]
  history: string[]
  historyCursor: number
  pendingCommands: string[]
  socket?: WebSocketClient
}

export interface PluginSettings {
  endpoint: string
}

export interface ZToolsLaunchParam {
  code: string
  type: 'text' | 'regex' | 'over' | string
  payload: unknown
}

export interface DynamicFeature {
  code: string
  explain: string
  cmds: unknown[]
  [key: string]: unknown
}

export interface ZToolsStorage {
  getItem(key: string): unknown
  setItem(key: string, value: unknown): void
  removeItem?(key: string): void
}

export interface ZToolsAdapter {
  onPluginEnter(callback: (param: ZToolsLaunchParam) => void): void
  onPluginOut(callback: (isKill: boolean) => void): void
  getFeatures(codes?: string[]): DynamicFeature[]
  setFeature(feature: DynamicFeature): boolean
  showNotification?(body: string): void
  dbStorage: ZToolsStorage
}

