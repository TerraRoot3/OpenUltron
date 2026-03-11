#!/bin/bash

# Ad-hoc 签名脚本 - 让应用可以在其他 Mac 上运行
# 这个脚本会对应用进行临时签名，使其可以通过 macOS 的基本安全检查

set -e

echo "🔧 开始对应用进行 ad-hoc 签名..."

DIST_DIR="dist-electron"

# 查找所有的 .app 文件
find "$DIST_DIR" -name "*.app" -type d | while read app; do
  echo "📝 正在签名: $app"
  
  # 移除扩展属性（隔离标记）
  xattr -cr "$app" 2>/dev/null || true
  
  # 使用 ad-hoc 签名（使用 "-" 作为身份，表示自签名）
  codesign --force --deep --sign - "$app"
  
  # 验证签名
  echo "✅ 验证签名: $app"
  codesign --verify --verbose "$app"
  
  echo "✅ 完成签名: $app"
  echo ""
done

echo "🎉 所有应用已完成 ad-hoc 签名！"
echo ""
echo "📦 现在可以分发以下文件："
ls -lh "$DIST_DIR"/*.dmg "$DIST_DIR"/*.zip 2>/dev/null || true

