import React, { useState, useRef, useEffect } from 'react';

interface FloatingChatProps {
  patientId: string;
}

const FloatingChat: React.FC<FloatingChatProps> = ({ patientId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ sender: string; text: string }[]>([
    {
      sender: 'bot',
      text: 'أهلاً بك في العيادة الذكية! كيف يمكنني مساعدتك اليوم؟',
    },
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
    setMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setInput('');
    setIsLoading(true);

    try {
      // ⚠️ لينك الـ n8n بتاعك (كما هو بدون تغيير) ⚠️
      const response = await fetch(
        'https://details-type-invest-worship.trycloudflare.com/webhook/clinic-chat',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userText,
            sessionId: patientId,
          }),
        }
      );

      const data = await response.json();
      setMessages((prev) => [...prev, { sender: 'bot', text: data.reply }]);
    } catch (error) {
      console.error('Chat Error:', error);
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: 'عذراً، حدث خطأ في الاتصال، يرجى المحاولة لاحقاً.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .fc-root { position: fixed; bottom: 20px; right: 20px; z-index: 9999; direction: rtl;
          font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; }

        .fc-panel { width: calc(100vw - 40px); max-width: 380px; height: 540px; max-height: calc(100vh - 110px);
          background: #f4f8f8; border-radius: 22px; margin-bottom: 14px; overflow: hidden;
          display: flex; flex-direction: column; border: 1px solid #d3e2e4;
          box-shadow: 0 30px 70px -20px rgba(7,28,34,.45);
          transform-origin: bottom right; animation: fc-open .28s cubic-bezier(.2,.8,.2,1) both; }
        @keyframes fc-open { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: none; } }
        @keyframes fc-msg { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

        .fc-head { background: linear-gradient(160deg, #0a2a33, #0b4f5c); color: #fff; padding: 14px 18px;
          display: flex; align-items: center; justify-content: space-between; }
        .fc-head-info { display: flex; align-items: center; gap: 12px; }
        .fc-avatar { width: 40px; height: 40px; border-radius: 12px; background: rgba(92,214,196,.16);
          border: 1px solid rgba(92,214,196,.35); display: grid; place-items: center; color: #5cd6c4; }
        .fc-title { margin: 0; font-size: 15px; font-weight: 700; }
        .fc-status { margin: 2px 0 0; font-size: 12px; color: #9fd9d1; display: flex; align-items: center; gap: 6px; }
        .fc-dot { width: 7px; height: 7px; border-radius: 50%; background: #5cd6c4; }
        .fc-close { background: rgba(255,255,255,.1); border: 0; color: #fff; width: 30px; height: 30px;
          border-radius: 10px; cursor: pointer; display: grid; place-items: center; }
        .fc-close:hover { background: rgba(255,255,255,.2); }

        .fc-body { flex: 1; padding: 16px 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
        .fc-body::-webkit-scrollbar { width: 6px; }
        .fc-body::-webkit-scrollbar-thumb { background: #bcd3d6; border-radius: 10px; }

        .fc-row { max-width: 85%; animation: fc-msg .25s ease both; }
        .fc-row.user { align-self: flex-start; }
        .fc-row.bot { align-self: flex-end; }
        .fc-bubble { padding: 11px 15px; font-size: 14px; line-height: 1.7; white-space: pre-wrap; border-radius: 16px; }
        .fc-row.user .fc-bubble { background: #0c8a7b; color: #fff; border-bottom-right-radius: 4px; }
        .fc-row.bot .fc-bubble { background: #fff; color: #0a2a33; border: 1px solid #dbe8e9; border-bottom-left-radius: 4px; }

        .fc-typing { display: inline-flex; gap: 4px; align-items: center; }
        .fc-typing i { width: 6px; height: 6px; border-radius: 50%; background: #0c8a7b; animation: fc-bounce 1.3s infinite ease-in-out both; }
        .fc-typing i:nth-child(1) { animation-delay: -.3s; }
        .fc-typing i:nth-child(2) { animation-delay: -.15s; }
        @keyframes fc-bounce { 0%,80%,100% { transform: scale(0); } 40% { transform: scale(1); } }

        .fc-foot { padding: 12px; background: #fff; border-top: 1px solid #e3eeee; display: flex; gap: 8px; align-items: center; }
        .fc-input { flex: 1; padding: 12px 16px; border-radius: 14px; border: 1px solid #d3e2e4; background: #f4f8f8;
          color: #0a2a33; font-size: 14px; outline: none; font-family: inherit; }
        .fc-input:focus { border-color: #0c8a7b; box-shadow: 0 0 0 3px rgba(12,138,123,.15); }
        .fc-send { width: 44px; height: 44px; border-radius: 14px; border: 0; cursor: pointer; background: #0c8a7b; color: #fff;
          display: grid; place-items: center; transition: background .15s, opacity .15s; }
        .fc-send:hover:not(:disabled) { background: #0a6f63; }
        .fc-send:disabled { opacity: .5; cursor: not-allowed; }
        .fc-send svg { transform: scaleX(-1); }

        .fc-fab { width: 60px; height: 60px; border-radius: 20px; border: 0; cursor: pointer; color: #fff;
          background: linear-gradient(160deg, #0c8a7b, #0a4f5c); display: grid; place-items: center;
          box-shadow: 0 14px 30px -10px rgba(12,138,123,.6); animation: fc-open .35s cubic-bezier(.2,.8,.2,1) both; }
        .fc-fab:hover { box-shadow: 0 18px 36px -10px rgba(12,138,123,.75); }

        @media (prefers-reduced-motion: reduce) { .fc-panel, .fc-row, .fc-fab { animation: none; } .fc-typing i { animation: none; transform: scale(1); } }
      `}</style>

      <div className="fc-root">
        {isOpen && (
          <div className="fc-panel" role="dialog" aria-label="المساعد الذكي">
            <div className="fc-head">
              <div className="fc-head-info">
                <div className="fc-avatar">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="4" y="8" width="16" height="11" rx="3" />
                    <path d="M12 8V4" />
                    <circle cx="12" cy="3.5" r="1" />
                    <path d="M9 13h.01M15 13h.01M9.5 16.2c1.5.8 3.5.8 5 0" />
                  </svg>
                </div>
                <div>
                  <h3 className="fc-title">المساعد الذكي</h3>
                  <p className="fc-status">
                    <span className="fc-dot" /> متصل الآن
                  </p>
                </div>
              </div>
              <button
                className="fc-close"
                onClick={() => setIsOpen(false)}
                aria-label="إغلاق"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="fc-body">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`fc-row ${msg.sender === 'user' ? 'user' : 'bot'}`}
                >
                  <div className="fc-bubble">{msg.text}</div>
                </div>
              ))}

              {isLoading && (
                <div className="fc-row bot">
                  <div className="fc-bubble">
                    <span className="fc-typing">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="fc-foot">
              <input
                className="fc-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="اكتب استفسارك هنا..."
                disabled={isLoading}
              />
              <button
                className="fc-send"
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                aria-label="إرسال"
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M22 2L11 13"
                    stroke="currentColor"
                    strokeWidth="2.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M22 2L15 22L11 13L2 9L22 2Z"
                    stroke="currentColor"
                    strokeWidth="2.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {!isOpen && (
          <button
            className="fc-fab"
            onClick={() => setIsOpen(true)}
            aria-label="فتح المحادثة"
          >
            <svg
              width="27"
              height="27"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </>
  );
};

export default FloatingChat;
