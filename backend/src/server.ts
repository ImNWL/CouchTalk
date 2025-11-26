import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import type { Request, Response } from 'express';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// 从环境变量读取 API 密钥
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('❌ 错误：未设置 GEMINI_API_KEY 环境变量');
  console.error('请在 backend/.env 文件中设置你的 API 密钥');
  process.exit(1);
}

const client = new GoogleGenAI({ apiKey: API_KEY });

interface Role {
  name: string;
}

interface Message {
  name: string;
  text: string;
}

interface ChatRequest {
  topic: string;
  roles: Role[];
  history: Message[];
}

// 生成提示词
function buildPrompt(role: Role, history: Message[], topic: string): string {
  const context = history.length
    ? `之前的对话：\n${history.map(h => `${h.name}：${h.text}`).join('\n\n')}\n\n`
    : '';

  return `你是「${role.name}」。\n${context}请围绕主题"${topic}"发言，80-120字，自然对话风格。`;
}

// AI 角色发言
async function speakAsRole(
  role: Role,
  history: Message[],
  topic: string
): Promise<Message | null> {
  const prompt = buildPrompt(role, history, topic);

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: prompt
    });
    const text = response.text?.trim() || '';
    if (text) {
      return { name: role.name, text };
    }
    return null;
  } catch (error) {
    console.error(`${role.name} 发言失败:`, error);
    return null;
  }
}

// Chat API
app.post('/api/chat', async (req: Request<{}, {}, ChatRequest>, res: Response) => {
  try {
    const { topic, roles, history } = req.body;

    if (!topic || !roles || roles.length < 2) {
      return res.status(400).json({ error: '参数错误' });
    }

    // 随机打乱角色顺序
    const shuffledRoles = [...roles].sort(() => Math.random() - 0.5);

    // 收集所有角色的发言
    const messages: Message[] = [];

    for (const role of shuffledRoles) {
      const message = await speakAsRole(role, [...history, ...messages], topic);
      if (message) {
        messages.push(message);
      }
    }

    res.json({ messages });
  } catch (error) {
    console.error('API 错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 健康检查
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
});

