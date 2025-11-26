import { useState, useRef, useEffect } from 'react';
import './App.css';

interface Message {
  name: string;
  text: string;
}

interface Role {
  name: string;
}

function App() {
  const [topic, setTopic] = useState('哪家公司会是这股ai风未来五年的最大胜利者');
  const [roles, setRoles] = useState<Role[]>([
    { name: '马化腾' },
    { name: '马云' },
    { name: '段永平' },
    { name: '马斯克' },
    { name: '拉里佩奇' },
    { name: '乔布斯' },
    { name: '巴菲特' },
    { name: '查理芒格' },
    { name: '彼得林奇' }
  ]);
  const [newRole, setNewRole] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isStarted, setIsStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [round, setRound] = useState(0);
  const [sessionId, setSessionId] = useState<string>('');
  const sessionIdRef = useRef(sessionId); // 使用 ref 跟踪最新的 sessionId
  const [thinkingRole, setThinkingRole] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const wasAtBottomRef = useRef(true);
  const shouldScrollRef = useRef(true);

  // 当 sessionId 状态更新时，同步更新 ref 的值
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 检查用户是否在底部
  const isNearBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    
    const threshold = 50; // 距离底部 50px 内认为是在底部
    const position = container.scrollHeight - container.scrollTop - container.clientHeight;
    return position <= threshold;
  };

  // 监听滚动 - 持续更新用户是否在底部的状态
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const atBottom = isNearBottom();
      wasAtBottomRef.current = atBottom;
      shouldScrollRef.current = atBottom;
      setAutoScroll(atBottom);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    
    // 初始化时也检查一次
    handleScroll();
    
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // 在每次消息变化前捕获滚动位置
  const prevMessagesLengthRef = useRef(messages.length);
  
  // 在渲染前检查滚动位置
  if (messages.length > prevMessagesLengthRef.current) {
    // 消息数量增加了，立即检查当前滚动位置
    const container = messagesContainerRef.current;
    if (container) {
      const threshold = 50;
      const position = container.scrollHeight - container.scrollTop - container.clientHeight;
      shouldScrollRef.current = position <= threshold;
    }
  }
  
  useEffect(() => {
    // 消息数量增加了且之前在底部
    if (messages.length > prevMessagesLengthRef.current && shouldScrollRef.current) {
      // 使用双重 RAF 确保 DOM 完全更新
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      });
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages]);

  // 当思考状态变化时，如果在底部也滚动
  useEffect(() => {
    if (thinkingRole && shouldScrollRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      });
    }
  }, [thinkingRole]);

  const addRole = () => {
    if (newRole.trim() && !isStarted) {
      setRoles([...roles, { name: newRole.trim() }]);
      setNewRole('');
    }
  };

  const removeRole = (index: number) => {
    if (!isStarted) {
      setRoles(roles.filter((_, i) => i !== index));
    }
  };

  // 获取本轮的随机角色顺序
  const getShuffledRoles = async (roles: Role[]) => {
    const response = await fetch('http://localhost:3001/api/chat/start-round', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles })
    });
    const { roles: shuffledRoles } = await response.json();
    return shuffledRoles;
  };

  // 处理角色发言
  const handleRoleSpeaking = async (role: Role) => {
    // 显示正在思考
    setThinkingRole(role.name);

    try {
      const response = await fetch('http://localhost:3001/api/chat/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          role,
          roles,
          sessionId: sessionIdRef.current || undefined
        })
      });

      const data = await response.json();
      
      // 保存 sessionId
      if (data.sessionId && !sessionIdRef.current) {
        setSessionId(data.sessionId);
      }
      console.log(data.sessionId)
      console.log(sessionIdRef.current)

      // 处理发言结果
      if (data.error) {
        handleErrorMessage(data, role);
      } else if (data.message) {
        setMessages(prev => [...prev, data.message]);
      }
    } catch (error) {
      console.error(`${role.name} 发言失败:`, error);
      // 网络错误处理
      setMessages(prev => [...prev, {
        name: role.name,
        text: '💤 思索到走神了...（网络错误）'
      }]);
    } finally {
      // 清除思考状态
      setThinkingRole('');
    }
  };

  // 处理错误消息
  const handleErrorMessage = (data: any, role: Role) => {
    // 根据错误类型显示不同的提示
    let errorText = '';
    if (data.error === 'quota_exceeded') {
      errorText = '💤 思索到走神了...（API配额已用完）';
    } else {
      errorText = '💤 思索到走神了...';
    }
    
    setMessages(prev => [...prev, {
      name: data.roleName || role.name,
      text: errorText
    }]);
  };

  // 处理所有角色发言
  const processAllRolesSpeaking = async (shuffledRoles: Role[]) => {
    for (const role of shuffledRoles) {
      await handleRoleSpeaking(role);
    }
  };

  const startRound = async () => {
    // 参数验证
    if (roles.length < 2) {
      alert('至少需要 2 个角色');
      return;
    }

    // 更新 UI 状态
    setIsLoading(true);
    setRound(round + 1);
    setIsStarted(true);

    try {
      // 1. 获取随机顺序
      const shuffledRoles = await getShuffledRoles(roles);

      // 2. 处理所有角色发言
      await processAllRolesSpeaking(shuffledRoles);

      // 3. 本轮结束，添加分隔标记
      setMessages(prev => [...prev, { 
        name: '__divider__', 
        text: `第 ${round + 1} 轮结束` 
      }]);
    } catch (error) {
      console.error('发言失败:', error);
      alert('连接服务器失败，请确保后端服务已启动');
    } finally {
      setIsLoading(false);
    }
  };

  const sendUserMessage = async () => {
    if (!userInput.trim() || !sessionId || isLoading) return;

    const message = { name: '主持人', text: userInput.trim() };
    setMessages([...messages, message]);
    setUserInput('');

    // 通知后端记录用户消息
    try {
      await fetch('http://localhost:3001/api/chat/user-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message
        })
      });
      
      // 发送完消息后自动开始下一轮
      await startRound();
    } catch (error) {
      console.error('记录用户消息失败:', error);
    }
  };

  const reset = async () => {
    if (!confirm('确定要结束本次围炉夜话吗？\n对话记录将被清空，但你可以开始新的话题。')) {
      return;
    }

    // 通知后端清理会话
    if (sessionId) {
      try {
        await fetch('http://localhost:3001/api/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        });
        console.log('✅ 会话已清理');
      } catch (error) {
        console.error('重置会话失败:', error);
      }
    }
    
    setMessages([]);
    setIsStarted(false);
    setRound(0);
    setSessionId('');
  };

  return (
    <div className="app">
      <div className="container">
        <h1> CouchTalk 围炉夜话</h1>

        {!isStarted ? (
          <div className="setup">
            <div className="setup-content">
              <img src="/1.jpg" alt="围炉夜话" className="setup-header-image" />
              <div className="form-group">
                <label>讨论主题</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="输入讨论主题"
                />
              </div>

              <div className="form-group">
                <label>嘉宾阵容</label>
                <div className="roles-list">
                  {roles.map((role, index) => (
                    <div key={index} className="role-tag">
                      {role.name}
                      <button onClick={() => removeRole(index)}>×</button>
                    </div>
                  ))}
                </div>
                <div className="add-role">
                  <input
                    type="text"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addRole()}
                    placeholder="添加嘉宾"
                  />
                  <button onClick={addRole}>添加</button>
                </div>
              </div>

              <button className="btn-primary" onClick={startRound}>
              🔥 开始围炉夜话
              </button>
            </div>
          </div>
        ) : (
          <div className="chat">
            <div className="chat-header">
              <div className="topic">{topic}</div>
              <div className="info">
                第 {round} 轮 · {roles.map(r => r.name).join('、')}
              </div>
            </div>

            <div className="messages" ref={messagesContainerRef}>
              {messages.map((msg, index) => {
                // 如果是分隔线
                if (msg.name === '__divider__') {
                  return (
                    <div key={index} className="round-divider">
                      <div className="divider-line"></div>
                      <div className="divider-text">{msg.text}</div>
                      <div className="divider-line"></div>
                    </div>
                  );
                }
                // 普通消息
                return (
                  <div key={index} className={`message ${msg.name === '你' ? 'user' : 'ai'}`}>
                    <div className="message-name">{msg.name}</div>
                    <div className="message-text">{msg.text}</div>
                  </div>
                );
              })}
              {thinkingRole && (
                <div className="thinking">
                  <div className="thinking-name">{thinkingRole}</div>
                  <div className="thinking-text">正在思考中...</div>
                </div>
              )}
              <div ref={messagesEndRef} />
              
              {!autoScroll && (
                <button 
                  className="scroll-to-bottom"
                  onClick={() => {
                    setAutoScroll(true);
                    wasAtBottomRef.current = true;
                    scrollToBottom();
                  }}
                >
                  ↓ 回到底部
                </button>
              )}
            </div>

            <div className="input-area">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendUserMessage()}
                placeholder="输入你的发言..."
                disabled={isLoading}
              />
              <button onClick={sendUserMessage} disabled={isLoading}>
                发送
              </button>
              <button onClick={startRound} disabled={isLoading}>
                下一轮
              </button>
              <button onClick={reset} className="btn-secondary">
                结束本次夜话
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
