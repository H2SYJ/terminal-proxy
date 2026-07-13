<script setup lang="ts">
import { ref, watch } from 'vue'
import { DEFAULT_ENDPOINT, isValidWebSocketEndpoint } from '../settings'

const props = defineProps<{
  open: boolean
  endpoint: string
}>()

const emit = defineEmits<{
  close: []
  save: [endpoint: string]
  reset: []
}>()

const draft = ref(props.endpoint)
const errorMessage = ref('')

watch(
  () => [props.open, props.endpoint],
  () => {
    draft.value = props.endpoint
    errorMessage.value = ''
  },
)

function submit(): void {
  const normalized = draft.value.trim()
  if (!isValidWebSocketEndpoint(normalized)) {
    errorMessage.value = '请输入有效的 ws:// 或 wss:// 地址'
    return
  }
  emit('save', normalized)
}

function reset(): void {
  draft.value = DEFAULT_ENDPOINT
  errorMessage.value = ''
  emit('reset')
}
</script>

<template>
  <div v-if="open" class="dialog-backdrop" @click.self="$emit('close')">
    <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="dialog-header">
        <div>
          <h2 id="settings-title">连接设置</h2>
          <p>地址变更只影响新建或重新连接的会话。</p>
        </div>
        <button class="icon-button" type="button" aria-label="关闭" @click="$emit('close')">×</button>
      </div>
      <form @submit.prevent="submit">
        <label for="endpoint">WebSocket 服务地址</label>
        <input
          id="endpoint"
          v-model="draft"
          type="url"
          autocomplete="off"
          spellcheck="false"
          placeholder="ws://127.0.0.1:2330/terminal"
          autofocus
        />
        <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
        <div class="dialog-actions">
          <button class="button secondary" type="button" @click="reset">恢复默认</button>
          <button class="button primary" type="submit">保存设置</button>
        </div>
      </form>
    </section>
  </div>
</template>

