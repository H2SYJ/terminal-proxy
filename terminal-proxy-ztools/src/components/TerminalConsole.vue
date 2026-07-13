<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { TerminalSession } from '../types'

const props = defineProps<{
  session: TerminalSession | null
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: []
  history: [direction: 'up' | 'down']
  reconnect: []
  newSession: []
}>()

const outputElement = ref<HTMLElement | null>(null)

watch(
  () => [props.session?.id, props.session?.messages.length],
  async () => {
    await nextTick()
    const element = outputElement.value
    if (element) element.scrollTop = element.scrollHeight
  },
)

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault()
    emit('send')
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    emit('history', 'up')
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    emit('history', 'down')
  }
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(timestamp)
}
</script>

<template>
  <main v-if="session" class="terminal-shell">
    <div class="terminal-meta">
      <span>{{ session.endpoint }}</span>
      <button
        v-if="session.status === 'closed' || session.status === 'error'"
        class="text-button"
        type="button"
        @click="$emit('reconnect')"
      >重新连接</button>
    </div>
    <section ref="outputElement" class="terminal-output" aria-live="polite">
      <div
        v-for="message in session.messages"
        :key="message.id"
        class="terminal-line"
        :class="`line-${message.type}`"
      >
        <time>{{ formatTime(message.timestamp) }}</time>
        <span class="line-prefix">{{ message.type === 'command' ? '$' : '›' }}</span>
        <span class="message-content">{{ message.content }}</span>
      </div>
    </section>
    <div class="command-bar">
      <span class="prompt">$</span>
      <input
        :value="modelValue"
        type="text"
        autocomplete="off"
        spellcheck="false"
        aria-label="终端命令"
        placeholder="输入命令，按 Enter 发送"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @keydown="handleKeydown"
      />
      <button
        type="button"
        class="send-button"
        :disabled="!modelValue.trim()"
        @click="$emit('send')"
      >发送</button>
    </div>
  </main>
  <main v-else class="empty-state">
    <div class="empty-icon">&gt;_</div>
    <h2>还没有终端会话</h2>
    <p>创建会话后即可连接终端代理服务并执行命令。</p>
    <button class="button primary" type="button" @click="$emit('newSession')">新建会话</button>
  </main>
</template>

