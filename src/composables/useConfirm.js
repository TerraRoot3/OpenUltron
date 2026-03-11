import { ref } from 'vue'

// 全局确认弹框实例引用
const confirmDialogRef = ref(null)

// 注册确认弹框实例
export const registerConfirmDialog = (dialogRef) => {
  confirmDialogRef.value = dialogRef
}

// 显示确认弹框
export const useConfirm = () => {
  const confirm = async (options) => {
    // 支持简单字符串调用
    if (typeof options === 'string') {
      options = { message: options }
    }
    
    if (confirmDialogRef.value) {
      return await confirmDialogRef.value.show(options)
    }
    
    // 降级到原生 confirm
    console.warn('ConfirmDialog not registered, falling back to native confirm')
    return window.confirm(options.message || options.detail || '')
  }

  return { confirm }
}

// 便捷方法
export const showConfirm = async (options) => {
  const { confirm } = useConfirm()
  return confirm(options)
}
