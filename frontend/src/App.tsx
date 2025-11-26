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
  const [topic, setTopic] = useState('哪家公司会是未来五年的这股ai风的最大胜利者');
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
  const [thinkingRole, setThinkingRole] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 检查滚动条是否在最底端
  const isScrollAtBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    
    // 判断滚动条是否在底部（允许1px的误差）
    const isAtBottom = Math.abs(
      container.scrollHeight - container.scrollTop - container.clientHeight
    ) <= 1;
    
    return isAtBottom;
  };

  // 监听滚动，更新按钮显示状态
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setShowScrollButton(!isScrollAtBottom());
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // 只有当滚动条在最底端时才自动滚动
  useEffect(() => {
    if (messages.length > 0 && isScrollAtBottom()) {
      // 使用 setTimeout 确保 DOM 更新后再滚动
      setTimeout(() => {
        scrollToBottom();
      }, 50);
    }
  }, [messages]);

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

  const startRound = async () => {
    if (roles.length < 2) {
      alert('至少需要 2 个角色');
      return;
    }

    setIsLoading(true);
    setRound(round + 1);
    setIsStarted(true);

    try {
      // 1. 获取本轮的随机顺序
      const orderResponse = await fetch('http://localhost:3001/api/chat/start-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles })
      });
      const { roles: shuffledRoles } = await orderResponse.json();

      // 2. 逐个角色发言
      for (const role of shuffledRoles) {
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
              sessionId: sessionId || undefined
            })
          });

          const data = await response.json();
          
          // 保存 sessionId
          if (data.sessionId && !sessionId) {
            setSessionId(data.sessionId);
          }

          // 立即显示这个角色的发言
          if (data.message) {
            setMessages(prev => [...prev, data.message]);
          }
        } catch (error) {
          console.error(`${role.name} 发言失败:`, error);
        }

        // 清除思考状态
        setThinkingRole('');
      }

      // 本轮结束，添加分隔标记
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
    if (!userInput.trim() || !sessionId) return;

    const message = { name: '你', text: userInput.trim() };
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
              开始围炉夜话
            </button>
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
              
              {showScrollButton && (
                <button 
                  className="scroll-to-bottom"
                  onClick={scrollToBottom}
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
