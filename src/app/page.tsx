"use client";

import { useRef, useEffect, useState } from 'react';

type Message = { id: string; role: 'user' | 'assistant'; content: string };

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [myInput, setMyInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const customHandleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!myInput.trim() || isLoading) return;

    // 1. Instantly show user message
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: myInput };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setMyInput("");
    setIsLoading(true);

    // 2. Create an empty bubble for the AI
    const aiMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: aiMsgId, role: 'assistant', content: '...' }]);

    try {
      // 3. Call our Next.js backend
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      
      // Check if the backend crashed and grab the exact reason
      if (!response.ok) {
        const exactError = await response.text();
        setMessages((prev) => prev.map((msg) => msg.id === aiMsgId ? { ...msg, content: `⚠️ ${exactError}` } : msg));
        setIsLoading(false);
        return;
      }

      if (!response.body) throw new Error("No response body");

      // 4. The Bulletproof Raw Text Streamer
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let currentAiText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode the raw text and append it immediately
        currentAiText += decoder.decode(value, { stream: true });
        
        setMessages((prev) => 
          prev.map((msg) => 
            msg.id === aiMsgId ? { ...msg, content: currentAiText } : msg
          )
        );
      }
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages((prev) => prev.map((msg) => msg.id === aiMsgId ? { ...msg, content: "⚠️ Network Error: Stream failed." } : msg));
    } finally {
      setIsLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      customHandleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans">
      
      <header className="bg-slate-900 text-white py-4 px-6 shadow-md flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏗️</span>
          <h1 className="text-xl font-bold tracking-wide">Civil<span className="text-amber-500">GPT</span></h1>
        </div>
        <span className="text-xs font-semibold bg-slate-800 px-3 py-1 rounded-full text-slate-300">Engineering Copilot</span>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 w-full max-w-4xl mx-auto space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 text-slate-500">
            <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center text-4xl shadow-inner">
              📐
            </div>
            <h2 className="text-2xl font-semibold text-slate-700">Ready to design.</h2>
            <p className="max-w-md">Ask CivilGPT about structural analysis, load calculations, or concrete design codes.</p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-5 py-4 shadow-sm ${
                m.role === 'user' 
                  ? 'bg-amber-500 text-white rounded-br-none' 
                  : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
              }`}
            >
              <div className="font-semibold text-xs mb-1 opacity-75">
                {m.role === 'user' ? 'You' : 'CivilGPT'}
              </div>
              <div className="leading-relaxed whitespace-pre-wrap">
                {m.content}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      <div className="bg-white border-t border-slate-200 p-4">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={customHandleSubmit} className="relative flex items-center">
            <textarea
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-2xl pl-6 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-shadow shadow-sm resize-none min-h-[56px] max-h-[200px]"
              rows={1}
              value={myInput}
              placeholder="Type your engineering query here..."
              onChange={(e) => setMyInput(e.target.value)} 
              onKeyDown={onKeyDown}
              disabled={isLoading}
            />
            <button 
              type="submit" 
              disabled={myInput.trim() === "" || isLoading}
              className="absolute right-2 bg-slate-900 text-white p-2.5 rounded-full hover:bg-amber-500 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors h-10 w-10 flex items-center justify-center bottom-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
              </svg>
            </button>
          </form>
        </div>
      </div>
      
    </div>
  );
}