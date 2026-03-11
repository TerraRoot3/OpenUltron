#!/usr/bin/env node
/**
 * 从 icons/logo.png 生成多尺寸 PNG、icon.icns，并复制到 public（不依赖 bash/echo）
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const projectRoot = path.join(__dirname, '..')
const iconsDir = path.join(projectRoot, 'icons')
const publicDir = path.join(projectRoot, 'public')
const desktopSource = path.join(iconsDir, 'logo-desktop.png')
const logoSource = path.join(iconsDir, 'logo.png')
const source = fs.existsSync(desktopSource) ? desktopSource : logoSource

if (!fs.existsSync(source)) {
  console.error('Missing icon source: icons/logo-desktop.png or icons/logo.png')
  process.exit(1)
}

function sips(z, outPath) {
  execSync(`sips -s format png -z ${z} ${z} "${source}" --out "${outPath}"`, { stdio: 'pipe' })
}

// 多尺寸 PNG
const sizes = [16, 32, 48, 64, 128, 256, 512, 1024]
for (const size of sizes) {
  const out = path.join(iconsDir, `icon-${size}x${size}.png`)
  sips(size, out)
}
console.log('Generated icon-*.png')

// iconset for icns
const iconsetDir = path.join(iconsDir, 'icon.iconset')
if (fs.existsSync(iconsetDir)) fs.rmSync(iconsetDir, { recursive: true })
fs.mkdirSync(iconsetDir, { recursive: true })

const set = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png']
]
for (const [z, name] of set) {
  sips(z, path.join(iconsetDir, name))
}

try {
  execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(iconsDir, 'icon.icns')}"`, { stdio: 'pipe' })
  fs.rmSync(iconsetDir, { recursive: true })
  console.log('Generated icon.icns')
} catch (e) {
  console.warn('iconutil failed (macOS only):', e.message)
}

// public
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true })
fs.copyFileSync(logoSource, path.join(publicDir, 'logo.png'))
sips(64, path.join(publicDir, 'logo-64.png'))
console.log('Updated public/logo.png, public/logo-64.png')
console.log('Done.')
