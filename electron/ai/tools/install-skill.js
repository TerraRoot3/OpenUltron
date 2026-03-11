// AI 工具：管理自己的技能（<appRoot>/skills/，默认 ~/.openultron/skills/）
// 支持：从 GitHub 安装、从远程源安装、自己创建、更新、删除、列出
const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const { URL } = require('url')

function fetchJson(url) {
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
      res.on('end', () => { try { resolve(JSON.parse(body)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('请求超时')) })
    req.end()
  })
}

function fetchText(url) {
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
      res.on('end', () => resolve(body))
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('请求超时')) })
    req.end()
  })
}

function createInstallSkillTool(skillsDir, onChanged, getSkillsSources) {
  // onChanged: 可选回调，技能变更后调用（用于刷新缓存）
  // getSkillsSources: () => { name, url, enabled }[]，可选，用于 install_from_remote

  return {
    definition: {
      description: [
        '管理 AI 自己的技能库（默认 ~/.openultron/skills/）。',
        '支持：',
        '  - list: 列出已安装的技能文件（不含沙箱）',
        '  - create/write: 直接创建或更新技能（AI 自己编写内容）；sandbox=true 时写入沙箱，验证通过后用 promote_sandbox_skill 晋升',
        '  - install_from_github: 从 GitHub URL 安装技能文件',
        '  - install_from_remote: 从配置的远程技能源安装（需先 get_skill action=list_remote 得到 source 与 skill_id）',
        '  - update: 更新已有技能内容（同 write）',
        '  - delete: 删除技能',
        '  - promote_sandbox_skill: 将沙箱内技能晋升到正式 skills/，晋升后 get_skill 可见',
        '重要：只写入应用数据目录 skills/，禁止操作 ~/.claude/ 下的任何内容。',
        '技能格式为 Markdown，可包含 YAML frontmatter。',
        '保存后该技能可被 get_skill 获取并交由 run_script 执行，且会随技能备份/恢复。'
      ].join('\n'),
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'create', 'write', 'update', 'install_from_github', 'install_from_remote', 'delete', 'promote_sandbox_skill'],
            description: 'list=列出 | create/write/update=创建或更新 | install_from_github=从GitHub安装 | install_from_remote=从远程源安装 | delete=删除 | promote_sandbox_skill=沙箱技能晋升'
          },
          name: {
            type: 'string',
            description: '技能文件名（不含 .md）。create/write/update/delete/promote_sandbox_skill 时必填。install_from_github 时可选。'
          },
          sandbox: {
            type: 'boolean',
            description: '可选。create/write/update 时为 true 则写入 skills/_sandbox/<name>/，供验证后晋升；默认 false 写入正式目录'
          },
          content: {
            type: 'string',
            description: '技能的完整 Markdown 内容。action=create/write/update 时必填。'
          },
          github_url: {
            type: 'string',
            description: 'GitHub 文件地址。action=install_from_github 时必填。'
          },
          source_name: {
            type: 'string',
            description: '远程源名称（与 openultron.json skills.sources[].name 一致）。action=install_from_remote 时必填。'
          },
          skill_id: {
            type: 'string',
            description: '远程技能 id（从 get_skill action=list_remote 返回的 skills[].id）。action=install_from_remote 时必填。'
          }
        },
        required: ['action']
      }
    },

    async execute({ action, name, content, github_url, source_name, skill_id, sandbox }) {
      fs.mkdirSync(skillsDir, { recursive: true })
      const sandboxDir = path.join(skillsDir, '_sandbox')

      // list（仅正式目录，不含 _sandbox）
      if (action === 'list') {
        const dirs = fs.existsSync(skillsDir)
          ? fs.readdirSync(skillsDir).filter(d => {
              if (d === '_sandbox') return false
              try { return fs.statSync(path.join(skillsDir, d)).isDirectory() } catch { return false }
            })
          : []
        return {
          skills_dir: skillsDir,
          skills: dirs,
          note: '此处仅列正式技能。沙箱内技能用 get_skill action=list_sandbox 查看。'
        }
      }

      // promote_sandbox_skill：将沙箱技能晋升到正式目录
      if (action === 'promote_sandbox_skill') {
        if (!name) return { error: '缺少 name 参数' }
        const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_\-]/g, '_')
        if (safeName === '_sandbox') return { error: '不能晋升保留名 _sandbox' }
        const srcDir = path.join(sandboxDir, safeName)
        const destDir = path.join(skillsDir, safeName)
        if (!fs.existsSync(srcDir)) return { error: `沙箱中未找到技能 "${safeName}"，请用 get_skill action=list_sandbox 确认` }
        const skillFile = path.join(srcDir, 'SKILL.md')
        if (!fs.existsSync(skillFile)) return { error: `沙箱目录 "${safeName}" 内无 SKILL.md` }
        if (fs.existsSync(destDir)) {
          fs.rmSync(destDir, { recursive: true, force: true })
        }
        fs.renameSync(srcDir, destDir)
        if (onChanged) onChanged()
        return {
          success: true,
          message: `技能 "${safeName}" 已从沙箱晋升到正式目录：${destDir}/SKILL.md`,
          skill_dir: destDir
        }
      }

      // create / write / update（sandbox=true 时写入 _sandbox/<name>/）
      if (action === 'create' || action === 'write' || action === 'update') {
        if (!name) return { error: '缺少 name 参数' }
        if (!content) return { error: '缺少 content 参数' }
        const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_\-]/g, '_')
        if (safeName === '_sandbox') return { error: '技能名不能为保留名 _sandbox' }
        const skillDir = path.join(sandbox ? sandboxDir : skillsDir, safeName)
        const exists = fs.existsSync(skillDir)
        fs.mkdirSync(path.dirname(skillDir), { recursive: true })
        fs.mkdirSync(skillDir, { recursive: true })
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content.trim(), 'utf-8')
        if (onChanged) onChanged()
        return {
          success: true,
          message: sandbox
            ? `技能 "${safeName}" 已写入沙箱：${skillDir}/SKILL.md，验证通过后用 promote_sandbox_skill 晋升`
            : `技能 "${safeName}" 已${exists ? '更新' : '创建'}：${skillDir}/SKILL.md`,
          skill_dir: skillDir,
          sandbox: !!sandbox
        }
      }

      // delete（可删正式或沙箱；先试正式再试沙箱；禁止删 _sandbox 目录本身）
      if (action === 'delete') {
        if (!name) return { error: '缺少 name 参数' }
        if (name === '_sandbox') return { error: '不能删除保留目录 _sandbox' }
        const formalDir = path.join(skillsDir, name)
        const inSandboxDir = path.join(sandboxDir, name)
        if (fs.existsSync(formalDir)) {
          fs.rmSync(formalDir, { recursive: true, force: true })
          if (onChanged) onChanged()
          return { success: true, message: `技能 "${name}" 已从正式目录删除` }
        }
        if (fs.existsSync(inSandboxDir)) {
          fs.rmSync(inSandboxDir, { recursive: true, force: true })
          if (onChanged) onChanged()
          return { success: true, message: `技能 "${name}" 已从沙箱删除` }
        }
        return { error: `技能 "${name}" 不存在于正式目录或沙箱` }
      }

      // install_from_remote：从配置的 skills.sources 中按 source_name 与 skill_id 拉取并安装
      if (action === 'install_from_remote') {
        if (!getSkillsSources || typeof getSkillsSources !== 'function') {
          return { error: '未配置技能源，无法从远程安装' }
        }
        if (!source_name) return { error: '缺少 source_name 参数（远程源名称）' }
        if (!skill_id) return { error: '缺少 skill_id 参数（从 get_skill list_remote 获得的技能 id）' }
        const sources = getSkillsSources().filter(s => s.enabled !== false && s.url)
        const src = sources.find(s => (s.name || '').trim() === String(source_name).trim())
        if (!src) return { error: `未找到名为 "${source_name}" 的远程源，请检查 openultron.json 的 skills.sources` }
        let data
        try {
          data = await fetchJson(src.url)
        } catch (e) {
          return { error: `拉取远程源失败: ${e.message}` }
        }
        const list = Array.isArray(data.skills) ? data.skills : (Array.isArray(data) ? data : [])
        const skill = list.find(s => (s.id || s.name || '') === String(skill_id).trim())
        if (!skill) return { error: `远程源中未找到 id 为 "${skill_id}" 的技能` }
        const baseUrl = src.url.replace(/\/[^/]*$/, '/')
        const installUrl = skill.install_url || skill.url || (skill.id ? `${baseUrl}${skill.id}/SKILL.md` : null) || (skill.name ? `${baseUrl}${skill.name}/SKILL.md` : null)
        if (!installUrl) return { error: '该技能无 install_url，无法安装' }
        let fetchedContent
        try {
          fetchedContent = await fetchText(installUrl)
        } catch (e) {
          return { error: `下载技能内容失败: ${e.message}` }
        }
        const safeName = (name || skill_id || skill.name || 'remote_skill').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_\-]/g, '_')
        const skillDir = path.join(skillsDir, safeName)
        fs.mkdirSync(skillDir, { recursive: true })
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), fetchedContent.trim(), 'utf-8')
        if (onChanged) onChanged()
        return {
          success: true,
          message: `技能 "${safeName}" 已从远程源 "${src.name || src.url}" 安装到 ${skillDir}/SKILL.md`,
          skill_dir: skillDir,
          name: safeName
        }
      }

      // install_from_github
      if (action === 'install_from_github') {
        if (!github_url) return { error: '缺少 github_url 参数' }
        let rawUrl = github_url.trim()
        if (rawUrl.includes('github.com') && !rawUrl.includes('raw.githubusercontent.com')) {
          rawUrl = rawUrl
            .replace('github.com', 'raw.githubusercontent.com')
            .replace('/blob/', '/')
        }
        let fetchedContent
        try {
          const fetchUrl = new URL(rawUrl)
          const isHttps = fetchUrl.protocol === 'https:'
          fetchedContent = await new Promise((resolve, reject) => {
            const req = (isHttps ? https : http).get({
              hostname: fetchUrl.hostname,
              port: fetchUrl.port || (isHttps ? 443 : 80),
              path: fetchUrl.pathname + fetchUrl.search,
              headers: { 'User-Agent': 'git-manager/1.0' }
            }, (res) => {
              if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
              let body = ''
              res.on('data', c => { body += c })
              res.on('end', () => resolve(body))
            })
            req.on('error', reject)
            req.setTimeout(15000, () => { req.destroy(); reject(new Error('请求超时')) })
            req.end()
          })
        } catch (e) {
          return { error: `获取失败: ${e.message}` }
        }
        const fileName = name || new URL(rawUrl).pathname.split('/').pop().replace(/\.md$/i, '')
        const safeName = fileName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_\-]/g, '_')
        const skillDir = path.join(skillsDir, safeName)
        fs.mkdirSync(skillDir, { recursive: true })
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), fetchedContent.trim(), 'utf-8')
        if (onChanged) onChanged()
        return {
          success: true,
          message: `技能 "${safeName}" 已从 GitHub 安装到 ${skillDir}/SKILL.md`,
          skill_dir: skillDir,
          name: safeName
        }
      }

      return { error: `未知 action: ${action}` }
    }
  }
}

module.exports = { createInstallSkillTool }
