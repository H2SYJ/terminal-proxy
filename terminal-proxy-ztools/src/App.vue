<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import SessionTabs from './components/SessionTabs.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import TerminalConsole from './components/TerminalConsole.vue'
import TopBar from './components/TopBar.vue'
import { getZToolsAdapter } from './dev-ztools'
import { createSettingsStore } from './settings'
import { createTerminalManager } from './terminal-manager'
import { registerZToolsBridge, type FeedbackLevel } from './ztools-bridge'

const ztools = getZToolsAdapter()
const settingsStore = createSettingsStore(ztools.dbStorage)
const terminalManager = createTerminalManager({ getEndpoint: () => settingsStore.endpoint.value })
const settingsOpen = ref(false)
const drafts = reactive<Record<string, string>>({})
const feedback = ref<{ message: string; level: FeedbackLevel } | null>(null)
let feedbackTimer: number | undefined

const activeDraft = computed({
  get: () => (terminalManager.activeSessionId.value ? drafts[terminalManager.activeSessionId.value] ?? '' : ''),
  set: (value: string) => {
    if (terminalManager.activeSessionId.value) drafts[terminalManager.activeSessionId.value] = value
  },
})

function showFeedback(message: string, level: FeedbackLevel): void {
  feedback.value = { message, level }
  if (feedbackTimer) window.clearTimeout(feedbackTimer)
  feedbackTimer = window.setTimeout(() => {
    feedback.value = null
  }, 3500)
}

onMounted(() => registerZToolsBridge(ztools, terminalManager, showFeedback))

function createSession(): void {
  terminalManager.createSession()
}

function closeSession(sessionId: string): void {
  terminalManager.closeSession(sessionId)
  delete drafts[sessionId]
}

function sendCommand(): void {
  const sessionId = terminalManager.activeSessionId.value
  if (!sessionId) return
  if (terminalManager.sendCommand(activeDraft.value, sessionId)) activeDraft.value = ''
}

function navigateHistory(direction: 'up' | 'down'): void {
  const sessionId = terminalManager.activeSessionId.value
  if (!sessionId) return
  activeDraft.value = terminalManager.navigateHistory(direction, activeDraft.value, sessionId)
}

function saveEndpoint(endpoint: string): void {
  const result = settingsStore.saveEndpoint(endpoint)
  if (!result.ok) {
    showFeedback(result.message, 'error')
    return
  }
  settingsOpen.value = false
  showFeedback('连接地址已保存', 'success')
}

function resetEndpoint(): void {
  settingsStore.resetEndpoint()
  showFeedback('已恢复默认连接地址', 'success')
}
</script>

<template>
  <div class="app-shell">
    <TopBar
      :endpoint="settingsStore.endpoint.value"
      @new-session="createSession"
      @open-settings="settingsOpen = true"
    />
    <SessionTabs
      :sessions="terminalManager.sessions"
      :active-session-id="terminalManager.activeSessionId.value"
      @activate="terminalManager.activateSession"
      @close="closeSession"
    />
    <TerminalConsole
      v-model="activeDraft"
      :session="terminalManager.activeSession.value"
      @send="sendCommand"
      @history="navigateHistory"
      @reconnect="terminalManager.activeSession.value && terminalManager.reconnectSession(terminalManager.activeSession.value.id)"
      @new-session="createSession"
    />
    <Transition name="toast">
      <div v-if="feedback" class="toast" :class="feedback.level" role="status">
        {{ feedback.message }}
      </div>
    </Transition>
    <SettingsDialog
      :open="settingsOpen"
      :endpoint="settingsStore.endpoint.value"
      @close="settingsOpen = false"
      @save="saveEndpoint"
      @reset="resetEndpoint"
    />
  </div>
</template>
