<template>
  <div class="ai-sub-page">
    <div class="amp-sidebar">
      <nav class="amp-nav">
        <button
          v-for="item in menuItems"
          :key="item.key"
          class="amp-nav-item"
          :class="{ active: activeTab === item.key }"
          @click="activeTab = item.key"
        >
          <component :is="item.icon" :size="14" />
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </div>
    <div class="amp-content">
      <McpManager v-if="activeTab === 'mcp'" />
      <SkillManager v-else-if="activeTab === 'skills'" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Zap, Plug } from 'lucide-vue-next'
import McpManager from './McpManager.vue'
import SkillManager from './SkillManager.vue'

const props = defineProps({
  initialTab: { type: String, default: 'mcp' }
})

const menuItems = [
  { key: 'mcp', label: 'MCP', icon: Plug },
  { key: 'skills', label: 'Skills', icon: Zap }
]

const activeTab = ref(menuItems.some(m => m.key === props.initialTab) ? props.initialTab : 'mcp')

watch(() => props.initialTab, (val) => {
  if (val && menuItems.some(m => m.key === val)) activeTab.value = val
})
</script>

<style scoped>
.ai-sub-page {
  display: flex;
  height: 100%;
  background: var(--ou-bg-main);
  overflow: hidden;
  padding: 0;
}
.amp-sidebar {
  width: 200px;
  flex-shrink: 0;
  background: transparent;
  border-right: 1px solid var(--ou-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.amp-nav {
  display: flex;
  flex-direction: column;
  padding: 12px 24px 8px 24px;
  gap: 2px;
  flex: 1;
  overflow: auto;
}
.amp-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ou-text-muted);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s, color 0.12s;
  width: 100%;
}
.amp-nav-item:hover {
  background: var(--ou-bg-hover);
  color: var(--ou-text);
}
.amp-nav-item.active {
  background: color-mix(in srgb, var(--ou-primary) 22%, transparent);
  color: var(--ou-link);
}
.amp-content {
  flex: 1;
  min-width: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  padding: 0;
}
</style>
