#!/bin/bash

# 图标转换脚本
# 将 SVG 转换为各种格式和尺寸

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ICONS_DIR="$PROJECT_ROOT/icons"
SVG_FILE="$ICONS_DIR/icon.svg"

echo "🎨 开始转换图标..."
echo ""

# 检查 SVG 文件是否存在
if [ ! -f "$SVG_FILE" ]; then
    echo "❌ 错误: 找不到 $SVG_FILE"
    echo "💡 请先运行: npm run generate-icon"
    exit 1
fi

cd "$ICONS_DIR"

# 方法1: 使用 sips (macOS 内置工具)
echo "📍 方法1: 使用 macOS sips 工具"
echo "-----------------------------------"

if command -v sips &> /dev/null; then
    echo "✓ 检测到 sips 工具"
    echo ""
    echo "生成 PNG 图标..."
    
    # 生成各种尺寸的 PNG
    sizes=(16 32 48 64 128 256 512 1024)
    for size in "${sizes[@]}"; do
        output="icon-${size}x${size}.png"
        echo "  → 生成 ${output}..."
        sips -s format png -z $size $size "$SVG_FILE" --out "$output" > /dev/null 2>&1
    done
    
    echo ""
    echo "✅ PNG 图标生成完成"
    
    # 生成 macOS .icns 文件
    echo ""
    echo "生成 macOS .icns 文件..."
    
    ICONSET_DIR="icon.iconset"
    rm -rf "$ICONSET_DIR"
    mkdir -p "$ICONSET_DIR"
    
    # 创建 iconset 所需的各种尺寸
    sips -s format png -z 16 16 "$SVG_FILE" --out "$ICONSET_DIR/icon_16x16.png" > /dev/null 2>&1
    sips -s format png -z 32 32 "$SVG_FILE" --out "$ICONSET_DIR/icon_16x16@2x.png" > /dev/null 2>&1
    sips -s format png -z 32 32 "$SVG_FILE" --out "$ICONSET_DIR/icon_32x32.png" > /dev/null 2>&1
    sips -s format png -z 64 64 "$SVG_FILE" --out "$ICONSET_DIR/icon_32x32@2x.png" > /dev/null 2>&1
    sips -s format png -z 128 128 "$SVG_FILE" --out "$ICONSET_DIR/icon_128x128.png" > /dev/null 2>&1
    sips -s format png -z 256 256 "$SVG_FILE" --out "$ICONSET_DIR/icon_128x128@2x.png" > /dev/null 2>&1
    sips -s format png -z 256 256 "$SVG_FILE" --out "$ICONSET_DIR/icon_256x256.png" > /dev/null 2>&1
    sips -s format png -z 512 512 "$SVG_FILE" --out "$ICONSET_DIR/icon_256x256@2x.png" > /dev/null 2>&1
    sips -s format png -z 512 512 "$SVG_FILE" --out "$ICONSET_DIR/icon_512x512.png" > /dev/null 2>&1
    sips -s format png -z 1024 1024 "$SVG_FILE" --out "$ICONSET_DIR/icon_512x512@2x.png" > /dev/null 2>&1
    
    # 转换为 .icns
    if command -v iconutil &> /dev/null; then
        iconutil -c icns "$ICONSET_DIR" -o icon.icns
        echo "✅ icon.icns 生成成功"
        rm -rf "$ICONSET_DIR"
    else
        echo "⚠️  iconutil 命令不可用，无法生成 .icns 文件"
        echo "   iconset 文件夹已保留: $ICONSET_DIR"
    fi
else
    echo "⚠️  未检测到 sips 工具（仅在 macOS 上可用）"
fi

echo ""
echo "-----------------------------------"
echo ""

# 方法2: 检查是否安装了 ImageMagick
echo "📍 方法2: 使用 ImageMagick (可选)"
echo "-----------------------------------"

if command -v convert &> /dev/null; then
    echo "✓ 检测到 ImageMagick"
    echo ""
    echo "使用 ImageMagick 生成更多格式..."
    
    # Windows .ico 文件
    if [ ! -f "icon.ico" ]; then
        echo "  → 生成 icon.ico (Windows)..."
        convert icon-16x16.png icon-32x32.png icon-48x48.png icon-256x256.png icon.ico 2>/dev/null || echo "    ⚠️  生成 .ico 失败"
    else
        echo "  ✓ icon.ico 已存在"
    fi
    
    echo ""
    echo "✅ ImageMagick 转换完成"
else
    echo "⚠️  未检测到 ImageMagick"
    echo "💡 安装方法: brew install imagemagick"
fi

echo ""
echo "-----------------------------------"
echo ""

# 列出生成的文件
echo "📦 生成的图标文件:"
echo ""
ls -lh icon.* 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'

if [ -d "icon.iconset" ]; then
    echo ""
    echo "📁 iconset 文件夹: icon.iconset/"
    echo "   (包含多个尺寸的 PNG 文件)"
fi

echo ""
echo "✨ 图标转换完成！"
echo ""
echo "💡 下一步:"
echo "   1. 在 electron-builder 配置中使用这些图标"
echo "   2. macOS 使用: icon.icns"
echo "   3. Windows 使用: icon.ico (需要 ImageMagick)"
echo "   4. Linux 使用: icon.png 或 icon-512x512.png"
echo ""

