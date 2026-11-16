import React, { useState, useRef, useEffect } from 'react';

interface FloatingChatProps {
  patientId: string;
}

const FloatingChat: React.FC<FloatingChatProps> = ({ patientId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{sender: string, text: string}[]>([
    { sender: 'bot', text: 'أهلاً بك في العيادة الذكية! كيف يمكنني مساعدتك اليوم؟' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userText = input;
    setMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setInput('');
    setIsLoading(true);

    try {
      // ⚠️ حط لينك الـ n8n بتاعك هنا ⚠️
      const response = await fetch('https://thunder-bestsellers-pts-coating.trycloudflare.com/webhook/clinic-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          sessionId: patientId
        })
      });

      const data = await response.json();
      setMessages(prev => [...prev, { sender: 'bot', text: data.reply }]);
    } catch (error) {
      console.error('Chat Error:', error);
      setMessages(prev => [...prev, { sender: 'bot', text: 'عذراً، حدث خطأ في الاتصال، يرجى المحاولة لاحقاً.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <style>
        {`
          @keyframes popIn {
            0% { opacity: 0; transform: scale(0.8) translateY(20px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes slideUp {
            0% { opacity: 0; transform: translateY(10px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          .typing-dot {
            display: inline-block;
            width: 6px;
            height: 6px;
            background-color: #0284c7;
            border-radius: 50%;
            margin: 0 2px;
            animation: typing 1.4s infinite ease-in-out both;
          }
          .typing-dot:nth-child(1) { animation-delay: -0.32s; }
          .typing-dot:nth-child(2) { animation-delay: -0.16s; }
          @keyframes typing {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
          }
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background-color: #cbd5e1;
            border-radius: 10px;
          }
        `}
      </style>

      {/* خلينا المسافات 20px عشان تناسب الموبايل */}
      <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999, direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        
        {isOpen && (
          <div style={{ 
            /* التعديل هنا: العرض والطول بقوا متجاوبين مع الشاشة */
            width: 'calc(100vw - 40px)', 
            maxWidth: '380px', 
            height: '520px', 
            maxHeight: 'calc(100vh - 100px)', 
            backgroundColor: '#f8fafc', 
            borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)', 
            display: 'flex', flexDirection: 'column', marginBottom: '15px', 
            overflow: 'hidden', border: '1px solid #e2e8f0',
            animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
            transformOrigin: 'bottom right'
          }}>
            
            <div style={{ 
              background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', 
              color: '#fff', padding: '15px 20px', display: 'flex', 
              justifyContent: 'space-between', alignItems: 'center',
              boxShadow: '0 2px 10px rgba(2, 132, 199, 0.2)',
              zIndex: 2
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', backgroundColor: '#fff', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '20px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                  🤖
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>المساعد الذكي</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#e0f2fe', marginTop: '2px' }}>متصل الآن 🟢</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: '30px', height: '30px', borderRadius: '50%', fontSize: '14px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'background 0.2s' }}>
                ✕
              </button>
            </div>

            <div className="custom-scrollbar" style={{ flex: 1, padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {messages.map((msg, idx) => (
                <div key={idx} style={{ 
                  alignSelf: msg.sender === 'user' ? 'flex-start' : 'flex-end',
                  animation: 'slideUp 0.3s ease forwards',
                  maxWidth: '85%'
                }}>
                  <div style={{
                    backgroundColor: msg.sender === 'user' ? '#0ea5e9' : '#ffffff',
                    color: msg.sender === 'user' ? '#ffffff' : '#1e293b',
                    padding: '12px 16px',
                    borderRadius: '16px',
                    borderBottomRightRadius: msg.sender === 'user' ? '4px' : '16px',
                    borderBottomLeftRadius: msg.sender === 'bot' ? '4px' : '16px',
                    boxShadow: msg.sender === 'user' ? '0 4px 10px rgba(14, 165, 233, 0.2)' : '0 4px 10px rgba(0,0,0,0.05)',
                    border: msg.sender === 'bot' ? '1px solid #e2e8f0' : 'none',
                    lineHeight: '1.6', fontSize: '14px', whiteSpace: 'pre-wrap'
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div style={{ alignSelf: 'flex-end', animation: 'slideUp 0.3s ease forwards' }}>
                  <div style={{ backgroundColor: '#ffffff', padding: '12px 16px', borderRadius: '16px', borderBottomLeftRadius: '4px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '12px', backgroundColor: '#ffffff', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input 
                type="text" 
                value={input} 
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="اكتب استفسارك هنا..." 
                style={{ flex: 1, padding: '12px 16px', borderRadius: '24px', border: '1px solid #e2e8f0', outline: 'none', color: '#1e293b', backgroundColor: '#f8fafc', fontSize: '14px' }}
                disabled={isLoading}
              />
              <button 
                onClick={sendMessage} 
                disabled={isLoading || !input.trim()}
                style={{ 
                  background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', 
                  color: '#fff', border: 'none', width: '44px', height: '44px', 
                  borderRadius: '50%', cursor: 'pointer', display: 'flex', 
                  justifyContent: 'center', alignItems: 'center',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
                  opacity: (!input.trim() || isLoading) ? 0.7 : 1
                }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {!isOpen && (
          <button 
            onClick={() => setIsOpen(true)}
            style={{ 
              width: '60px', height: '60px', borderRadius: '50%', 
              background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', 
              color: '#fff', border: 'none', cursor: 'pointer', 
              boxShadow: '0 6px 20px rgba(2, 132, 199, 0.4)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
            }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>
    </>
  );
};

export default FloatingChat;