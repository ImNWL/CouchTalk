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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
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

    try {
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          roles,
          history: messages,
          sessionId: sessionId || undefined
        })
      });

      const data = await response.json();
      setMessages([...messages, ...data.messages]);
      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
      }
      setIsStarted(true);
    } catch (error) {
      console.error('发言失败:', error);
      alert('连接服务器失败，请确保后端服务已启动');
    } finally {
      setIsLoading(false);
    }
  };

  const sendUserMessage = () => {
    if (userInput.trim()) {
      setMessages([...messages, { name: '你', text: userInput.trim() }]);
      setUserInput('');
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
        <h1>🔥 CouchTalk 围炉夜话</h1>

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

            <div className="messages">
              {messages.map((msg, index) => (
                <div key={index} className={`message ${msg.name === '你' ? 'user' : 'ai'}`}>
                  <div className="message-name">{msg.name}</div>
                  <div className="message-text">{msg.text}</div>
                </div>
              ))}
              {isLoading && <div className="loading">AI 嘉宾们正在发言...</div>}
              <div ref={messagesEndRef} />
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
