#  CouchTalk 围炉夜话

一个让多位 AI 角色围炉夜话、畅聊任何话题的 Web 应用。

## ✨ 特性

- 🎭 自定义 AI 嘉宾阵容（名人、虚拟角色等）
- 💬 实时对话，每轮随机发言顺序
- 🎨 现代化的 Web 界面
- 🔄 无限轮次，想聊多久就聊多久
- 📝 完整的对话记录

## 🚀 快速开始

### 前置要求

- Node.js 18+
- npm 或 yarn

### 安装

```bash
# 1. 安装后端依赖
cd backend
npm install

# 2. 配置 API 密钥
cp .env.example .env
# 编辑 .env 文件，填入你的 Gemini API 密钥

# 3. 安装前端依赖
cd ../frontend
npm install
```

### 运行

**1. 启动后端服务**

```bash
cd backend
npm run dev
```

后端将运行在 `http://localhost:3001`

**2. 启动前端服务**

新开一个终端：

```bash
cd frontend
npm run dev
```

前端将运行在 `http://localhost:5173`

打开浏览器访问 `http://localhost:5173` 即可使用！

## 📁 项目结构

```
CouchTalk/
├── backend/              # 后端服务
│   ├── src/
│   │   ├── server.ts    # Express API 服务
│   │   └── types.ts     # 类型定义
│   ├── config.json      # 配置文件（可选）
│   └── package.json
│
├── frontend/            # 前端应用
│   ├── src/
│   │   ├── App.tsx     # 主应用组件
│   │   ├── App.css     # 样式
│   │   └── main.tsx    # 入口文件
│   └── package.json
│
└── README.md
```

## 🎯 使用说明

1. **设置主题** - 输入想要讨论的话题
2. **添加嘉宾** - 添加 2 位或更多 AI 嘉宾（如：马斯克、乔布斯、巴菲特等）
3. **开始对话** - 点击"开始围炉夜话"按钮
4. **参与讨论** - AI 嘉宾们会轮流发言，你也可以随时加入讨论
5. **继续对话** - 点击"下一轮"继续，或随时"重置"开始新话题

## 🔧 环境变量配置

**必须配置**：在 `backend/.env` 文件中设置你的 Gemini API 密钥

```bash
编辑 .env 文件，填入你的密钥
```

**获取 API 密钥**：访问 [Google AI Studio](https://aistudio.google.com/apikey) 免费获取

## 🛠️ 技术栈

### 前端
- React 18
- TypeScript
- Vite
- CSS3

### 后端
- Node.js
- Express
- TypeScript
- Google Gemini API

## 📝 API 文档

### POST /api/chat

发起一轮对话

**请求体：**
```json
{
  "topic": "讨论主题",
  "roles": [
    { "name": "角色名1" },
    { "name": "角色名2" }
  ],
  "history": [
    { "name": "角色名", "text": "发言内容" }
  ]
}
```

**响应：**
```json
{
  "messages": [
    { "name": "角色名", "text": "发言内容" }
  ]
}
```

## 💡 提示

- AI 会根据角色名自动推断人物特点和说话风格
- 每轮发言顺序随机，让对话更自然
- 你的发言会影响后续 AI 的回复
- 试试不同的角色组合，会有意想不到的火花

## 📄 开源协议

ISC

---

尽情享受围炉夜话吧！🌙
