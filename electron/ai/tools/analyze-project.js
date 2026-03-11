// 工具：分析项目类型和结构
const fs = require('fs')
const path = require('path')

const definition = {
  description: '分析项目的类型（前端/后端/Android/iOS/鸿蒙等）、技术栈、构建方式和部署配置',
  parameters: {
    type: 'object',
    properties: {
      projectPath: {
        type: 'string',
        description: '项目根目录路径'
      }
    },
    required: ['projectPath']
  }
}

// 项目类型检测规则
const PROJECT_MARKERS = [
  { type: 'vue-frontend', files: ['package.json', 'vue.config.js'], keywords: { 'package.json': ['vue'] } },
  { type: 'vue-frontend', files: ['package.json', 'vite.config.ts'], keywords: { 'package.json': ['vue'] } },
  { type: 'vue-frontend', files: ['package.json', 'vite.config.js'], keywords: { 'package.json': ['vue'] } },
  { type: 'react-frontend', files: ['package.json'], keywords: { 'package.json': ['react', 'react-dom'] } },
  { type: 'node-backend', files: ['package.json'], keywords: { 'package.json': ['express', 'koa', 'fastify', 'nest'] } },
  { type: 'java-backend', files: ['pom.xml'] },
  { type: 'java-backend', files: ['build.gradle'] },
  { type: 'android', files: ['app/build.gradle'], dirs: ['app/src/main/java'] },
  { type: 'android', files: ['app/build.gradle.kts'], dirs: ['app/src/main/kotlin'] },
  { type: 'ios', files: ['Podfile'], exts: ['.xcodeproj', '.xcworkspace'] },
  { type: 'ios-swift', files: ['Package.swift'] },
  { type: 'harmonyos', files: ['build-profile.json5'], dirs: ['entry/src'] },
  { type: 'harmonyos', files: ['oh-package.json5'] },
  { type: 'flutter', files: ['pubspec.yaml'], dirs: ['lib'] },
  { type: 'go-backend', files: ['go.mod'] },
  { type: 'python', files: ['requirements.txt'] },
  { type: 'python', files: ['pyproject.toml'] },
  { type: 'rust', files: ['Cargo.toml'] },
]

async function execute(args) {
  const { projectPath } = args

  try {
    const stat = await fs.promises.stat(projectPath)
    if (!stat.isDirectory()) {
      return { success: false, error: '路径不是目录' }
    }

    const entries = await fs.promises.readdir(projectPath, { withFileTypes: true })
    const fileNames = entries.filter(e => e.isFile()).map(e => e.name)
    const dirNames = entries.filter(e => e.isDirectory()).map(e => e.name)

    // 检测项目类型
    const detectedTypes = []
    for (const marker of PROJECT_MARKERS) {
      let match = true

      // 检查必需文件
      if (marker.files) {
        for (const f of marker.files) {
          if (f.includes('/')) {
            try {
              await fs.promises.access(path.join(projectPath, f))
            } catch {
              match = false; break
            }
          } else if (!fileNames.includes(f)) {
            match = false; break
          }
        }
      }

      // 检查必需目录
      if (match && marker.dirs) {
        for (const d of marker.dirs) {
          try {
            const s = await fs.promises.stat(path.join(projectPath, d))
            if (!s.isDirectory()) { match = false; break }
          } catch {
            match = false; break
          }
        }
      }

      // 检查文件扩展名
      if (match && marker.exts) {
        const hasExt = marker.exts.some(ext =>
          entries.some(e => e.name.endsWith(ext))
        )
        if (!hasExt) match = false
      }

      // 检查关键字
      if (match && marker.keywords) {
        for (const [file, words] of Object.entries(marker.keywords)) {
          try {
            const content = await fs.promises.readFile(
              path.join(projectPath, file), 'utf-8'
            )
            if (!words.some(w => content.includes(w))) {
              match = false; break
            }
          } catch {
            match = false; break
          }
        }
      }

      if (match && !detectedTypes.includes(marker.type)) {
        detectedTypes.push(marker.type)
      }
    }

    // 检测构建/部署配置
    const buildConfigs = []
    const ciFiles = [
      'Jenkinsfile', '.gitlab-ci.yml', '.github/workflows',
      'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
      'Makefile', 'build.sh', 'deploy.sh'
    ]
    for (const cf of ciFiles) {
      try {
        await fs.promises.access(path.join(projectPath, cf))
        buildConfigs.push(cf)
      } catch { /* ignore */ }
    }

    // 读取 package.json 的 scripts（如果有）
    let scripts = null
    try {
      const pkg = JSON.parse(
        await fs.promises.readFile(path.join(projectPath, 'package.json'), 'utf-8')
      )
      scripts = pkg.scripts || null
    } catch { /* ignore */ }

    return {
      success: true,
      projectPath,
      types: detectedTypes.length > 0 ? detectedTypes : ['unknown'],
      files: fileNames.slice(0, 50),
      directories: dirNames.slice(0, 50),
      buildConfigs,
      scripts
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

module.exports = { definition, execute }
