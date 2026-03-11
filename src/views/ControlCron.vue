<template>
  <div class="cron-view">
    <CronTasksPage />
  </div>
</template>

<script setup>
import CronTasksPage from '../components/ai/CronTasksPage.vue'
</script>

<style scoped>
.cron-view {
  height: 100%;
  min-height: 0;
  overflow: auto;
}
</style>
