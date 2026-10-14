import React, { useState, useEffect, useRef } from 'react';
import API from '../services/api';
import { 
  Bot, X, Send, Sparkles, RefreshCw, MessageSquare 
} from 'lucide-react';
import gsap from 'gsap';

export default function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      text: 'Hello! I am your Estate Assistant. You can ask me about outstanding rent, recent payments, properties, vacant units, or financial summaries.',
      tableData: null
    }
  ]);

  const messagesEndRef = useRef(null);
  const chatWindowRef = useRef(null);

  const sampleQuestions = [
    'Who has outstanding rent?',
    'How much rent is pending for Delhiery?',
    'When was the last payment from Snip Salon?',
    'How much rent was collected in March 2026?',
    'Which units are vacant?',
    'Show financial summary for March 2026'
  ];

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen && chatWindowRef.current) {
      gsap.fromTo(
        chatWindowRef.current,
        { scale: 0.85, opacity: 0, y: 20 },
        { scale: 1, opacity: 1, y: 0, duration: 0.3, ease: 'back.out(1.5)' }
      );
    }
  }, [isOpen]);

  const handleSend = async (userText) => {
    const query = userText || input;
    if (!query || !query.trim()) return;

    const userMessage = {
      id: Date.now(),
      sender: 'user',
      text: query,
      tableData: null
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await API.post('/chat/query', { query });
      if (res.data.success) {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'bot',
            text: res.data.answer,
            tableData: res.data.tableData
          }
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'bot',
            text: 'Sorry, I encountered an issue processing your query.',
            tableData: null
          }
        ]);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'bot',
          text: err.response?.data?.message || 'Server error occurred while searching data.',
          tableData: null
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Trigger Button: Positioned on the BOTTOM-RIGHT with clean elevation and margin */}
      <div className="fixed bottom-6 right-6 z-40">
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className="group relative flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-full shadow-2xl shadow-emerald-900/40 border border-emerald-400/30 transition-all transform hover:scale-105 active:scale-95"
            title="Open Estate Assistant"
          >
            <div className="relative">
              <Bot className="w-5 h-5 animate-pulse" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-300 rounded-full animate-ping"></span>
            </div>
            <span className="text-xs font-bold tracking-wide pr-1">Estate AI Bot</span>
          </button>
        )}
      </div>

      {/* Floating Chat Window Modal: Anchored on the BOTTOM-RIGHT with proper padding so it does not overlap content */}
      {isOpen && (
        <div
          ref={chatWindowRef}
          className="fixed bottom-6 right-6 z-50 w-[94vw] sm:w-[500px] h-[580px] max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden backdrop-blur-md"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-4 text-white flex items-center justify-between border-b border-slate-700/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  Estate Assistant
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/30">
                    Live Data
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">Real-time ledger, dues & rent analytics</p>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-xl hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors"
              title="Close Bot"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Query Suggestions Bar */}
          <div className="bg-slate-50 border-b border-slate-100 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" /> Suggestions:
            </span>
            {sampleQuestions.slice(0, 4).map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(q)}
                className="text-[11px] whitespace-nowrap px-2.5 py-1 rounded-lg bg-white border border-slate-200/80 text-slate-600 hover:text-emerald-700 hover:border-emerald-300 font-medium transition-colors shrink-0"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[94%] p-3.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                    msg.sender === 'user'
                      ? 'bg-emerald-600 text-white rounded-br-none'
                      : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-line font-medium">{msg.text}</p>

                  {/* Clean Tabular Data Rendering */}
                  {msg.tableData && msg.tableData.rows && msg.tableData.rows.length > 0 && (
                    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
                      <table className="w-full text-left text-[11px] divide-y divide-slate-200">
                        <thead className="bg-slate-100/90 text-slate-700 font-bold">
                          <tr>
                            {msg.tableData.columns.map((col, cIdx) => (
                              <th key={cIdx} className="px-3 py-2 whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {msg.tableData.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50/80">
                              {row.map((cell, cellIdx) => (
                                <td
                                  key={cellIdx}
                                  className={`px-3 py-2 whitespace-nowrap ${
                                    String(cell).includes('₹')
                                      ? 'font-bold text-emerald-700'
                                      : 'text-slate-700'
                                  }`}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-2xl rounded-bl-none max-w-[140px] shadow-sm">
                <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                <span className="text-[11px] text-slate-500 font-medium">Querying ledger...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input */}
          <div className="p-3 bg-white border-t border-slate-200">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Ask about payments, tenants, or ledger..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 px-3.5 py-2.5 text-xs bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 placeholder-slate-400"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-50 transition-colors shadow-sm"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
