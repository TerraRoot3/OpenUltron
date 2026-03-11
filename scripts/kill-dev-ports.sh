#!/usr/bin/env bash
# 仅清理开发环境占用的端口（28791 Vite、28792 Gateway），供 npm run dev 启动前执行
# 不杀 28789/28790，避免影响已运行的正式包
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$PROJECT_DIR"
for port in 28791 28792; do
  PID=$(lsof -ti:$port 2>/dev/null)
  if [ -n "$PID" ]; then
    echo "⚠️  释放开发端口 $port (PID $PID)"
    kill -9 $PID 2>/dev/null || true
  fi
done
