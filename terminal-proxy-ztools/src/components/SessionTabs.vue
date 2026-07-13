<script setup lang="ts">
import type { TerminalSession } from '../types'

defineProps<{
  sessions: TerminalSession[]
  activeSessionId: string | null
}>()

defineEmits<{
  activate: [sessionId: string]
  close: [sessionId: string]
}>()

const statusLabels: Record<TerminalSession['status'], string> = {
  connecting: '连接中',
  open: '已连接',
  closed: '已关闭',
  error: '连接异常',
}
</script>

<template>
  <nav v-if="sessions.length" class="session-tabs" aria-label="终端会话">
    <button
      v-for="session in sessions"
      :key="session.id"
      type="button"
      class="session-tab"
      :class="{ active: session.id === activeSessionId }"
      @click="$emit('activate', session.id)"
    >
      <span class="status-dot" :class="session.status" :title="statusLabels[session.status]" />
      <span class="session-name">{{ session.label }}</span>
      <span
        class="close-tab"
        role="button"
        tabindex="0"
        aria-label="关闭会话"
        @click.stop="$emit('close', session.id)"
        @keydown.enter.stop="$emit('close', session.id)"
      >×</span>
    </button>
  </nav>
</template>

