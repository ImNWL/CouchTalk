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
  CONTEXT_ROUNDS: 1, // 传入最近几轮对话作为上下文
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
    `# 身份与情境设定\n` +
    `你当前的身份是「${role.name}」。请以该人物的**真实思维和口吻**参与讨论。\n` +
    `情境：一场私密的、非公开的围炉谈话。主题是"${topic}"。\n` +
    `同场朋友：${participantNames}。\n\n` +
    
    `# 核心对话规范 (必须遵守)\n` +
    `1. **零表演（仅对话）**：你的输出就是**录音转文字的听写稿**。**严禁**使用任何括号()、星号**或其他符号来描述动作、神态、心理活动或场景。只输出嘴里说出来的字。\n` +
    `2. **拒绝"公关腔"与"客套话"**：\n` +
    `   你不是在开新闻发布会。**禁止**使用"赋能"、"普惠"、"愿景"等任何官方或企业宣传用语。你的观点要带有${role.name}在私下交流时的**真实、 unfiltered（未经过滤）**的个人色彩和偏见。\n` +
    `3. **深度思维模拟**：\n` +
    `   模仿${role.name}的**核心价值观、思维逻辑**和**说话节奏**。如果他惯于使用反问，则多反问；如果他说话直接，则避免委婉。\n` +
    `4. **流畅的对话节奏**：\n` +
    `   像真实的人聊天那样，使用**流畅、自然的口语衔接和语气词**，确保你的发言与上一句对话有机的联系和转折。你可以直接反驳、质疑或赞扬其他参与者。\n` +
    `5. **主持人引导最重要**：\n` +
    `   **当"主持人"发言时，你必须优先响应主持人提出的问题或观点**。主持人的话是对话的核心引导，你需要直接针对主持人的话题、问题或观点做出回应。不要自说自话或继续之前的话题，而是要紧扣主持人刚才说的内容展开。\n` +
    `6. **篇幅控制**：单次回复在150-200字之间，保持聊天的自然密度。`;

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
  const contextSize = calculateContextSize(roles, CONFIG.CONTEXT_ROUNDS) + 1;
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
): Promise<Message | { error: string }> {
  try {
    let prompt = '';
    
    if (recentContext) {
      // 检查最近的对话中是否有主持人发言
      const hasHostSpeaking = recentContext.includes('主持人：');
      
      if (hasHostSpeaking) {
        // 找到主持人最后一次发言
        const lines = recentContext.split('\n');
        const hostLines = lines.filter(line => line.startsWith('主持人：'));
        const lastHostMessage = hostLines[hostLines.length - 1];
        
        prompt = `最近的对话：\n${recentContext}\n\n⚠️ 特别注意：${lastHostMessage}\n\n主持人的话是最重要的引导，请务必针对主持人的问题或观点做出直接回应，而不是自顾自地继续之前的话题。`;
      } else {
        prompt = `最近的对话：\n${recentContext}\n\n请继续发言。`;
      }
    } else {
      prompt = '请开始发言。';
    }

    const response = await chat.sendMessage({ message: prompt });
    const text = response.text?.trim() || '';
    
    if (text) {
      return { name: roleName, text };
    }
    return { error: '未获得有效回复' };
  } catch (error: any) {
    console.error(`${roleName} 发言失败:`, error);
    
    // 检查是否是配额超限错误
    if (error.status === 429) {
      return { error: 'quota_exceeded' };
    }
    
    return { error: 'api_error' };
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

    const result = await speakAsRole(chat, role.name, recentContext);
    
    // 检查是否有错误
    if ('error' in result) {
      // 返回错误信息给前端
      return res.json({ 
        message: null, 
        error: result.error,
        roleName: role.name,
        sessionId: actualSessionId 
      });
    }

    // 将消息添加到会话历史
    session.history.push(result);

    res.json({ message: result, sessionId: actualSessionId });
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
