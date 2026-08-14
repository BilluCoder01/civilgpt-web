"use client";

import { useRef, useEffect, useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';

type Message = { id: string; role: 'user' | 'assistant'; content: string };
type UploadStatus = { type: 'success' | 'error'; message: string } | null;

const MessageBubble = memo(({ m, isTyping }: { m: Message; isTyping?: boolean }) => {
  return (
    <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-5 py-4 shadow-sm ${
          m.role === 'user' 
            ? 'bg-amber-500 text-white rounded-br-none' 
            : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none overflow-x-auto'
        }`}
      >
        <div className="font-semibold text-xs mb-1 opacity-75">
          {m.role === 'user' ? 'You' : 'CivilGPT'}
        </div>
        
        <div className={`leading-relaxed text-sm sm:text-base ${isTyping ? 'typing-cursor' : ''}`}>
          {m.role === 'user' ? (
            <div className="whitespace-pre-wrap">{m.content}</div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkMath, remarkGfm]}
              rehypePlugins={[rehypeKatex]}
              components={{
                h1: ({node, ...props}) => <h1 className="text-2xl font-bold mt-6 mb-4 text-slate-900 border-b border-slate-200 pb-2" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-xl font-bold mt-6 mb-3 text-slate-900" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-lg font-bold mt-5 mb-3 text-slate-900" {...props} />,
                p: ({node, ...props}) => <p className="mb-4 leading-relaxed" {...props} />,
                ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-6 space-y-2" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal pl-6 mb-6 space-y-2" {...props} />,
                li: ({node, ...props}) => <li className="leading-relaxed" {...props} />,
                strong: ({node, ...props}) => <strong className="font-semibold text-amber-700" {...props} />,
                hr: ({node, ...props}) => <hr className="my-6 border-slate-300" {...props} />,
                table: ({node, ...props}) => (
                  <div className="overflow-x-auto my-6">
                    <table className="w-full text-left border-collapse min-w-full" {...props} />
                  </div>
                ),
                thead: ({node, ...props}) => <thead className="bg-slate-100 border-b-2 border-slate-300" {...props} />,
                th: ({node, ...props}) => <th className="py-3 px-4 font-semibold text-slate-800 border-r last:border-r-0 border-slate-200 whitespace-nowrap" {...props} />,
                td: ({node, ...props}) => <td className="py-3 px-4 border-b border-r last:border-r-0 border-slate-200" {...props} />,
                tbody: ({node, ...props}) => <tbody className="divide-y divide-slate-200" {...props} />,
              }}
            >
              {m.content}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [myInput, setMyInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>(null);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/chat', { 
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) {
        throw new Error(await res.text());
      }
      
      setUploadedFiles(prev => [...new Set([...prev, file.name])]);
      setUploadStatus({ type: 'success', message: 'Document added to AI memory.' });
      
      setTimeout(() => setUploadStatus(null), 5000);
      
    } catch (error: any) {
      console.error("Upload Error:", error);
      let errorMsg = error.message;
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.error) errorMsg = parsed.error;
      } catch {}
      
      setUploadStatus({ type: 'error', message: errorMsg });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const customHandleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!myInput.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: myInput };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setMyInput("");
    setIsLoading(true);

    const aiMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: aiMsgId, role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!response.ok) {
        const exactError = await response.text();
        setMessages((prev) => prev.map((msg) => msg.id === aiMsgId ? { ...msg, content: `⚠️ ${exactError}` } : msg));
        setIsLoading(false);
        return;
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let currentAiText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

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
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      
      <style>{`
        .typing-cursor > *:last-child::after,
        .typing-cursor:empty::after {
          content: ' ▋';
          animation: blink 1s step-end infinite;
          color: #f59e0b;
          margin-left: 0.25rem;
          display: inline-block;
          vertical-align: bottom;
        }
        @keyframes blink { 
          0%, 100% { opacity: 1; }
          50% { opacity: 0; } 
        }
      `}</style>

      {/* --- COLUMN 1: LEFT SIDEBAR --- */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex-col hidden md:flex flex-shrink-0">
        <div className="p-4 flex items-center gap-3 border-b border-slate-800">
          <span className="text-2xl">🏗️</span>
          <h1 className="text-xl font-bold tracking-wide text-white">Civil<span className="text-amber-500">GPT</span></h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Today</h3>
            <button className="w-full text-left text-sm py-2 px-3 hover:bg-slate-800 rounded-lg transition-colors truncate">
              Water Quality Parameters
            </button>
            <button className="w-full text-left text-sm py-2 px-3 hover:bg-slate-800 rounded-lg transition-colors truncate">
              Concrete Curing Process
            </button>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Previous Projects</h3>
            <button className="w-full text-left text-sm py-2 px-3 hover:bg-slate-800 rounded-lg transition-colors truncate opacity-60">
              Axial Stress Formulas
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
            ME
          </div>
          <span className="text-sm font-medium">Engineer Mode</span>
        </div>
      </aside>

      {/* --- COLUMN 2: CENTER CHAT --- */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative shadow-2xl z-10">
        <header className="md:hidden bg-slate-900 text-white py-4 px-6 shadow-md flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏗️</span>
            <h1 className="text-lg font-bold tracking-wide">Civil<span className="text-amber-500">GPT</span></h1>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 w-full max-w-4xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 text-slate-500">
              <div className="w-20 h-20 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-4xl shadow-sm">
                📐
              </div>
              <h2 className="text-2xl font-semibold text-slate-700">Ready to design.</h2>
              <p className="max-w-md">Ask CivilGPT about structural analysis, load calculations, or concrete design codes.</p>
            </div>
          )}

          {messages.map((m, index) => (
            <MessageBubble 
              key={m.id} 
              m={m} 
              isTyping={isLoading && index === messages.length - 1 && m.role === 'assistant'} 
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT AREA */}
        <div className="p-4 max-w-4xl mx-auto w-full flex flex-col gap-3">
          
          {/* File Indicators */}
          {(uploadStatus || uploadedFiles.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 px-1">
              {uploadStatus && (
                <span className={`text-xs px-2.5 py-1.5 rounded-lg font-medium border ${
                  uploadStatus.type === 'success' 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                    : 'bg-red-50 text-red-700 border-red-200'
                }`}>
                  {uploadStatus.message}
                </span>
              )}
              {uploadedFiles.map((file, idx) => (
                <span key={idx} className="text-xs bg-white border border-slate-200 text-slate-600 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-amber-500">
                    <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
                  </svg>
                  {file}
                </span>
              ))}
            </div>
          )}

          <form onSubmit={customHandleSubmit} className="relative flex items-center shadow-sm rounded-2xl bg-white border border-slate-200 transition-all focus-within:border-amber-400 focus-within:shadow-md">
            
            {/* Hidden File Input */}
            <input 
              type="file" 
              accept="application/pdf" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
            />

            {/* Left Upload Button */}
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isLoading}
              className="absolute left-2 text-slate-400 hover:text-amber-500 hover:bg-slate-50 p-2 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed bottom-2 flex items-center justify-center h-10 w-10"
              title="Attach PDF"
            >
              {isUploading ? (
                <svg className="animate-spin h-5 w-5 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                </svg>
              )}
            </button>

            {/* Chat Input Textarea */}
            <textarea
              className="w-full bg-transparent text-slate-900 rounded-2xl pl-14 pr-14 py-4 focus:outline-none resize-none min-h-[56px] max-h-[200px]"
              rows={1}
              value={myInput}
              placeholder="Type your engineering query here..."
              onChange={(e) => setMyInput(e.target.value)} 
              onKeyDown={onKeyDown}
              disabled={isLoading}
            />

            {/* Right Send Button */}
            <button 
              type="submit" 
              disabled={myInput.trim() === "" || isLoading}
              className="absolute right-2 bg-amber-500 text-white p-2.5 rounded-xl hover:bg-amber-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors h-10 w-10 flex items-center justify-center bottom-2 shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
              </svg>
            </button>
          </form>
          
          <div className="text-center mt-1 text-xs text-slate-400 font-medium">
            CivilGPT can make mistakes. Verify critical calculations.
          </div>
        </div>
      </main>
    </div>
  );
}