// 内置技能定义（当前无默认内置技能；已移除的 id 会在启动时从 skills 目录删除）

const BUILTIN_SKILLS = []

/** 已移除的内置技能 id（启动时删除其目录，不再作为内置展示） */
const REMOVED_BUILTIN_SKILL_IDS = [
  'agent-browser',
  'builtin-init-playbook',
  'builtin-analyze-project',
  'builtin-git-status',
  'builtin-deploy-test',
  'builtin-code-review',
  'builtin-frontend-deploy',
  'builtin-backend-deploy',
  'builtin-app-build'
]

module.exports = { BUILTIN_SKILLS, REMOVED_BUILTIN_SKILL_IDS }
