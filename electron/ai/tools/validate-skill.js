// 工具：校验技能文件格式与安全性，供沙箱技能晋升前使用（不执行技能内容）
const fs = require('fs')
const path = require('path')

const DANGER_PATTERNS = [
  /\brm\s+-rf\s+/,
  /\beval\s*\(/,
  /\bchild_process\s*\.\s*exec/,
  /\brequire\s*\(\s*['\"]child_process['\"]\s*\)/,
  /\bprocess\.env\b.*\b(?:PASSWORD|SECRET|KEY)\b/i
]

function createValidateSkillTool(skillsDir) {
  return {
    definition: {
      description: [
        '校验技能文件（SKILL.md）格式与基本安全性，不执行技能内容。',
        '用于沙箱技能晋升前：先 install_skill(..., sandbox: true) 写入沙箱，再 validate_skill(skill_id, sandbox: true)，通过后再 promote_sandbox_skill。',
        '检查项：YAML frontmatter 存在、必填字段 name、无危险关键词（如 rm -rf、eval、child_process）。'
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          skill_id: {
            type: 'string',
            description: '技能 id（目录名）'
          },
          sandbox: {
            type: 'boolean',
            description: '为 true 时从 skills/_sandbox/<skill_id> 读取，否则从 skills/<skill_id> 读取'
          }
        },
        required: ['skill_id']
      }
    },

    execute(args) {
      const { skill_id, sandbox } = args
      if (!skill_id || !String(skill_id).trim()) {
        return { valid: false, message: '缺少 skill_id' }
      }
      const safeId = String(skill_id).trim().replace(/[^a-zA-Z0-9\u4e00-\u9fa5_\-]/g, '_')
      const skillDir = sandbox ? path.join(skillsDir, '_sandbox', safeId) : path.join(skillsDir, safeId)
      const skillFile = path.join(skillDir, 'SKILL.md')
      if (!fs.existsSync(skillFile)) {
        return {
          valid: false,
          message: sandbox
            ? `沙箱中未找到技能 "${safeId}"，请用 get_skill action=list_sandbox 确认`
            : `未找到技能 "${safeId}"`
        }
      }
      let raw
      try {
        raw = fs.readFileSync(skillFile, 'utf-8')
      } catch (e) {
        return { valid: false, message: `读取文件失败: ${e.message}` }
      }
      const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
      if (!fm) {
        return { valid: false, message: '缺少 YAML frontmatter（文件需以 --- 开头和结尾的元数据块）' }
      }
      const meta = {}
      for (const line of fm[1].split('\n')) {
        const idx = line.indexOf(':')
        if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
      }
      if (!meta.name || !String(meta.name).trim()) {
        return { valid: false, message: 'frontmatter 中缺少 name 字段' }
      }
      for (const re of DANGER_PATTERNS) {
        if (re.test(raw)) {
          return { valid: false, message: '技能内容含不允许的关键词或模式，请移除后重试' }
        }
      }
      return {
        valid: true,
        message: '格式与基本安全检查通过',
        output: { name: meta.name, description: meta.description || '' }
      }
    }
  }
}

module.exports = { createValidateSkillTool }
