// 工具：定时任务（Cron）的列出、创建、更新、删除与立即执行
const cronScheduler = require('../cron-scheduler')

const definition = {
  description: '管理定时任务（Cron）。可列出任务、新增、更新、删除任务，或立即执行。任务类型：heartbeat=执行 HEARTBEAT.md 巡检，command=在应用数据目录（默认 ~/.openultron）下执行 shell 命令。schedule 为 cron 五段式：分 时 日 月 周，如 "0 9 * * *" 表示每天 9:00。delete=直接删除任务；要让任务不执行可让用户到定时任务页关掉开关（enabled=false），或用 update 把 enabled 设为 false。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'add', 'update', 'delete', 'run_now'],
        description: 'list=列出所有任务；add=新增；update=更新；delete=删除；run_now=立即执行一次'
      },
      task_id: {
        type: 'string',
        description: '任务 ID，update/delete/run_now 时必填'
      },
      name: { type: 'string', description: '任务名称' },
      schedule: {
        type: 'string',
        description: 'Cron 表达式，五段：分 时 日 月 周，如 "0 9 * * *"'
      },
      type: {
        type: 'string',
        enum: ['heartbeat', 'command'],
        description: 'heartbeat=执行 HEARTBEAT 巡检，command=执行 shell 命令'
      },
      enabled: { type: 'boolean', description: '是否启用' },
      command: {
        type: 'string',
        description: 'type 为 command 时的 shell 命令（在应用数据目录 ~/.openultron 下执行）'
      }
    },
    required: ['action']
  }
}

async function execute(args) {
  const { action, task_id, name, schedule, type, enabled, command } = args || {}
  if (action === 'list') {
    const tasks = cronScheduler.listTasks()
    return { success: true, tasks, count: tasks.length }
  }
  if (action === 'add') {
    try {
      const task = cronScheduler.addTask({
        name: name || '未命名',
        schedule: schedule || '0 9 * * *',
        type: type || 'heartbeat',
        enabled: enabled !== false,
        command: command || ''
      })
      return { success: true, task, message: '已添加' }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }
  if (action === 'update') {
    if (!task_id) return { success: false, message: 'update 需要 task_id' }
    try {
      const updates = {}
      if (name !== undefined) updates.name = name
      if (schedule !== undefined) updates.schedule = schedule
      if (type !== undefined) updates.type = type
      if (enabled !== undefined) updates.enabled = enabled
      if (command !== undefined) updates.command = command
      const task = cronScheduler.updateTask(task_id, updates)
      if (!task) return { success: false, message: '任务不存在' }
      return { success: true, task, message: '已更新' }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }
  if (action === 'delete') {
    if (!task_id) return { success: false, message: 'delete 需要 task_id' }
    try {
      const ok = cronScheduler.removeTask(task_id)
      return { success: ok, message: ok ? '已删除' : '任务不存在' }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }
  if (action === 'run_now') {
    if (!task_id) return { success: false, message: 'run_now 需要 task_id' }
    const tasks = cronScheduler.listTasks()
    const task = tasks.find((t) => t.id === task_id)
    if (!task) return { success: false, message: '任务不存在' }
    try {
      const result = await cronScheduler.runTask(task)
      return result
    } catch (e) {
      return { success: false, message: e.message }
    }
  }
  return { success: false, message: 'action 需为 list / add / update / delete / run_now' }
}

module.exports = { definition, execute }
