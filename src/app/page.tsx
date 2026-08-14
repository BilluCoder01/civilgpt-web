"use client";

import { useRef, useEffect, useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

type Message = { id: string; role: 'user' | 'assistant'; content: string };
type Session = { id: string; title: string; created_at: string };
type UploadStatus = { type: 'success' | 'error'; message: string } | null;

// --- GEMINI-STYLE CHAT BUBBLES ---
const MessageBubble = memo(({ m, isTyping }: { m: Message; isTyping?: boolean }) => {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end mb-8">
        <div className="bg-[#f0f4f9] text-slate-800 px-6 py-3.5 rounded-[24px] rounded-br-sm max-w-[85%] md:max-w-[70%] text-[15px] leading-relaxed shadow-sm">
          <div className="whitespace-pre-wrap">{m.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-4 mb-8">
      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-lg shrink-0 mt-1 shadow-sm border border-amber-200">
        🏗️
      </div>
      <div className={`flex-1 max-w-[90%] md:max-w-[80%] text-[15px] text-slate-800 leading-relaxed ${isTyping ? 'typing-cursor' : ''}`}>
        <ReactMarkdown
          remarkPlugins={[remarkMath, remarkGfm]}
          rehypePlugins={[rehypeKatex]}
          components={{
            h1: ({node, ...props}) => <h1 className="text-2xl font-semibold mt-6 mb-4 text-slate-900" {...props} />,
            h2: ({node, ...props}) => <h2 className="text-xl font-semibold mt-5 mb-3 text-slate-900" {...props} />,
            h3: ({node, ...props}) => <h3 className="text-lg font-medium mt-4 mb-2 text-slate-900" {...props} />,
            p: ({node, ...props}) => <p className="mb-4" {...props} />,
            ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-1.5 marker:text-slate-400" {...props} />,
            ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-1.5 marker:text-slate-400" {...props} />,
            strong: ({node, ...props}) => <strong className="font-semibold text-slate-900" {...props} />,
            table: ({node, ...props}) => (
              <div className="overflow-x-auto my-6 rounded-2xl border border-slate-200">
                <table className="w-full text-left border-collapse" {...props} />
              </div>
            ),
            thead: ({node, ...props}) => <thead className="bg-[#f0f4f9] border-b border-slate-200" {...props} />,
            th: ({node, ...props}) => <th className="py-3 px-4 font-medium text-slate-700 whitespace-nowrap" {...props} />,
            td: ({node, ...props}) => <td className="py-3 px-4 border-b border-slate-100" {...props} />,
          }}
        >
          {m.content}
        </ReactMarkdown>
      </div>
    </div>
  );
});
MessageBubble.displayName = 'MessageBubble';

export default function Chat() {
  const router = useRouter();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<'chat' | 'calculator'>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); 
  
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [myInput, setMyInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>(null);
  const [isFetchingHistory, setIsFetchingHistory] = useState(true);
  
  const [fck, setFck] = useState<number>(25);
  const [stdDev, setStdDev] = useState<number>(4);
  const [wcRatio, setWcRatio] = useState<number>(0.50);
  const [sgCement, setSgCement] = useState<number>(3.15);
  const [sgFA, setSgFA] = useState<number>(2.74);
  const [sgCA, setSgCA] = useState<number>(2.74);
  const [waterContent, setWaterContent] = useState<number>(186); 
  const [mixResult, setMixResult] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-close sidebar on mobile
  useEffect(() => {
    const handleResize = () => { if (window.innerWidth < 768) setIsSidebarOpen(false); else setIsSidebarOpen(true); };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const loadChatHistory = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: allSessions } = await supabase
        .from('chat_sessions')
        .select('id, title, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (allSessions && allSessions.length > 0) {
        setSessions(allSessions);
        setActiveSessionId(allSessions[0].id);
        
        const { data: dbMessages } = await supabase
          .from('messages')
          .select('id, role, content')
          .eq('session_id', allSessions[0].id)
          .order('created_at', { ascending: true });

        if (dbMessages) setMessages(dbMessages as Message[]);
      }
      setIsFetchingHistory(false);
    };
    loadChatHistory();
  }, [supabase]);

  const loadSpecificSession = async (sessionId: string) => {
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    setActiveTab('chat');
    setActiveSessionId(sessionId);
    setIsFetchingHistory(true);
    setMessages([]);

    const { data: dbMessages } = await supabase
      .from('messages')
      .select('id, role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (dbMessages) setMessages(dbMessages as Message[]);
    setIsFetchingHistory(false);
  };

  useEffect(() => {
    if (activeTab === 'chat') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleNewChat = () => {
    setMessages([]);
    setActiveSessionId(null);
    setActiveTab('chat');
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/chat', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      setUploadStatus({ type: 'success', message: 'PDF Memorized.' });
      setTimeout(() => setUploadStatus(null), 3000);
    } catch (error: any) {
      setUploadStatus({ type: 'error', message: 'Failed to read PDF.' });
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
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let currentAiText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        currentAiText += decoder.decode(value, { stream: true });
        setMessages((prev) => prev.map((msg) => msg.id === aiMsgId ? { ...msg, content: currentAiText } : msg));
      }
    } catch (error) {
      setMessages((prev) => prev.map((msg) => msg.id === aiMsgId ? { ...msg, content: "⚠️ Stream failed." } : msg));
    } finally {
      setIsLoading(false); 
    }
  };

  const calculateMix = () => {
    const targetStrength = fck + 1.65 * stdDev;
    const cement = waterContent / wcRatio;
    const volCement = cement / (sgCement * 1000);
    const volWater = waterContent / 1000;
    const airVolume = 0.02; 
    const volAggregates = 1 - (volCement + volWater + airVolume);
    const volCA = volAggregates * 0.60;
    const volFA = volAggregates * 0.40;
    const massCA = volCA * sgCA * 1000;
    const massFA = volFA * sgFA * 1000;

    setMixResult({
      targetStrength: targetStrength.toFixed(2),
      cement: cement.toFixed(2),
      water: waterContent.toFixed(2),
      fa: massFA.toFixed(2),
      ca: massCA.toFixed(2),
      ratio: `1 : ${(massFA/cement).toFixed(2)} : ${(massCA/cement).toFixed(2)}`
    });
  };

  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden">
      
      {/* --- FIXED HAMBURGER BUTTON (Always Top Left) --- */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
        className="fixed top-3 left-4 z-[60] p-3 rounded-full hover:bg-[#e8eaed] text-slate-600 transition-colors"
        aria-label="Toggle Menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* --- MOBILE OVERLAY --- */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 md:hidden transition-opacity" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* --- GEMINI-STYLE SIDEBAR --- */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 md:relative bg-[#f0f4f9] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${isSidebarOpen ? 'w-[280px] translate-x-0' : 'w-0 -translate-x-full md:translate-x-0'} flex-shrink-0`}
      >
        <div className="w-[280px] h-full flex flex-col overflow-hidden">
          
          {/* Header Space for Hamburger */}
          <div className="h-[72px] pl-[72px] flex items-center shrink-0">
             <span className="text-xl font-medium text-slate-600 tracking-wide select-none">CivilGPT</span>
          </div>

          {/* New Chat Button */}
          <div className="px-4 py-2 shrink-0">
            <button 
              onClick={handleNewChat}
              className="flex items-center gap-3 bg-[#e8eaed] hover:bg-[#dce0e3] text-slate-700 rounded-[16px] py-3.5 px-4 w-[160px] transition-all duration-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 shrink-0 text-slate-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="font-medium text-sm">New chat</span>
            </button>
          </div>
          
          {/* Recent History */}
          <div className="flex-1 overflow-y-auto mt-4 px-3 space-y-0.5 pb-4">
             <h3 className="text-[13px] font-medium text-slate-500 px-3 mb-2">Recent</h3>
             
             {/* Tools nested in Recent for clean UX */}
             <button 
                onClick={() => { setActiveTab('chat'); if (window.innerWidth < 768) setIsSidebarOpen(false); }}
                className={`w-full text-left text-[14px] py-2.5 px-3 rounded-full transition-colors flex items-center gap-3 truncate ${activeTab === 'chat' ? 'bg-[#dce0e3] text-slate-900 font-medium' : 'text-slate-700 hover:bg-[#e8eaed]'}`}
              >
                <span className="w-4 flex justify-center text-amber-500 shrink-0">✦</span>
                <span className="truncate">AI Assistant</span>
              </button>

              <button 
                onClick={() => { setActiveTab('calculator'); if (window.innerWidth < 768) setIsSidebarOpen(false); }}
                className={`w-full text-left text-[14px] py-2.5 px-3 mb-4 rounded-full transition-colors flex items-center gap-3 truncate ${activeTab === 'calculator' ? 'bg-[#dce0e3] text-slate-900 font-medium' : 'text-slate-700 hover:bg-[#e8eaed]'}`}
              >
                <span className="w-4 flex justify-center text-slate-500 shrink-0">🧮</span>
                <span className="truncate">Design Mix IS 10262</span>
              </button>

             {sessions.length === 0 && !isFetchingHistory ? (
                <div className="text-slate-500 text-sm px-3 mt-4">No previous chats.</div>
             ) : (
               sessions.map((session) => (
                 <button 
                   key={session.id} 
                   onClick={() => loadSpecificSession(session.id)}
                   className={`w-full text-left text-[14px] py-2.5 px-3 rounded-full transition-colors flex items-center gap-3 truncate ${activeSessionId === session.id && activeTab === 'chat' ? 'bg-[#dce0e3] text-slate-900 font-medium' : 'text-slate-600 hover:bg-[#e8eaed]'}`}
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 shrink-0 text-slate-400">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.436 3 11.996c0 2.29.982 4.367 2.584 5.86.32.298.54.69.58 1.102l.27 2.842a.8.8 0 0 0 1.25.59l2.76-1.74a.8.8 0 0 1 .45-.14 9.1 9.1 0 0 0 1.1.07Z" />
                   </svg>
                   <span className="truncate">{session.title || 'Engineering Workspace'}</span>
                 </button>
               ))
             )}
          </div>

          {/* User / Settings Footer */}
          <div className="p-3 shrink-0">
            <button onClick={handleLogout} className="w-full py-2.5 px-3 text-[14px] text-slate-600 hover:bg-[#e8eaed] rounded-full flex items-center gap-3 transition-colors">
              <div className="w-6 h-6 rounded-full bg-slate-300 flex items-center justify-center text-white text-xs shrink-0">
                U
              </div>
              <span className="truncate flex-1 text-left">Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 flex flex-col relative h-full min-w-0 transition-all duration-300">
        
        {/* Top spacing to account for fixed hamburger on mobile/desktop */}
        <div className="h-[72px] shrink-0 w-full flex items-center md:hidden pl-[72px]">
           {!isSidebarOpen && <span className="text-xl font-medium text-slate-600 tracking-wide select-none">CivilGPT</span>}
        </div>
        
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col relative overflow-hidden h-full">
            
            {/* Scrollable Chat Area */}
            <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-32">
              <div className="max-w-3xl mx-auto w-full">
                
                {isFetchingHistory ? (
                  <div className="flex items-center justify-center h-full pt-20">
                    <span className="animate-spin text-3xl text-[#e8eaed]">⏳</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col h-full text-left space-y-4 pt-[15vh]">
                    <h2 className="text-4xl font-medium text-[#c4c7c5] tracking-tight mb-2">Hello, Engineer.</h2>
                    <p className="text-2xl font-medium text-[#c4c7c5] max-w-xl leading-relaxed">How can I help you with your structural analysis today?</p>
                  </div>
                ) : (
                  messages.map((m, index) => (
                    <MessageBubble key={m.id} m={m} isTyping={isLoading && index === messages.length - 1 && m.role === 'assistant'} />
                  ))
                )}
                <div ref={messagesEndRef} className="h-4" />
              </div>
            </div>

            {/* Floating Pill Input Box */}
            <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-white via-white to-transparent pt-6 pb-6 px-4 md:px-8">
              <div className="max-w-3xl mx-auto w-full">
                
                {uploadStatus && (
                  <div className={`mb-3 text-[13px] px-4 py-2 rounded-full inline-flex font-medium shadow-sm ${uploadStatus.type === 'success' ? 'bg-[#e6f4ea] text-[#137333]' : 'bg-[#fce8e6] text-[#c5221f]'}`}>
                    {uploadStatus.message}
                  </div>
                )}

                <form onSubmit={customHandleSubmit} className="relative flex items-end bg-[#f0f4f9] rounded-[32px] p-2 pr-4 transition-all focus-within:bg-white focus-within:shadow-md border border-transparent focus-within:border-slate-200">
                  
                  <input type="file" accept="application/pdf" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()} 
                    disabled={isUploading || isLoading} 
                    className="p-3 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-full transition-colors shrink-0 mb-0.5 ml-1"
                    title="Upload IS Code PDF"
                  >
                    {isUploading ? "⏳" : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    )}
                  </button>
                  
                  <textarea 
                    className="flex-1 bg-transparent text-slate-800 placeholder-slate-500 text-[16px] px-3 py-3.5 focus:outline-none resize-none min-h-[52px] max-h-[200px]" 
                    rows={1} 
                    value={myInput} 
                    placeholder="Ask about codes, mix proportions, or loads..." 
                    onChange={(e) => setMyInput(e.target.value)} 
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); customHandleSubmit(); } }} 
                    disabled={isLoading} 
                  />
                  
                  <button 
                    type="submit" 
                    disabled={myInput.trim() === "" || isLoading} 
                    className={`p-3 rounded-full shrink-0 mb-0.5 transition-colors ${myInput.trim() === "" || isLoading ? 'text-slate-300' : 'text-slate-800 hover:bg-slate-200/50'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                      <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                    </svg>
                  </button>

                </form>
                <div className="text-center mt-3 text-[11px] text-slate-400">
                  CivilGPT can make mistakes. Verify critical structural calculations against IS Codes.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- CALCULATOR INTERFACE --- */}
        {activeTab === 'calculator' && (
          <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-12 h-full">
            <div className="max-w-4xl mx-auto w-full">
              <div className="bg-white border border-slate-200 rounded-[32px] p-8 md:p-10 shadow-sm">
                <div className="mb-8">
                  <h2 className="text-3xl font-medium text-slate-800 tracking-tight">Mix Design Calculator</h2>
                  <p className="text-slate-500 mt-2 text-[15px]">IS 10262:2019 Absolute Volume Method</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
                  
                  {/* Inputs */}
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[14px] font-medium text-slate-700 mb-2">Target Grade (fck)</label>
                      <select value={fck} onChange={e => setFck(Number(e.target.value))} className="w-full p-3.5 rounded-[16px] border border-slate-200 bg-[#f0f4f9] focus:bg-white focus:ring-2 focus:ring-slate-300 outline-none text-[15px] transition-colors">
                        <option value={20}>M20</option>
                        <option value={25}>M25</option>
                        <option value={30}>M30</option>
                        <option value={40}>M40</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[14px] font-medium text-slate-700 mb-2">Standard Deviation (s) - N/mm²</label>
                      <input type="number" step="0.1" value={stdDev} onChange={e => setStdDev(Number(e.target.value))} className="w-full p-3.5 rounded-[16px] border border-slate-200 bg-[#f0f4f9] focus:bg-white focus:ring-2 focus:ring-slate-300 outline-none text-[15px] transition-colors" />
                    </div>

                    <div>
                      <label className="block text-[14px] font-medium text-slate-700 mb-2">Water-Cement Ratio</label>
                      <input type="number" step="0.01" value={wcRatio} onChange={e => setWcRatio(Number(e.target.value))} className="w-full p-3.5 rounded-[16px] border border-slate-200 bg-[#f0f4f9] focus:bg-white focus:ring-2 focus:ring-slate-300 outline-none text-[15px] transition-colors" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[14px] font-medium text-slate-700 mb-2">Sp. Gravity (Cement)</label>
                        <input type="number" step="0.01" value={sgCement} onChange={e => setSgCement(Number(e.target.value))} className="w-full p-3.5 rounded-[16px] border border-slate-200 bg-[#f0f4f9] focus:bg-white focus:ring-2 focus:ring-slate-300 outline-none text-[15px] transition-colors" />
                      </div>
                      <div>
                        <label className="block text-[14px] font-medium text-slate-700 mb-2">Max Water (kg/m³)</label>
                        <input type="number" value={waterContent} onChange={e => setWaterContent(Number(e.target.value))} className="w-full p-3.5 rounded-[16px] border border-slate-200 bg-[#f0f4f9] focus:bg-white focus:ring-2 focus:ring-slate-300 outline-none text-[15px] transition-colors" />
                      </div>
                    </div>

                    <button onClick={calculateMix} className="w-full py-4 mt-2 bg-slate-800 text-white rounded-[24px] font-medium text-[15px] hover:bg-slate-700 transition-colors shadow-sm">
                      Calculate Proportions
                    </button>
                  </div>

                  {/* Results */}
                  <div className="bg-[#f0f4f9] rounded-[24px] p-8 h-full">
                    <h3 className="text-[13px] font-medium text-slate-500 uppercase tracking-wider mb-6">Output per m³</h3>
                    
                    {mixResult ? (
                      <div className="space-y-5">
                        <div className="flex justify-between items-end border-b border-slate-200/60 pb-3">
                          <span className="text-[15px] text-slate-600">Target Mean Strength ($f_m$)</span>
                          <span className="text-lg font-medium text-slate-800">{mixResult.targetStrength} N/mm²</span>
                        </div>
                        <div className="flex justify-between items-end border-b border-slate-200/60 pb-3">
                          <span className="text-[15px] text-slate-600">Cement</span>
                          <span className="text-lg font-medium text-slate-800">{mixResult.cement} kg</span>
                        </div>
                        <div className="flex justify-between items-end border-b border-slate-200/60 pb-3">
                          <span className="text-[15px] text-slate-600">Water</span>
                          <span className="text-lg font-medium text-slate-800">{mixResult.water} kg</span>
                        </div>
                        <div className="flex justify-between items-end border-b border-slate-200/60 pb-3">
                          <span className="text-[15px] text-slate-600">Fine Aggregate (FA)</span>
                          <span className="text-lg font-medium text-slate-800">{mixResult.fa} kg</span>
                        </div>
                        <div className="flex justify-between items-end border-b border-slate-200/60 pb-3">
                          <span className="text-[15px] text-slate-600">Coarse Aggregate (CA)</span>
                          <span className="text-lg font-medium text-slate-800">{mixResult.ca} kg</span>
                        </div>

                        <div className="pt-6 mt-6">
                          <p className="text-[13px] text-slate-500 mb-1 font-medium">Mix Ratio (C : FA : CA)</p>
                          <p className="text-3xl font-medium text-slate-800 tracking-tight">{mixResult.ratio}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center space-y-3 pb-12">
                        <p className="text-[15px]">Adjust your parameters and click calculate to view the mix proportions.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}