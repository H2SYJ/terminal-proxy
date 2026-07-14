<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  buildStructuredFeature,
  createEmptyFeatureDraft,
  featureToEditor,
  parseDynamicFeature,
  summarizeFeature,
  type DynamicFeatureStore,
  type StructuredFeatureDraft,
} from '../dynamic-features'
import { DEFAULT_ENDPOINT, isValidWebSocketEndpoint } from '../settings'
import type { DynamicFeature } from '../types'
import type { FeedbackLevel } from '../ztools-bridge'

const props = defineProps<{
  open: boolean
  endpoint: string
  featureStore: DynamicFeatureStore
}>()

const emit = defineEmits<{
  close: []
  save: [endpoint: string]
  reset: []
  notify: [message: string, level: FeedbackLevel]
}>()

type SettingsTab = 'connection' | 'features'
type FeaturePanelMode = 'list' | 'create' | 'edit'

const activeTab = ref<SettingsTab>('connection')
const endpointDraft = ref(props.endpoint)
const endpointError = ref('')
const featurePanelMode = ref<FeaturePanelMode>('list')
const editorMode = ref<'structured' | 'json'>('structured')
const structuredDraft = reactive<StructuredFeatureDraft>(createEmptyFeatureDraft())
const jsonDraft = ref('')
const editingCode = ref<string | null>(null)
const editingFeature = ref<DynamicFeature | undefined>()
const featureFormError = ref('')
const pendingDeleteCode = ref<string | null>(null)

const features = computed(() => props.featureStore.features.value)
const featureStoreError = computed(() => props.featureStore.errorMessage.value)

watch(
  () => [props.open, props.endpoint] as const,
  ([open]) => {
    endpointDraft.value = props.endpoint
    endpointError.value = ''
    if (!open) return
    activeTab.value = 'connection'
    featurePanelMode.value = 'list'
    pendingDeleteCode.value = null
    props.featureStore.refresh()
  },
)

watch(activeTab, (tab) => {
  if (tab === 'features') props.featureStore.refresh()
})

function submitEndpoint(): void {
  const normalized = endpointDraft.value.trim()
  if (!isValidWebSocketEndpoint(normalized)) {
    endpointError.value = '请输入有效的 ws:// 或 wss:// 地址'
    return
  }
  emit('save', normalized)
}

function resetEndpoint(): void {
  endpointDraft.value = DEFAULT_ENDPOINT
  endpointError.value = ''
  emit('reset')
}

function resetFeatureEditor(): void {
  Object.assign(structuredDraft, createEmptyFeatureDraft())
  jsonDraft.value = ''
  editingCode.value = null
  editingFeature.value = undefined
  editorMode.value = 'structured'
  featureFormError.value = ''
}

function openCreateFeature(): void {
  resetFeatureEditor()
  featurePanelMode.value = 'create'
}

function openEditFeature(feature: DynamicFeature): void {
  resetFeatureEditor()
  editingCode.value = feature.code
  editingFeature.value = feature
  const editor = featureToEditor(feature)
  editorMode.value = editor.mode
  if (editor.mode === 'structured') Object.assign(structuredDraft, editor.draft)
  else jsonDraft.value = editor.json
  featurePanelMode.value = 'edit'
}

function closeFeatureEditor(): void {
  resetFeatureEditor()
  featurePanelMode.value = 'list'
}

function saveFeature(): void {
  featureFormError.value = ''
  try {
    const feature =
      editorMode.value === 'structured'
        ? buildStructuredFeature(structuredDraft, editingFeature.value)
        : parseDynamicFeature(jsonDraft.value)
    const result = editingCode.value
      ? props.featureStore.update(editingCode.value, feature)
      : props.featureStore.create(feature)
    if (!result.ok) {
      featureFormError.value = result.message
      return
    }
    emit('notify', editingCode.value ? '快捷指令已更新' : '快捷指令已添加', 'success')
    closeFeatureEditor()
  } catch (error) {
    featureFormError.value = error instanceof Error ? error.message : String(error)
  }
}

function refreshFeatures(): void {
  const result = props.featureStore.refresh()
  if (!result.ok) emit('notify', result.message, 'error')
}

function requestDelete(code: string): void {
  pendingDeleteCode.value = code
}

function cancelDelete(): void {
  pendingDeleteCode.value = null
}

function confirmDelete(code: string): void {
  const result = props.featureStore.remove(code)
  if (!result.ok) {
    emit('notify', result.message, 'error')
    return
  }
  pendingDeleteCode.value = null
  emit('notify', '快捷指令已删除', 'success')
}
</script>

<template>
  <div v-if="open" class="dialog-backdrop" @click.self="$emit('close')">
    <section class="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="dialog-header settings-header">
        <div>
          <h2 id="settings-title">设置</h2>
          <p>管理终端连接和动态快捷指令。</p>
        </div>
        <button class="icon-button" type="button" aria-label="关闭" @click="$emit('close')">×</button>
      </div>

      <div class="settings-tabs" role="tablist" aria-label="设置分类">
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'connection'"
          :class="{ active: activeTab === 'connection' }"
          @click="activeTab = 'connection'"
        >连接设置</button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'features'"
          :class="{ active: activeTab === 'features' }"
          @click="activeTab = 'features'"
        >快捷指令</button>
      </div>

      <div class="settings-content">
        <form v-if="activeTab === 'connection'" class="connection-settings" @submit.prevent="submitEndpoint">
          <div class="section-heading">
            <div>
              <h3>WebSocket 服务</h3>
              <p>地址变更只影响新建或重新连接的会话。</p>
            </div>
          </div>
          <label for="endpoint">WebSocket 服务地址</label>
          <input
            id="endpoint"
            v-model="endpointDraft"
            type="url"
            autocomplete="off"
            spellcheck="false"
            placeholder="ws://127.0.0.1:2330/terminal"
          />
          <p v-if="endpointError" class="form-error">{{ endpointError }}</p>
          <div class="dialog-actions">
            <button class="button secondary" type="button" @click="resetEndpoint">恢复默认</button>
            <button class="button primary" type="submit">保存设置</button>
          </div>
        </form>

        <section v-else class="feature-settings">
          <template v-if="featurePanelMode === 'list'">
            <div class="section-heading feature-toolbar">
              <div>
                <h3>动态快捷指令</h3>
                <p>管理通过 ZTools 动态 Feature API 保存的指令。</p>
              </div>
              <div class="toolbar-actions">
                <button class="button secondary" type="button" @click="refreshFeatures">刷新</button>
                <button class="button primary" type="button" @click="openCreateFeature">添加指令</button>
              </div>
            </div>

            <p v-if="featureStoreError" class="feature-alert error">{{ featureStoreError }}</p>
            <div v-else-if="features.length === 0" class="feature-empty">
              <span>&gt;_</span>
              <p>还没有动态快捷指令</p>
              <small>点击“添加指令”创建第一个快捷指令。</small>
            </div>
            <div v-else class="feature-list">
              <article v-for="feature in features" :key="feature.code" class="feature-card">
                <div class="feature-card-main">
                  <div class="feature-title-row">
                    <strong>{{ feature.code }}</strong>
                    <code>{{ feature.explain }}</code>
                  </div>
                  <p>{{ summarizeFeature(feature) }}</p>
                </div>
                <div v-if="pendingDeleteCode === feature.code" class="delete-confirmation">
                  <span>确认删除？</span>
                  <button class="small-button danger" type="button" @click="confirmDelete(feature.code)">确认</button>
                  <button class="small-button" type="button" @click="cancelDelete">取消</button>
                </div>
                <div v-else class="feature-actions">
                  <button class="small-button" type="button" @click="openEditFeature(feature)">编辑</button>
                  <button class="small-button danger-text" type="button" @click="requestDelete(feature.code)">删除</button>
                </div>
              </article>
            </div>
          </template>

          <form v-else class="feature-editor" @submit.prevent="saveFeature">
            <div class="section-heading">
              <div>
                <h3>{{ featurePanelMode === 'create' ? '添加快捷指令' : '编辑快捷指令' }}</h3>
                <p v-if="editorMode === 'structured'">配置关键词和正则触发规则。</p>
                <p v-else>该指令包含高级规则，使用 JSON 兼容模式编辑以避免字段丢失。</p>
              </div>
              <button class="text-button" type="button" @click="closeFeatureEditor">返回列表</button>
            </div>

            <template v-if="editorMode === 'structured'">
              <div class="form-grid two-columns">
                <div class="form-field">
                  <label for="feature-code">指令标识</label>
                  <input
                    id="feature-code"
                    v-model="structuredDraft.code"
                    type="text"
                    autocomplete="off"
                    :disabled="featurePanelMode === 'edit'"
                    placeholder="download-url"
                  />
                  <small>用于 ZTools 内部识别，创建后不可修改。</small>
                </div>
                <div class="form-field">
                  <label for="feature-command">执行命令</label>
                  <input
                    id="feature-command"
                    v-model="structuredDraft.explain"
                    type="text"
                    autocomplete="off"
                    placeholder="sh download.sh"
                  />
                  <small>正则触发时，用户输入会追加到命令末尾。</small>
                </div>
              </div>

              <div class="form-field">
                <label for="feature-keywords">触发关键词</label>
                <textarea
                  id="feature-keywords"
                  v-model="structuredDraft.keywordsText"
                  rows="3"
                  placeholder="download&#10;下载脚本"
                />
                <small>每行一个关键词；留空表示只使用正则触发。</small>
              </div>

              <label class="check-row">
                <input v-model="structuredDraft.regexEnabled" type="checkbox" />
                <span>启用正则匹配</span>
              </label>

              <div v-if="structuredDraft.regexEnabled" class="regex-fields">
                <div class="form-grid two-columns">
                  <div class="form-field">
                    <label for="regex-label">搜索结果名称</label>
                    <input id="regex-label" v-model="structuredDraft.regexLabel" type="text" placeholder="下载 HTTPS 网址" />
                  </div>
                  <div class="form-field">
                    <label for="regex-match">正则表达式</label>
                    <input
                      id="regex-match"
                      v-model="structuredDraft.regexMatch"
                      type="text"
                      spellcheck="false"
                      placeholder="/^https:\/\/[^\s]+$/i"
                    />
                  </div>
                </div>
                <div class="form-grid two-columns compact-fields">
                  <div class="form-field">
                    <label for="regex-min">最小长度</label>
                    <input id="regex-min" v-model="structuredDraft.minLength" type="number" min="1" step="1" />
                  </div>
                  <div class="form-field">
                    <label for="regex-max">最大长度</label>
                    <input id="regex-max" v-model="structuredDraft.maxLength" type="number" min="1" step="1" />
                  </div>
                </div>
              </div>
            </template>

            <div v-else class="form-field">
              <label for="feature-json">Feature JSON</label>
              <textarea id="feature-json" v-model="jsonDraft" class="json-editor" rows="15" spellcheck="false" />
              <small>编辑时不能修改原有的 code。</small>
            </div>

            <p v-if="featureFormError" class="feature-alert error">{{ featureFormError }}</p>
            <div class="dialog-actions editor-actions">
              <button class="button secondary" type="button" @click="closeFeatureEditor">取消</button>
              <button class="button primary" type="submit">
                {{ featurePanelMode === 'create' ? '添加指令' : '保存修改' }}
              </button>
            </div>
          </form>
        </section>
      </div>
    </section>
  </div>
</template>
