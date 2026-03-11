<template>
  <div id="app">
    <HiddenWebviewForAI />
    <router-view />
    <ConfirmDialog ref="confirmDialogRef" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import HiddenWebviewForAI from './components/browser/HiddenWebviewForAI.vue'
import ConfirmDialog from './components/dialog/ConfirmDialog.vue'
import { registerConfirmDialog } from './composables/useConfirm.js'

const confirmDialogRef = ref(null)

onMounted(() => {
  registerConfirmDialog(confirmDialogRef.value)
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  background: var(--ou-bg-main, #1e1e1e);
  overflow: hidden;
}

#app {
  height: 100vh;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  background: var(--ou-bg-main, #1e1e1e);
}
</style>