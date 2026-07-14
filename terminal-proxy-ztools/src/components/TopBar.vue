<script setup lang="ts">
defineProps<{
  endpoint: string
}>()

defineEmits<{
  newSession: []
  openSettings: []
}>()
</script>

<template>
  <header class="top-bar">
    <div class="brand">
      <img src="/logo.jpg" alt="终端代理" />
      <div>
        <h1>终端代理</h1>
        <p :title="endpoint">{{ endpoint }}</p>
      </div>
    </div>
    <div class="top-actions">
      <button class="button secondary" type="button" @click="$emit('openSettings')">设置</button>
      <button class="button primary" type="button" @click="$emit('newSession')">新建会话</button>
    </div>
  </header>
</template>
