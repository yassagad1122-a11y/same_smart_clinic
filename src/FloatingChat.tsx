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

  // الكود ده مسؤول عن النزول التلقائي لأسفل الشات
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
      // ⚠️⚠️⚠️ هام جداً: حط اللينك بتاعك (n8n URL) هنا بدل الرابط ده ⚠️⚠️⚠️
      const response = await fetch('https://leo-enclosure-buttons-aruba.trycloudflare.com/webhook/clinic-chat', {
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
          /* حركة الفتح */
          @keyframes popIn {
            0% { opacity: 0; transform: scale(0.8) translateY(20px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          /* حركة الرسايل الجديدة */
          @keyframes slideUp {
            0% { opacity: 0; transform: translateY(10px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          /* أنيميشن الثلاث نقط بتاعت الكتابة */
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
          /* تجميل شريط التمرير (Scrollbar) */
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

      <div style={{ position: 'fixed', bottom: '25px', right: '25px', zIndex: 9999, direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        
        {/* نافذة الشات الخرافية */}
        {isOpen && (
          <div style={{ 
            width: '380px', height: '520px', backgroundColor: '#f8fafc', 
            borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', 
            display: 'flex', flexDirection: 'column', marginBottom: '20px', 
            overflow: 'hidden', border: '1px solid #e2e8f0',
            animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
            transformOrigin: 'bottom right'
          }}>
            
            {/* رأس الشات (Header) */}
            <div style={{ 
              background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', 
              color: '#fff', padding: '20px', display: 'flex', 
              justifyContent: 'space-between', alignItems: 'center',
              boxShadow: '0 2px 10px rgba(2, 132, 199, 0.2)',
              zIndex: 2
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', backgroundColor: '#fff', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '22px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                  🤖
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>المساعد الذكي</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#e0f2fe', marginTop: '3px' }}>متصل الآن 🟢</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', fontSize: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'background 0.2s' }}>
                ✕
              </button>
            </div>

            {/* منطقة الرسائل */}
            <div className="custom-scrollbar" style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
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
                    lineHeight: '1.6', fontSize: '14.5px', whiteSpace: 'pre-wrap'
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}
              
              {/* أنيميشن الكتابة (Typing Indicator) */}
              {isLoading && (
                <div style={{ alignSelf: 'flex-end', animation: 'slideUp 0.3s ease forwards' }}>
                  <div style={{ backgroundColor: '#ffffff', padding: '15px 18px', borderRadius: '16px', borderBottomLeftRadius: '4px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                  </div>
                </div>
              )}
              {/* ده العنصر المخفي اللي بيسحب الشاشة لتحت أوتوماتيك */}
              <div ref={messagesEndRef} />
            </div>

            {/* مربع الإدخال الأنيق */}
            <div style={{ padding: '15px', backgroundColor: '#ffffff', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input 
                type="text" 
                value={input} 
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="اكتب استفسارك هنا..." 
                style={{ flex: 1, padding: '14px 18px', borderRadius: '24px', border: '1px solid #e2e8f0', outline: 'none', color: '#1e293b', backgroundColor: '#f8fafc', fontSize: '14px', transition: 'border-color 0.2s' }}
                disabled={isLoading}
              />
              <button 
                onClick={sendMessage} 
                disabled={isLoading || !input.trim()}
                style={{ 
                  background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', 
                  color: '#fff', border: 'none', width: '48px', height: '48px', 
                  borderRadius: '50%', cursor: 'pointer', display: 'flex', 
                  justifyContent: 'center', alignItems: 'center',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
                  opacity: (!input.trim() || isLoading) ? 0.7 : 1,
                  transition: 'opacity 0.2s'
                }}>
                {/* أيقونة إرسال احترافية */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* الأيقونة العايمة الاحترافية */}
        {!isOpen && (
          <button 
            onClick={() => setIsOpen(true)}
            style={{ 
              width: '65px', height: '65px', borderRadius: '50%', 
              background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', 
              color: '#fff', border: 'none', cursor: 'pointer', 
              boxShadow: '0 8px 25px rgba(2, 132, 199, 0.4)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
              transition: 'transform 0.2s'
            }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>
    </>
  );
};

export default FloatingChat;