import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import type { Request, Response } from 'express';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = 3001;

// 配置项
const CONFIG = {
  CONTEXT_ROUNDS: 2, // 传入最近几轮对话作为上下文
  SESSION_TIMEOUT: 60 * 60 * 1000, // 会话超时时间（1小时）
  CLEANUP_INTERVAL: 10 * 60 * 1000, // 清理间隔（10分钟）
};

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
  roles: Role[];
  chats: Map<string, any>; // 每个角色的 Chat 实例
  history: Message[]; // 完整对话历史
  createdAt: number;
}

// 存储会话（内存中，生产环境应该用 Redis 等）
const sessions = new Map<string, ChatSession>();

// 清理超时的旧会话
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > CONFIG.SESSION_TIMEOUT) {
      // 清理 Chat 实例
      session.chats.clear();
      sessions.delete(sessionId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 自动清理了 ${cleanedCount} 个过期会话`);
  }
}, CONFIG.CLEANUP_INTERVAL);

// 生成会话 ID
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// 获取或创建会话
function getOrCreateSession(sessionId: string | undefined, topic: string, roles: Role[]): { session: ChatSession; sessionId: string } {
  if (sessionId && sessions.has(sessionId)) {
    return { session: sessions.get(sessionId)!, sessionId };
  }

  const newSessionId = sessionId || generateSessionId();
  const chats = new Map<string, any>();

  // 为每个角色创建独立的 Chat 会话
  const participantNames = roles.map(r => r.name).join('、');
  
  for (const role of roles) {
    const systemInstruction = 
    `你现在的身份是「${role.name}」。\n` +
    `我们正在进行一场关于"${topic}"的围炉夜话。其他在座参与者：${participantNames}。\n\n` +
    
    `**请遵循以下规则进行回复：**\n` +
    `1. **纯对话模式**：你只需要输出你嘴里说出来的话。**严禁**使用括号()、星号**或其他符号来描述动作、神态、心理活动或场景（例如：不要写“喝了一口水”、“笑着说”等）。**\n` +
    `2. **口语化风格**：像老朋友聊天一样自然，保留你（${role.name}）的说话风格、口头禅和性格特征。不要像在念新闻稿。\n` +
    `3. **互动性**：你的回复是接在其他人发言之后的，请自然地回应他们的观点，或者向他们提问。\n` +
    `4. **篇幅控制**：保持在150-200字左右，不要长篇大论，观点要清晰有力。`;
    
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
    roles,
    chats,
    history: [],
    createdAt: Date.now()
  };

  sessions.set(newSessionId, session);
  return { session, sessionId: newSessionId };
}

// 计算需要传入多少条消息（最近 N 轮）
function calculateContextSize(roles: Role[], rounds: number): number {
  return roles.length * rounds;
}

// 构建上下文文本
function buildContextText(history: Message[], roles: Role[]): string {
  const contextSize = calculateContextSize(roles, CONFIG.CONTEXT_ROUNDS);
  const recentHistory = history.slice(-contextSize);
  
  if (recentHistory.length === 0) {
    return '';
  }
  
  return recentHistory.map(h => `${h.name}：${h.text}`).join('\n');
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

// 开始新一轮 - 返回打乱后的角色顺序
app.post('/api/chat/start-round', (req: Request, res: Response) => {
  try {
    const { roles } = req.body;
    
    if (!roles || roles.length < 2) {
      return res.status(400).json({ error: '参数错误' });
    }

    // 随机打乱角色顺序
    const shuffledRoles = [...roles].sort(() => Math.random() - 0.5);
    
    res.json({ roles: shuffledRoles });
  } catch (error) {
    console.error('API 错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 单个角色发言
app.post('/api/chat/speak', async (req: Request, res: Response) => {
  try {
    const { topic, role, roles, sessionId } = req.body;

    if (!topic || !role || !role.name || !roles) {
      return res.status(400).json({ error: '参数错误' });
    }

    // 获取或创建会话
    const { session, sessionId: actualSessionId } = getOrCreateSession(sessionId, topic, roles);

    const chat = session.chats.get(role.name);
    if (!chat) {
      return res.status(400).json({ error: '角色不存在' });
    }

    // 构建最近的对话上下文（从会话历史中获取）
    const recentContext = buildContextText(session.history, session.roles);

    const message = await speakAsRole(chat, role.name, recentContext);
    
    if (!message) {
      return res.status(500).json({ error: '发言失败' });
    }

    // 将消息添加到会话历史
    session.history.push(message);

    res.json({ message, sessionId: actualSessionId });
  } catch (error) {
    console.error('API 错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 添加用户消息到历史
app.post('/api/chat/user-message', (req: Request, res: Response) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message || !message.text) {
      return res.status(400).json({ error: '参数错误' });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: '会话不存在' });
    }

    // 添加用户消息到历史
    session.history.push(message);

    res.json({ success: true });
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
