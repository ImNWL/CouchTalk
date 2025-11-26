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
  sessionId?: string;
}

interface ChatSession {
  topic: string;
  chats: Map<string, any>; // 每个角色的 Chat 实例
  createdAt: number;
}

// 存储会话（内存中，生产环境应该用 Redis 等）
const sessions = new Map<string, ChatSession>();

// 清理超过 1 小时的旧会话
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  let cleanedCount = 0;
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > oneHour) {
      // 清理 Chat 实例
      session.chats.clear();
      sessions.delete(sessionId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 自动清理了 ${cleanedCount} 个过期会话`);
  }
}, 10 * 60 * 1000); // 每 10 分钟清理一次

// 生成会话 ID
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// 获取或创建会话
function getOrCreateSession(sessionId: string | undefined, topic: string, roles: Role[]): ChatSession {
  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId)!;
  }

  const newSessionId = sessionId || generateSessionId();
  const chats = new Map<string, any>();

  // 为每个角色创建独立的 Chat 会话
  for (const role of roles) {
    const systemInstruction = `你是「${role.name}」。请保持角色一致性，围绕讨论主题"${topic}"发言，每次回复 80-120 字，自然对话风格。`;
    
    const chat = client.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction,
        thinkingConfig: { thinkingBudget: 0 }, // 禁用思考模式以提升速度
      }
    });
    
    chats.set(role.name, chat);
  }

  const session: ChatSession = {
    topic,
    chats,
    createdAt: Date.now()
  };

  sessions.set(newSessionId, session);
  return session;
}

// AI 角色发言（使用多轮对话）
async function speakAsRole(
  chat: any,
  roleName: string,
  recentContext: string
): Promise<Message | null> {
  try {
    const prompt = recentContext 
      ? `最近的对话：\n${recentContext}\n\n请继续发言。`
      : '请开始发言。';

    const response = await chat.sendMessage({ message: prompt });
    const text = response.text?.trim() || '';
    
    if (text) {
      return { name: roleName, text };
    }
    return null;
  } catch (error) {
    console.error(`${roleName} 发言失败:`, error);
    return null;
  }
}

// Chat API
app.post('/api/chat', async (req: Request<{}, {}, ChatRequest>, res: Response) => {
  try {
    const { topic, roles, history, sessionId } = req.body;

    if (!topic || !roles || roles.length < 2) {
      return res.status(400).json({ error: '参数错误' });
    }

    // 获取或创建会话
    const session = getOrCreateSession(sessionId, topic, roles);
    const actualSessionId = Array.from(sessions.entries()).find(([_, s]) => s === session)?.[0] || generateSessionId();

    // 随机打乱角色顺序
    const shuffledRoles = [...roles].sort(() => Math.random() - 0.5);

    // 收集所有角色的发言
    const messages: Message[] = [];

    // 构建最近的对话上下文（只发送最近 5 条消息，避免 token 过多）
    const recentHistory = history.slice(-5);
    const recentContext = recentHistory.map(h => `${h.name}：${h.text}`).join('\n');

    for (const role of shuffledRoles) {
      const chat = session.chats.get(role.name);
      if (chat) {
        const message = await speakAsRole(chat, role.name, recentContext);
        if (message) {
          messages.push(message);
        }
      }
    }

    res.json({ messages, sessionId: actualSessionId });
  } catch (error) {
    console.error('API 错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 重置会话
app.post('/api/reset', (req: Request, res: Response) => {
  const { sessionId } = req.body;
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    // 清理所有 Chat 实例
    if (session) {
      session.chats.clear();
    }
    sessions.delete(sessionId);
    console.log(`🧹 清理会话: ${sessionId}`);
  }
  res.json({ success: true });
});

// 健康检查
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', activeSessions: sessions.size });
});

app.listen(PORT, () => {
  console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
});
