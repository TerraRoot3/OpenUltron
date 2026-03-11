#!/usr/bin/env node

/**
 * 生成应用图标脚本
 * 创建一个现代化的 Git 管理工具图标
 */

const fs = require('fs');
const path = require('path');

// 创建 SVG 图标
const createSVGIcon = () => {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- 主背景渐变 -->
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="50%" style="stop-color:#16213e"/>
      <stop offset="100%" style="stop-color:#0f3460"/>
    </linearGradient>
    
    <!-- 主节点渐变 (青色) -->
    <linearGradient id="nodeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#00d9ff"/>
      <stop offset="100%" style="stop-color:#00ff88"/>
    </linearGradient>
    
    <!-- 分支节点渐变 (橙色) -->
    <linearGradient id="branchGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ff6b6b"/>
      <stop offset="100%" style="stop-color:#ffa502"/>
    </linearGradient>
    
    <!-- 合并节点渐变 (紫色) -->
    <linearGradient id="mergeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#a55eea"/>
      <stop offset="100%" style="stop-color:#5f27cd"/>
    </linearGradient>
    
    <!-- 发光效果 -->
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <!-- macOS 图标需要 10% 边距 -->
  <!-- 圆角背景 -->
  <rect x="102.4" y="102.4" width="819.2" height="819.2" rx="180" ry="180" fill="url(#bgGradient)"/>
  
  <!-- Git 分支图 -->
  <g>
    <!-- 先画线（在节点下面） -->
    
    <!-- 主干线：整条垂直线 -->
    <rect x="500" y="280" width="24" height="460" rx="12" fill="#00d9ff" filter="url(#glow)"/>
    
    <!-- 分支线：水平向右 -->
    <rect x="512" y="408" width="168" height="24" rx="12" fill="#ff6b6b" filter="url(#glow)"/>
    
    <!-- 合并线：水平向左 -->
    <rect x="344" y="588" width="168" height="24" rx="12" fill="#a55eea" filter="url(#glow)"/>
    
    <!-- 再画节点（覆盖在线上面） -->
    
    <!-- 顶部节点 -->
    <circle cx="512" cy="280" r="48" fill="url(#nodeGradient)" filter="url(#glow)"/>
    <circle cx="512" cy="280" r="24" fill="white"/>
    
    <!-- 分支点节点 -->
    <circle cx="512" cy="420" r="42" fill="url(#nodeGradient)" filter="url(#glow)"/>
    <circle cx="512" cy="420" r="20" fill="white"/>
    
    <!-- 右侧分支节点 -->
    <circle cx="680" cy="420" r="44" fill="url(#branchGradient)" filter="url(#glow)"/>
    <circle cx="680" cy="420" r="22" fill="white"/>
    
    <!-- 合并点节点 -->
    <circle cx="512" cy="600" r="42" fill="url(#nodeGradient)" filter="url(#glow)"/>
    <circle cx="512" cy="600" r="20" fill="white"/>
    
    <!-- 左侧合并节点 -->
    <circle cx="344" cy="600" r="44" fill="url(#mergeGradient)" filter="url(#glow)"/>
    <circle cx="344" cy="600" r="22" fill="white"/>
  
    <!-- 底部节点 -->
    <circle cx="512" cy="740" r="48" fill="url(#nodeGradient)" filter="url(#glow)"/>
    <circle cx="512" cy="740" r="24" fill="white"/>
  </g>
  
</svg>`;

  return svg;
};

// 保存 SVG 文件
const saveSVG = () => {
  const iconsDir = path.join(__dirname, '..', 'icons');
  
  // 确保 icons 目录存在
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }
  
  const svgPath = path.join(iconsDir, 'icon.svg');
  const svg = createSVGIcon();
  
  fs.writeFileSync(svgPath, svg, 'utf8');
  console.log('✅ SVG 图标已生成:', svgPath);
  
  return svgPath;
};

// 创建说明文件
const createReadme = () => {
  const iconsDir = path.join(__dirname, '..', 'icons');
  const readmePath = path.join(iconsDir, 'README.md');
  
  const readme = `# 应用图标

## 生成的图标文件

- \`icon.svg\` - 源 SVG 图标（1024x1024）

## 转换为其他格式

### 方法1: 使用在线工具
1. 打开 https://www.icoconverter.com/ 或 https://cloudconvert.com/
2. 上传 \`icon.svg\`
3. 转换为需要的格式：
   - macOS: .icns
   - Windows: .ico
   - Linux: .png (多种尺寸)

### 方法2: 使用 ImageMagick
\`\`\`bash
# 安装 ImageMagick
brew install imagemagick

# 生成 PNG 图标（多种尺寸）
convert icon.svg -resize 16x16 icon-16x16.png
convert icon.svg -resize 32x32 icon-32x32.png
convert icon.svg -resize 48x48 icon-48x48.png
convert icon.svg -resize 128x128 icon-128x128.png
convert icon.svg -resize 256x256 icon-256x256.png
convert icon.svg -resize 512x512 icon-512x512.png
convert icon.svg -resize 1024x1024 icon-1024x1024.png

# 生成 icns (macOS)
# 需要先创建 iconset
mkdir icon.iconset
sips -z 16 16 icon.svg --out icon.iconset/icon_16x16.png
sips -z 32 32 icon.svg --out icon.iconset/icon_16x16@2x.png
sips -z 32 32 icon.svg --out icon.iconset/icon_32x32.png
sips -z 64 64 icon.svg --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 icon.svg --out icon.iconset/icon_128x128.png
sips -z 256 256 icon.svg --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 icon.svg --out icon.iconset/icon_256x256.png
sips -z 512 512 icon.svg --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 icon.svg --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.svg --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
\`\`\`

### 方法3: 使用 electron-icon-builder
\`\`\`bash
npm install -g electron-icon-builder
electron-icon-builder --input=./icon.svg --output=./
\`\`\`

## 使用图标

在 \`electron-builder.json\` 中配置：
\`\`\`json
{
  "mac": {
    "icon": "icons/icon.icns"
  },
  "win": {
    "icon": "icons/icon.ico"
  },
  "linux": {
    "icon": "icons/icon.png"
  }
}
\`\`\`

## 图标设计说明

该图标采用现代科技风格，展示了 Git 分支网络：
- 🌌 深蓝渐变背景（#1a1a2e → #0f3460）
- ✨ 青色主干节点，带发光效果
- 🔶 橙红色分支节点
- 💜 紫色合并节点
- 🔲 大圆角设计，符合 macOS 规范
- 💫 背景装饰网格和光点
`;

  fs.writeFileSync(readmePath, readme, 'utf8');
  console.log('✅ README 文件已创建:', readmePath);
};

// 主函数
const main = () => {
  console.log('🎨 开始生成应用图标...\n');
  
  try {
    saveSVG();
    createReadme();
    
    console.log('\n✨ 图标生成完成！');
    console.log('\n📍 图标位置: icons/icon.svg');
    console.log('📖 查看 icons/README.md 了解如何转换为其他格式\n');
    console.log('💡 提示：');
    console.log('   1. 使用在线工具转换: https://www.icoconverter.com/');
    console.log('   2. 或安装 ImageMagick: brew install imagemagick');
    console.log('   3. 或使用: npm install -g electron-icon-builder\n');
  } catch (error) {
    console.error('❌ 生成图标失败:', error.message);
    process.exit(1);
  }
};

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { createSVGIcon, saveSVG };

