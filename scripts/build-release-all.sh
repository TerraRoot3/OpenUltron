#!/bin/bash

# 正式包打包脚本 - 全平台版本（ARM64 + X64）
# 流程: 构建 app → ad-hoc 签名 → 打包 DMG/ZIP

set -e

# 切换到项目目录
cd "$(dirname "$0")/.."

# 加载 nvm 并切换到项目指定的 Node 版本
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
if [ -f ".nvmrc" ]; then
    echo "🔄 切换 Node 版本..."
    nvm use || nvm install
    echo ""
fi

echo "🚀 开始打包正式版 (全平台: ARM64 + X64)..."
echo ""

# 杀掉可能运行的开发进程
echo "🔪 清理运行中的开发进程..."
pkill -9 -f electron 2>/dev/null || true
pkill -9 -f vite 2>/dev/null || true
sleep 1

# 检查依赖是否完整
if [ ! -d "node_modules/electron/dist" ] || [ ! -d "node_modules/vite" ]; then
  echo "📦 依赖不完整，正在安装..."
  npm install
  echo "✅ 依赖安装完成"
  echo ""
fi

DIST_DIR="dist-electron"

# 步骤1：构建前端
echo "📦 步骤1: 构建前端..."
npm run build

# 步骤2：打包 Electron 应用（仅生成 app 目录）
echo ""
echo "📦 步骤2: 打包 Electron 应用 (ARM64 + X64)..."
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --x64 --dir

# 步骤3：ad-hoc 签名
echo ""
echo "🔧 步骤3: 对应用进行 ad-hoc 签名..."

# 签名 ARM64
if [ -d "$DIST_DIR/mac-arm64/GitManager.app" ]; then
  echo "📝 签名 ARM64 版本..."
  xattr -cr "$DIST_DIR/mac-arm64/GitManager.app" 2>/dev/null || true
  codesign --force --deep --sign - "$DIST_DIR/mac-arm64/GitManager.app"
  codesign --verify --verbose "$DIST_DIR/mac-arm64/GitManager.app"
  echo "✅ ARM64 签名完成"
fi

# 签名 X64
if [ -d "$DIST_DIR/mac/GitManager.app" ]; then
  echo "📝 签名 X64 版本..."
  xattr -cr "$DIST_DIR/mac/GitManager.app" 2>/dev/null || true
  codesign --force --deep --sign - "$DIST_DIR/mac/GitManager.app"
  codesign --verify --verbose "$DIST_DIR/mac/GitManager.app"
  echo "✅ X64 签名完成"
fi

# 步骤4：重新打包成 DMG 和 ZIP
echo ""
echo "📦 步骤4: 创建分发包..."
rm -f "$DIST_DIR"/*.dmg "$DIST_DIR"/*.zip "$DIST_DIR"/*.blockmap 2>/dev/null || true

# 打包 ARM64
if [ -d "$DIST_DIR/mac-arm64" ]; then
  echo "📦 打包 ARM64..."
  CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --prepackaged="$DIST_DIR/mac-arm64"
fi

# 打包 X64
if [ -d "$DIST_DIR/mac" ]; then
  echo "📦 打包 X64..."
  CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --x64 --prepackaged="$DIST_DIR/mac"
fi

echo ""
echo "🎉 构建完成！"
echo ""
echo "📦 已生成以下文件："
ls -lh "$DIST_DIR"/*.dmg "$DIST_DIR"/*.zip 2>/dev/null || true
echo ""

# 打开输出目录
open "$DIST_DIR/"
