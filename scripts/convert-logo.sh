#!/bin/bash
# 从 icons/logo.png 生成多尺寸图标和 icns，并复制到 public 供前端使用
# 使用: env -i PATH="/usr/bin:/bin" /bin/bash scripts/convert-logo.sh （避免 zsh 干扰）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ICONS_DIR="$PROJECT_ROOT/icons"
PUBLIC_DIR="$PROJECT_ROOT/public"
SOURCE="$ICONS_DIR/logo.png"

if [ ! -f "$SOURCE" ]; then
  echo "❌ 找不到 $SOURCE，请先将 logo 放入 icons/logo.png"
  exit 1
fi

echo "🎨 从 logo.png 生成多尺寸图标..."
mkdir -p "$PUBLIC_DIR"
cd "$ICONS_DIR"

# 使用 sips 生成各尺寸 PNG（macOS）
sizes=(16 32 48 64 128 256 512 1024)
for size in "${sizes[@]}"; do
  out="icon-${size}x${size}.png"
  echo "  → $out"
  sips -s format png -z $size $size "$SOURCE" --out "$out" > /dev/null 2>&1
done

# 生成 macOS .icns
ICONSET_DIR="icon.iconset"
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"
sips -s format png -z 16 16 "$SOURCE" --out "$ICONSET_DIR/icon_16x16.png" > /dev/null 2>&1
sips -s format png -z 32 32 "$SOURCE" --out "$ICONSET_DIR/icon_16x16@2x.png" > /dev/null 2>&1
sips -s format png -z 32 32 "$SOURCE" --out "$ICONSET_DIR/icon_32x32.png" > /dev/null 2>&1
sips -s format png -z 64 64 "$SOURCE" --out "$ICONSET_DIR/icon_32x32@2x.png" > /dev/null 2>&1
sips -s format png -z 128 128 "$SOURCE" --out "$ICONSET_DIR/icon_128x128.png" > /dev/null 2>&1
sips -s format png -z 256 256 "$SOURCE" --out "$ICONSET_DIR/icon_128x128@2x.png" > /dev/null 2>&1
sips -s format png -z 256 256 "$SOURCE" --out "$ICONSET_DIR/icon_256x256.png" > /dev/null 2>&1
sips -s format png -z 512 512 "$SOURCE" --out "$ICONSET_DIR/icon_256x256@2x.png" > /dev/null 2>&1
sips -s format png -z 512 512 "$SOURCE" --out "$ICONSET_DIR/icon_512x512.png" > /dev/null 2>&1
sips -s format png -z 1024 1024 "$SOURCE" --out "$ICONSET_DIR/icon_512x512@2x.png" > /dev/null 2>&1
if command -v iconutil &> /dev/null; then
  iconutil -c icns "$ICONSET_DIR" -o icon.icns
  rm -rf "$ICONSET_DIR"
  echo "  → icon.icns"
fi

# 供前端使用的 logo：原图 + 小尺寸头像用
cp "$SOURCE" "$PUBLIC_DIR/logo.png"
sips -s format png -z 64 64 "$SOURCE" --out "$PUBLIC_DIR/logo-64.png" > /dev/null 2>&1
echo "  → public/logo.png, public/logo-64.png"

echo "✅ 图标转换完成"
