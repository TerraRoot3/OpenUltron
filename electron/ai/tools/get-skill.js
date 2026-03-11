// 工具：获取技能内容
// AI 先用 action=list 查看有哪些技能，再用 action=get 获取具体技能内容后按其流程执行。
// 支持 action=list_remote 从配置的远程源拉取技能列表（可选 search 过滤）。
const https = require('https')
const http = require('http')
const { URL } = require('url')

function createGetSkillTool(getSkills, getSkillsSources, getSandboxSkills) {
  // getSkills: () => Skill[]  — 从调用方注入，返回最新缓存的技能列表
  // getSkillsSources: () => { name, url, enabled }[] — 可选，远程源配置
  // getSandboxSkills: () => Skill[] — 可选，沙箱内技能列表

  const definition = {
    description: '查询本应用技能列表或获取指定技能的完整 prompt。action=list 列出本地已安装技能；action=list_sandbox 列出沙箱内草稿技能；action=list_remote 从配置的远程技能源拉取可安装列表（可选 search 关键词过滤）；action=get 获取指定技能完整内容（sandbox=true 时从沙箱取）。安装远程技能用 install_skill 的 install_from_remote；沙箱技能验证通过后用 install_skill 的 promote_sandbox_skill 晋升。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'list_sandbox', 'list_remote', 'get'],
          description: 'list: 列出本地已安装技能；list_sandbox: 列出沙箱内草稿；list_remote: 从远程源拉取可安装列表；get: 获取指定技能完整 prompt'
        },
        skill_id: {
          type: 'string',
          description: 'action=get 时必填，技能的 id'
        },
        sandbox: {
          type: 'boolean',
          description: 'action=get 时可选，为 true 时从沙箱中按 skill_id 获取'
        },
        project_type: {
          type: 'string',
          enum: ['frontend', 'backend', 'app', 'all'],
          description: 'action=list 时可选，按项目类型过滤'
        },
        search: {
          type: 'string',
          description: 'action=list_remote 时可选，按名称或描述关键词过滤'
        }
      },
      required: ['action']
    }
  }

  async function fetchJson(url) {
    const u = new URL(url)
    const isHttps = u.protocol === 'https:'
    return new Promise((resolve, reject) => {
      const req = (isHttps ? https : http).get({
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: u.pathname + u.search,
        headers: { 'User-Agent': 'git-manager/1.0' }
      }, (res) => {
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
        let body = ''
        res.on('data', c => { body += c })
        res.on('end', () => {
          try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
        })
      })
      req.on('error', reject)
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('请求超时')) })
      req.end()
    })
  }

  async function execute(args) {
    const { action, skill_id, project_type, search, sandbox } = args
    const skills = typeof getSkills === 'function' ? getSkills() : []
    const sandboxSkills = typeof getSandboxSkills === 'function' ? getSandboxSkills() : []

    if (action === 'list_sandbox') {
      const summary = sandboxSkills.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description || '',
        category: s.category || 'custom',
        projectType: s.projectType || 'all',
        source: 'sandbox'
      }))
      return {
        success: true,
        skills: summary,
        note: '以上为沙箱内草稿技能。验证通过后用 install_skill 的 action=promote_sandbox_skill 晋升到正式目录。'
      }
    }

    if (action === 'list') {
      let list = skills
      if (project_type) {
        list = list.filter(s => !s.projectType || s.projectType === project_type || s.projectType === 'all')
      }
      const summary = list.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description || '',
        category: s.category || 'custom',
        projectType: s.projectType || 'all',
        type: s.type || 'markdown',
        source: s.source || 'app'
      }))
      return {
        success: true,
        skills: summary,
        note: '以上为本应用已安装技能。远程可安装技能用 action=list_remote；安装后用 install_skill 的 install_from_remote。'
      }
    }

    if (action === 'list_remote') {
      const sources = typeof getSkillsSources === 'function' ? getSkillsSources() : []
      const enabled = sources.filter(s => s.enabled !== false && s.url)
      if (enabled.length === 0) {
        return { success: true, skills: [], sources: [], note: '未配置远程技能源，请在 openultron.json 的 skills.sources 中配置 name、url、enabled。' }
      }
      const all = []
      const errors = []
      for (const src of enabled) {
        try {
          const data = await fetchJson(src.url)
          const list = Array.isArray(data.skills) ? data.skills : (Array.isArray(data) ? data : [])
          const baseUrl = src.url.replace(/\/[^/]*$/, '/')
          for (const s of list) {
            const id = s.id || s.name || ''
            const name = s.name || s.id || ''
            const desc = s.description || ''
            if (search && search.trim()) {
              const q = search.trim().toLowerCase()
              if (!name.toLowerCase().includes(q) && !desc.toLowerCase().includes(q)) continue
            }
            all.push({
              id,
              name,
              description: desc,
              category: s.category || 'remote',
              projectType: s.projectType || 'all',
              source: src.name || src.url,
              install_url: s.install_url || s.url || (id ? `${baseUrl}${id}/SKILL.md` : null)
            })
          }
        } catch (e) {
          errors.push(`${src.name || src.url}: ${e.message}`)
        }
      }
      return {
        success: true,
        skills: all,
        errors: errors.length ? errors : undefined,
        note: '以上为远程源可安装技能。使用 install_skill 的 action=install_from_remote，传入 source_name 与 skill_id 安装。'
      }
    }

    if (action === 'get') {
      if (!skill_id) return { success: false, error: '缺少 skill_id' }
      const fromSandbox = sandbox === true
      const list = fromSandbox ? sandboxSkills : skills
      const skill = list.find(s => s.id === skill_id)
      if (skill) {
        return {
          success: true,
          skill: {
            id: skill.id,
            name: skill.name,
            description: skill.description || '',
            type: skill.type || 'markdown',
            prompt: skill.prompt || '',
            source: fromSandbox ? 'sandbox' : 'app'
          }
        }
      }
      return {
        success: false,
        error: fromSandbox
          ? `沙箱中未找到 id 为 "${skill_id}" 的技能，请用 action=list_sandbox 确认`
          : `未找到 id 为 "${skill_id}" 的技能，请先用 action=list 确认可用技能列表`
      }
    }

    return { success: false, error: '未知 action，请使用 list、list_remote 或 get' }
  }

  return { definition, execute }
}

module.exports = { createGetSkillTool }
