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
type UploadStatus = { type: 'success' | 'error'; message: string } | null;

// --- CHAT BUBBLE COMPONENT ---
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


// --- MAIN APP COMPONENT ---
export default function Chat() {
  const router = useRouter();
  const supabase = createClient();

  // Navigation State
  const [activeTab, setActiveTab] = useState<'chat' | 'calculator'>('chat');

  // Chat States
  const [messages, setMessages] = useState<Message[]>([]);
  const [myInput, setMyInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>(null);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  
  // Calculator States
  const [fck, setFck] = useState<number>(25);
  const [stdDev, setStdDev] = useState<number>(4);
  const [wcRatio, setWcRatio] = useState<number>(0.50);
  const [sgCement, setSgCement] = useState<number>(3.15);
  const [sgFA, setSgFA] = useState<number>(2.74);
  const [sgCA, setSgCA] = useState<number>(2.74);
  const [waterContent, setWaterContent] = useState<number>(186); // kg/m3
  const [mixResult, setMixResult] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

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
      if (!res.ok) throw new Error(await res.text());
      setUploadedFiles(prev => [...new Set([...prev, file.name])]);
      setUploadStatus({ type: 'success', message: 'Document added to memory.' });
      setTimeout(() => setUploadStatus(null), 5000);
    } catch (error: any) {
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

  // --- MIX CALCULATOR LOGIC ---
  const calculateMix = () => {
    // 1. Target Mean Strength
    const targetStrength = fck + 1.65 * stdDev;
    
    // 2. Cement Content
    const cement = waterContent / wcRatio;

    // 3. Absolute Volume Method
    const volCement = cement / (sgCement * 1000);
    const volWater = waterContent / 1000;
    
    // Assuming 2% entrapped air for 20mm aggregate
    const airVolume = 0.02; 
    
    // Volume available for aggregates
    const volAggregates = 1 - (volCement + volWater + airVolume);

    // Assuming CA is 60% and FA is 40% of total aggregate volume (Standard assumption for Zone II)
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
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      
      {/* --- COLUMN 1: LEFT SIDEBAR --- */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col hidden md:flex flex-shrink-0">
        <div className="p-4 flex items-center gap-3 border-b border-slate-800">
          <span className="text-2xl">🏗️</span>
          <h1 className="text-xl font-bold tracking-wide text-white">Civil<span className="text-amber-500">GPT</span></h1>
        </div>
        
        <div className="flex-1 p-4 space-y-2 overflow-y-auto">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Tools</h3>
          
          <button 
            onClick={() => setActiveTab('chat')}
            className={`w-full text-left text-sm py-3 px-4 rounded-xl transition-all flex items-center gap-3 ${activeTab === 'chat' ? 'bg-amber-500 text-white shadow-md' : 'hover:bg-slate-800'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
            AI Assistant
          </button>
          
          <button 
            onClick={() => setActiveTab('calculator')}
            className={`w-full text-left text-sm py-3 px-4 rounded-xl transition-all flex items-center gap-3 ${activeTab === 'calculator' ? 'bg-amber-500 text-white shadow-md' : 'hover:bg-slate-800'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.502-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V18Zm-9.75-9.75h14.25v-.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v.75Zm0 0H19.5m-13.5 0v11.25c0 1.242 1.008 2.25 2.25 2.25h11.25c1.242 0 2.25-2.25V6m-13.5 0h13.5" />
            </svg>
            Design Mix (IS 10262)
          </button>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button onClick={handleLogout} className="w-full py-2 px-3 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg flex items-center justify-center gap-2 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
            Log Out
          </button>
        </div>
      </aside>

      {/* --- COLUMN 2: CENTER VIEWPORT --- */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative shadow-2xl z-10">
        
        <header className="md:hidden bg-slate-900 text-white py-4 px-6 shadow-md flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏗️</span>
            <h1 className="text-lg font-bold tracking-wide">Civil<span className="text-amber-500">GPT</span></h1>
          </div>
        </header>

        {/* ------------------------------- */}
        {/* VIEW 1: CHAT INTERFACE          */}
        {/* ------------------------------- */}
        {activeTab === 'chat' && (
          <>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 w-full max-w-4xl mx-auto space-y-6">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 text-slate-500">
                  <div className="w-20 h-20 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-4xl shadow-sm">
                    📐
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-700">Ready to design.</h2>
                  <p className="max-w-md">Ask CivilGPT about structural analysis, load calculations, or upload codes to memorize.</p>
                </div>
              )}

              {messages.map((m, index) => (
                <MessageBubble key={m.id} m={m} isTyping={isLoading && index === messages.length - 1 && m.role === 'assistant'} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 max-w-4xl mx-auto w-full flex flex-col gap-3">
              {(uploadStatus || uploadedFiles.length > 0) && (
                <div className="flex flex-wrap items-center gap-2 px-1">
                  {uploadStatus && (
                    <span className={`text-xs px-2.5 py-1.5 rounded-lg font-medium border ${uploadStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                      {uploadStatus.message}
                    </span>
                  )}
                  {uploadedFiles.map((file, idx) => (
                    <span key={idx} className="text-xs bg-white border border-slate-200 text-slate-600 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm">
                      📎 {file}
                    </span>
                  ))}
                </div>
              )}

              <form onSubmit={customHandleSubmit} className="relative flex items-center shadow-sm rounded-2xl bg-white border border-slate-200 transition-all focus-within:border-amber-400 focus-within:shadow-md">
                <input type="file" accept="application/pdf" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading || isLoading} className="absolute left-2 text-slate-400 hover:text-amber-500 hover:bg-slate-50 p-2 rounded-xl transition-colors bottom-2 h-10 w-10">
                  {isUploading ? "⏳" : "📎"}
                </button>
                <textarea className="w-full bg-transparent text-slate-900 rounded-2xl pl-14 pr-14 py-4 focus:outline-none resize-none min-h-[56px] max-h-[200px]" rows={1} value={myInput} placeholder="Type your engineering query here..." onChange={(e) => setMyInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); customHandleSubmit(); } }} disabled={isLoading} />
                <button type="submit" disabled={myInput.trim() === "" || isLoading} className="absolute right-2 bg-amber-500 text-white p-2.5 rounded-xl hover:bg-amber-600 transition-colors h-10 w-10 bottom-2">
                  ▲
                </button>
              </form>
            </div>
          </>
        )}

        {/* ------------------------------- */}
        {/* VIEW 2: CALCULATOR INTERFACE    */}
        {/* ------------------------------- */}
        {activeTab === 'calculator' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 w-full max-w-5xl mx-auto">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
              <div className="border-b border-slate-200 pb-5 mb-8">
                <h2 className="text-2xl font-bold text-slate-900">Concrete Mix Design Calculator</h2>
                <p className="text-slate-500 mt-1">Based on standard IS 10262:2019 absolute volume method.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                
                {/* Inputs Section */}
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Target Grade of Concrete (fck)</label>
                    <select value={fck} onChange={e => setFck(Number(e.target.value))} className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-amber-500 outline-none">
                      <option value={20}>M20</option>
                      <option value={25}>M25</option>
                      <option value={30}>M30</option>
                      <option value={40}>M40</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Assumed Standard Deviation (s) - N/mm²</label>
                    <input type="number" step="0.1" value={stdDev} onChange={e => setStdDev(Number(e.target.value))} className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Water-Cement Ratio</label>
                    <input type="number" step="0.01" value={wcRatio} onChange={e => setWcRatio(Number(e.target.value))} className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Sp. Gravity (Cement)</label>
                      <input type="number" step="0.01" value={sgCement} onChange={e => setSgCement(Number(e.target.value))} className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-amber-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Max Water Content</label>
                      <input type="number" value={waterContent} onChange={e => setWaterContent(Number(e.target.value))} className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-amber-500 outline-none" placeholder="kg/m³" />
                    </div>
                  </div>

                  <button onClick={calculateMix} className="w-full py-4 mt-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-md">
                    Calculate Proportions
                  </button>
                </div>

                {/* Results Section */}
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 h-full">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6">Output Proportions per m³</h3>
                  
                  {mixResult ? (
                    <div className="space-y-6">
                      <div className="flex justify-between items-end border-b border-slate-200 pb-3">
                        <span className="font-medium text-slate-600">Target Mean Strength ($f_m$)</span>
                        <span className="text-xl font-bold text-slate-900">{mixResult.targetStrength} N/mm²</span>
                      </div>
                      <div className="flex justify-between items-end border-b border-slate-200 pb-3">
                        <span className="font-medium text-slate-600">Cement</span>
                        <span className="text-xl font-bold text-amber-600">{mixResult.cement} kg</span>
                      </div>
                      <div className="flex justify-between items-end border-b border-slate-200 pb-3">
                        <span className="font-medium text-slate-600">Water</span>
                        <span className="text-xl font-bold text-blue-600">{mixResult.water} kg</span>
                      </div>
                      <div className="flex justify-between items-end border-b border-slate-200 pb-3">
                        <span className="font-medium text-slate-600">Fine Aggregate (FA)</span>
                        <span className="text-xl font-bold text-slate-900">{mixResult.fa} kg</span>
                      </div>
                      <div className="flex justify-between items-end border-b border-slate-200 pb-3">
                        <span className="font-medium text-slate-600">Coarse Aggregate (CA)</span>
                        <span className="text-xl font-bold text-slate-900">{mixResult.ca} kg</span>
                      </div>

                      <div className="pt-4 bg-amber-50 p-4 rounded-xl border border-amber-200 text-center mt-6">
                        <p className="text-xs text-amber-700 font-semibold uppercase mb-1">Mix Ratio (C : FA : CA)</p>
                        <p className="text-2xl font-bold text-amber-900">{mixResult.ratio}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center space-y-3 pb-12">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.502-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V18Zm-9.75-9.75h14.25v-.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v.75Zm0 0H19.5m-13.5 0v11.25c0 1.242 1.008 2.25 2.25 2.25h11.25c1.242 0 2.25-2.25V6m-13.5 0h13.5" />
                      </svg>
                      <p>Adjust your parameters and click calculate to view the mix proportions.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}