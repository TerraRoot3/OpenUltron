<template>
  <div class="skills-view">
    <AISkillsPage :initial-tab="initialTab" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AISkillsPage from '../components/ai/AISkillsPage.vue'

const route = useRoute()
const initialTab = computed(() => route.query.tab === 'skills' ? 'skills' : 'mcp')
</script>

<style scoped>
.skills-view {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
</style>
