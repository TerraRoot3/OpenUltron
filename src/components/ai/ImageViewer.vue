<template>
  <Teleport to="body">
    <div v-if="visible" class="image-viewer-overlay" @click.self="close" @wheel.prevent="onWheel">
      <div class="image-viewer-toolbar">
        <span class="zoom-label">{{ Math.round(scale * 100) }}%</span>
        <button class="viewer-btn" @click="zoomIn" title="放大">＋</button>
        <button class="viewer-btn" @click="zoomOut" title="缩小">－</button>
        <button class="viewer-btn" @click="resetZoom" title="重置">⊙</button>
        <button class="viewer-btn close-btn" @click="close" title="关闭">✕</button>
      </div>
      <div
        class="image-viewer-container"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
      >
        <img
          :src="src"
          :alt="alt"
          class="viewer-image"
          :style="imageStyle"
          draggable="false"
          @load="onImageLoad"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])

const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })

const imageStyle = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
  cursor: isDragging.value ? 'grabbing' : 'grab'
}))

const close = () => emit('close')

const clampScale = (s) => Math.min(Math.max(s, 0.1), 5)

const zoomIn = () => { scale.value = clampScale(scale.value * 1.25) }
const zoomOut = () => { scale.value = clampScale(scale.value / 1.25) }
const resetZoom = () => { scale.value = 1; translateX.value = 0; translateY.value = 0 }

const onWheel = (e) => {
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  scale.value = clampScale(scale.value * delta)
}

const onMouseDown = (e) => {
  if (e.button !== 0) return
  isDragging.value = true
  dragStart.value = { x: e.clientX - translateX.value, y: e.clientY - translateY.value }
}
const onMouseMove = (e) => {
  if (!isDragging.value) return
  translateX.value = e.clientX - dragStart.value.x
  translateY.value = e.clientY - dragStart.value.y
}
const onMouseUp = () => { isDragging.value = false }

const onImageLoad = () => { scale.value = 1; translateX.value = 0; translateY.value = 0 }

const onKeyDown = (e) => {
  if (!props.visible) return
  if (e.key === 'Escape') close()
  if (e.key === '+' || e.key === '=') zoomIn()
  if (e.key === '-') zoomOut()
  if (e.key === '0') resetZoom()
}

onMounted(() => document.addEventListener('keydown', onKeyDown))
onUnmounted(() => document.removeEventListener('keydown', onKeyDown))
</script>

<style scoped>
.image-viewer-overlay {
  position: fixed;
  inset: 0;
  background: var(--ou-overlay);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.image-viewer-toolbar {
  position: fixed;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--ou-bg-card);
  border: 1px solid var(--ou-border);
  border-radius: 8px;
  padding: 6px 10px;
  z-index: 10000;
}
.zoom-label {
  font-size: 12px;
  color: var(--ou-text-muted);
  min-width: 40px;
  text-align: center;
}
.viewer-btn {
  background: transparent;
  border: none;
  color: var(--ou-text);
  cursor: pointer;
  font-size: 16px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.15s, color 0.15s;
}
.viewer-btn:hover { background: var(--ou-bg-hover); color: var(--ou-text); }
.close-btn { color: var(--ou-error); }
.close-btn:hover { background: color-mix(in srgb, var(--ou-error) 18%, transparent); }
.image-viewer-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  user-select: none;
}
.viewer-image {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 4px;
  transition: transform 0.05s ease-out;
  pointer-events: none;
}
</style>
