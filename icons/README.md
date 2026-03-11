# 应用图标

## 生成的图标文件

- `icon.svg` - 源 SVG 图标（1024x1024）

## 转换为其他格式

### 方法1: 使用在线工具
1. 打开 https://www.icoconverter.com/ 或 https://cloudconvert.com/
2. 上传 `icon.svg`
3. 转换为需要的格式：
   - macOS: .icns
   - Windows: .ico
   - Linux: .png (多种尺寸)

### 方法2: 使用 ImageMagick
```bash
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
```

### 方法3: 使用 electron-icon-builder
```bash
npm install -g electron-icon-builder
electron-icon-builder --input=./icon.svg --output=./
```

## 使用图标

在 `electron-builder.json` 中配置：
```json
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
```

## 图标设计说明

该图标采用现代科技风格，展示了 Git 分支网络：
- 🌌 深蓝渐变背景（#1a1a2e → #0f3460）
- ✨ 青色主干节点，带发光效果
- 🔶 橙红色分支节点
- 💜 紫色合并节点
- 🔲 大圆角设计，符合 macOS 规范
- 💫 背景装饰网格和光点
