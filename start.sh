#!/bin/bash

echo "🚀 启动 CouchTalk..."

# 启动后端
echo "📡 启动后端服务..."
cd backend
npm run dev &
BACKEND_PID=$!

# 等待后端启动
sleep 3

# 启动前端
echo "🎨 启动前端服务..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ 服务已启动！"
echo "   后端: http://localhost:3001"
echo "   前端: http://localhost:5173"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 捕获退出信号
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT TERM

# 等待
wait

