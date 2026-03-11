#!/usr/bin/env bash
# 清理 Electron / electron-builder 缓存，解决打包时 "zip: not a valid zip file" 等缓存损坏问题
# 用法: bash scripts/clear-electron-cache.sh  或  npm run electron:clean-cache

set -e
cd "$(dirname "$0")/.."

echo "🧹 清理 Electron 与 electron-builder 缓存..."
echo ""

# macOS
if [[ "$OSTYPE" == darwin* ]]; then
  for dir in \
    "$HOME/Library/Caches/electron" \
    "$HOME/Library/Caches/electron-builder" \
    "$HOME/Library/Caches/electron-builder-cache"
  do
    if [[ -d "$dir" ]]; then
      echo "  删除: $dir"
      rm -rf "$dir"
    fi
  done
# Linux
elif [[ "$OSTYPE" == linux* ]]; then
  for dir in \
    "$HOME/.cache/electron" \
    "$HOME/.cache/electron-builder" \
    "$HOME/.cache/electron-builder-cache"
  do
    if [[ -d "$dir" ]]; then
      echo "  删除: $dir"
      rm -rf "$dir"
    fi
  done
# Windows (Git Bash / MSYS)
else
  CACHE_ROOT="${LOCALAPPDATA:-$HOME/AppData/Local}"
  for dir in \
    "$CACHE_ROOT/electron/Cache" \
    "$CACHE_ROOT/electron-builder/Cache"
  do
    if [[ -d "$dir" ]]; then
      echo "  删除: $dir"
      rm -rf "$dir"
    fi
  done
fi

# 项目内构建输出（可选，下次打包会重新生成）
if [[ -d "dist-electron" ]]; then
  echo "  删除: dist-electron/"
  rm -rf dist-electron
fi

echo ""
echo "✅ 缓存已清理。请重新执行打包命令（如 npm run release 或 electron-builder --mac）。"
