<template>
  <div v-if="show" class="mention-palette">
    <div class="mp-list" ref="listRef">
      <template v-if="loading">
        <div class="mp-loading">
          <Loader :size="13" class="mp-spin" />
          <span>搜索文件...</span>
        </div>
      </template>
      <template v-else-if="items.length > 0">
        <div
          v-for="(item, idx) in items"
          :key="item.path"
          class="mp-item"
          :class="{ active: idx === activeIdx }"
          @mouseenter="activeIdx = idx"
          @mousedown.prevent="$emit('select', item)"
        >
          <span class="mp-icon" :class="item.type">
            <component :is="item.type === 'directory' ? Folder : fileIcon(item.name)" :size="12" />
          </span>
          <div class="mp-body">
            <span class="mp-name">{{ item.name }}</span>
            <span class="mp-path">{{ item.relativePath }}</span>
          </div>
        </div>
      </template>
      <div v-else-if="query" class="mp-empty">无匹配文件</div>
      <div v-else class="mp-empty">输入文件名搜索...</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { Folder, FileCode, FileText, File, Image, Loader } from 'lucide-vue-next'

const props = defineProps({
  show: Boolean,
  query: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['select', 'close'])

const activeIdx = ref(0)
const listRef = ref(null)

watch(() => [props.query, props.items], () => { activeIdx.value = 0 })

watch(activeIdx, (idx) => {
  nextTick(() => {
    const list = listRef.value
    if (!list) return
    const el = list.children[idx]
    if (el) el.scrollIntoView({ block: 'nearest' })
  })
})

const fileIcon = (name) => {
  if (!name) return File
  const ext = name.split('.').pop()?.toLowerCase()
  const code = ['js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'css', 'scss', 'html', 'json', 'yaml', 'yml', 'sh', 'md']
  const img = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico']
  if (code.includes(ext)) return FileCode
  if (img.includes(ext)) return Image
  return FileText
}

const onKeyDown = (e) => {
  if (!props.show) return false
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIdx.value = Math.min(activeIdx.value + 1, props.items.length - 1)
    return true
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIdx.value = Math.max(activeIdx.value - 1, 0)
    return true
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    const item = props.items[activeIdx.value]
    if (item) emit('select', item)
    return true
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
    return true
  }
  return false
}

defineExpose({ onKeyDown })
</script>

<style scoped>
.mention-palette {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  background: var(--ou-bg-sidebar);
  border: 1px solid var(--ou-border);
  border-radius: 8px;
  box-shadow: 0 8px 32px var(--ou-shadow);
  overflow: hidden;
  z-index: 200;
  max-height: 260px;
  display: flex;
  flex-direction: column;
}

.mp-list {
  overflow-y: auto;
  flex: 1;
}
.mp-list::-webkit-scrollbar { width: 4px; }
.mp-list::-webkit-scrollbar-thumb { background: var(--ou-border); border-radius: 2px; }

.mp-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  font-size: 12px;
  color: var(--ou-text-muted);
}
.mp-spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.mp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background 0.1s;
}
.mp-item.active { background: var(--ou-bg-hover); }
.mp-item:hover { background: var(--ou-bg-hover); }

.mp-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  flex-shrink: 0;
  color: var(--ou-text-muted);
}
.mp-icon.directory { color: var(--ou-warning); }
.mp-icon.file      { color: var(--ou-link); }

.mp-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.mp-name {
  font-size: 12px;
  color: var(--ou-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-path {
  font-size: 10px;
  color: var(--ou-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Monaco', 'Menlo', monospace;
}

.mp-empty {
  padding: 14px 12px;
  font-size: 12px;
  color: var(--ou-text-muted);
  text-align: center;
}
</style>
