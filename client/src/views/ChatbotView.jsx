import React, { useState, useRef, useEffect } from 'react';
import API from '../services/api';
import { Bot, Send, User, Sparkles, HelpCircle } from 'lucide-react';
import gsap from 'gsap';

export default function ChatbotView() {
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: 'Hello! I am your Property & Rent Smart Assistant. You can ask me natural language questions about tenant outstanding amounts, rent collections, properties, or expenses without needing paid AI APIs.',
      tableData: null
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (queryText = null) => {
    const q = queryText || input;
    if (!q || !q.trim() || loading) return;

    const userMessage = { sender: 'user', text: q };
    setMessages(prev => [...prev, userMessage]);
    if (!queryText) setInput('');
    setLoading(true);

    try {
      const res = await API.post('/chat/query', { query: q });
      if (res.data.success) {
        setMessages(prev => [
          ...prev,
          {
            sender: 'bot',
            text: res.data.answer,
            tableData: res.data.tableData
          }
        ]);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          sender: 'bot',
          text: 'Sorry, I encountered an error while querying the database. Please try rephrasing your question.',
          tableData: null
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const samplePrompts = [
    'How much rent is pending for Delhiery?',
    'When was the last payment received from Snip Salon?',
    'How much rent was collected in March 2026?',
    'Show all properties with outstanding rent',
    'What expenses were recorded for Byculla Club?'
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Smart Property Assistant</h3>
            <p className="text-[11px] text-emerald-600 font-medium">Rule-Based • Real Database Queries • Zero Paid API Dependency</p>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-3 ${m.sender === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
              m.sender === 'user'
                ? 'bg-slate-800 text-white'
                : 'bg-emerald-100 text-emerald-700'
            }`}>
              {m.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div className={`max-w-xl rounded-2xl p-4 text-sm leading-relaxed ${
              m.sender === 'user'
                ? 'bg-slate-900 text-white rounded-tr-none'
                : 'bg-slate-50 text-slate-800 border border-slate-200/80 rounded-tl-none shadow-sm'
            }`}>
              <div className="whitespace-pre-wrap">{m.text}</div>

              {m.tableData && (
                <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                        {m.tableData.columns.map((c, i) => (
                          <th key={i} className="px-3 py-2">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {m.tableData.rows.map((r, ri) => (
                        <tr key={ri} className="hover:bg-slate-50/50">
                          {r.map((cell, ci) => (
                            <td key={ci} className="px-3 py-2">{cell}</td>
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
          <div className="flex items-center gap-2 text-xs text-slate-400 italic py-2">
            <Sparkles className="w-4 h-4 text-emerald-500 animate-spin" />
            <span>Consulting database records and financial ledgers...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Chips */}
      <div className="px-6 py-2 bg-slate-50/50 border-t border-slate-100 flex items-center gap-2 overflow-x-auto">
        <span className="text-[11px] font-semibold text-slate-400 shrink-0">Try asking:</span>
        {samplePrompts.map((p, i) => (
          <button
            key={i}
            onClick={() => handleSend(p)}
            className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-600 hover:text-emerald-700 hover:border-emerald-300 shrink-0 transition-colors"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <div className="p-4 bg-white border-t border-slate-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            placeholder="Ask a question about tenants, rent, units, or expenses..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white transition-colors shadow-md shadow-emerald-600/20 disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
