#!/bin/bash

# 创建可分发的应用包
# 这个脚本会：
# 1. 对已构建的应用进行 ad-hoc 签名
# 2. 创建新的 ZIP 包（不使用 DMG，因为 DMG 可能会保留隔离属性）

set -e

echo "🔧 创建可分发的应用包..."
echo ""

DIST_DIR="dist-electron"

# 检查应用是否存在
if [ ! -d "$DIST_DIR/mac/GitManager.app" ]; then
  echo "❌ 错误: 未找到构建的应用，请先运行 npm run electron:build:mac"
  exit 1
fi

# 函数：签名并打包
sign_and_package() {
  local arch=$1
  local app_dir=$2
  local output_name=$3
  
  echo "📝 处理 $arch 版本..."
  
  # 移除扩展属性
  xattr -cr "$app_dir/GitManager.app" 2>/dev/null || true
  
  # ad-hoc 签名（深度签名，包括所有 Helper 应用）
  codesign --force --deep --sign - "$app_dir/GitManager.app"
  
  # 验证签名
  codesign --verify --verbose "$app_dir/GitManager.app"
  
  # 创建 ZIP 包
  cd "$app_dir"
  zip -r -q "../../${output_name}.zip" "GitManager.app"
  cd - > /dev/null
  
  echo "✅ 完成 $arch 版本"
  echo ""
}

# 删除旧的分发包
rm -f "$DIST_DIR"/GitManager-*-signed.zip

# 处理 Intel 版本
if [ -d "$DIST_DIR/mac" ]; then
  sign_and_package "Intel (x64)" "$DIST_DIR/mac" "GitManager-1.0.0-x64-signed"
fi

# 处理 Apple Silicon 版本
if [ -d "$DIST_DIR/mac-arm64" ]; then
  sign_and_package "Apple Silicon (arm64)" "$DIST_DIR/mac-arm64" "GitManager-1.0.0-arm64-signed"
fi

echo "🎉 所有版本已完成签名和打包！"
echo ""
echo "📦 生成的文件："
ls -lh "$DIST_DIR"/*-signed.zip 2>/dev/null
echo ""
echo "📝 分发说明："
echo "1. 将 ZIP 文件发送给用户"
echo "2. 用户解压后，在终端执行："
echo "   xattr -cr GitManager.app"
echo "3. 然后双击打开即可"

