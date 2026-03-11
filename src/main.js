import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import { initTheme } from './composables/useTheme.js'
import { installBrowserPolyfill } from './api/browserPolyfill.js'

installBrowserPolyfill()
initTheme()

// 在生产环境静默 console.log/debug
if (import.meta && import.meta.env && import.meta.env.PROD) {
  // eslint-disable-next-line no-console
  console.log = () => {}
  // eslint-disable-next-line no-console
  console.debug = () => {}
}

// Suppress Monaco Editor's internal "Canceled" promise rejections that occur
// during model disposal (normal cleanup behavior, not an actual error)
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.name === 'Canceled') {
    event.preventDefault()
  }
})

const app = createApp(App)
app.use(router)
app.mount('#app')
