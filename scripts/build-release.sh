#!/bin/bash

# 正式包打包脚本 - ARM64 版本（Apple Silicon）
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

echo "🚀 开始打包正式版 (ARM64)..."
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

# 检查 node-pty 架构是否为 arm64
PTY_NODE="node_modules/node-pty/build/Release/pty.node"
if [ -f "$PTY_NODE" ]; then
  PTY_ARCH=$(file "$PTY_NODE" | grep -o 'arm64\|x86_64' | head -1)
  if [ "$PTY_ARCH" != "arm64" ]; then
    echo "⚠️  node-pty 架构 ($PTY_ARCH) 不是 arm64"
    echo "🔄 重新编译 node-pty 为 arm64..."
    npx @electron/rebuild -f -w node-pty -a arm64
    echo "✅ node-pty 重新编译完成"
echo ""
  fi
else
  echo "⚠️  node-pty 未编译，正在编译为 arm64..."
  npx @electron/rebuild -f -w node-pty -a arm64
  echo "✅ node-pty 编译完成"
echo ""
fi

DIST_DIR="dist-electron"

# 步骤1：构建前端
echo "📦 步骤1: 构建前端..."
npm run build

# 步骤2：打包 Electron 应用（仅生成 app 目录）
echo ""
echo "📦 步骤2: 打包 Electron 应用 (ARM64)..."
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --dir

# 步骤3：ad-hoc 签名
echo ""
echo "🔧 步骤3: 对应用进行 ad-hoc 签名..."
APP_PATH="$DIST_DIR/mac-arm64/GitManager.app"
if [ -d "$APP_PATH" ]; then
  echo "📝 移除隔离属性..."
  xattr -cr "$APP_PATH" 2>/dev/null || true
  
  echo "📝 正在签名: GitManager.app (ARM64)"
  codesign --force --deep --sign - "$APP_PATH"
  
  echo "📝 验证签名..."
  codesign --verify --verbose "$APP_PATH"
  echo "✅ 签名完成"
fi

# 步骤4：重新打包成 DMG 和 ZIP
echo ""
echo "📦 步骤4: 创建分发包..."
rm -f "$DIST_DIR"/*arm64*.dmg "$DIST_DIR"/*arm64*.zip "$DIST_DIR"/*arm64*.blockmap
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --prepackaged="$DIST_DIR/mac-arm64"

echo ""
echo "🎉 构建完成！"
echo ""
echo "📦 已生成以下文件："
ls -lh "$DIST_DIR"/*arm64*.dmg "$DIST_DIR"/*arm64*.zip 2>/dev/null || true
echo ""

# 打开输出目录
open "$DIST_DIR/"
