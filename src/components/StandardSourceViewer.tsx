"use client";

import { useState, useEffect } from "react";

interface StandardSourceViewerProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  page: number;
  title: string;
  citation: string;
  isDarkMode: boolean;
}

export default function StandardSourceViewer({
  isOpen,
  onClose,
  documentId,
  page,
  title,
  citation,
  isDarkMode,
}: StandardSourceViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !documentId) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    const fetchPdf = async () => {
      try {
        const res = await fetch("/api/standards/source", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId, page }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to load document source");
        }

        const data = await res.json();
        
        if (isMounted && data.url) {
          // Append the physical page hash to force the PDF viewer to jump
          setUrl(`${data.url}#page=${page}`);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchPdf();

    return () => {
      isMounted = false;
    };
  }, [isOpen, documentId, page]);

  return (
    <div
      className={`fixed inset-y-0 right-0 z-[70] md:relative flex flex-col h-screen transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] shrink-0 border-l ${
        isDarkMode ? "bg-[#1e1f20] border-slate-700" : "bg-[#f8f9fa] border-slate-200"
      } ${
        isOpen
          ? "w-full md:w-[450px] lg:w-[500px] xl:w-[600px] translate-x-0"
          : "w-[0px] translate-x-full opacity-0 border-transparent"
      }`}
    >
      {isOpen && (
        <div className="flex flex-col w-screen md:w-[450px] lg:w-[500px] xl:w-[600px] h-full">
          {/* HEADER */}
          <div
            className={`flex items-center justify-between px-5 py-3.5 shrink-0 border-b shadow-sm z-10 ${
              isDarkMode ? "border-slate-700 bg-[#1e1f20]" : "border-slate-200 bg-white"
            }`}
          >
            <div className="min-w-0 pr-4">
              <h3
                className={`text-[14px] font-bold truncate ${
                  isDarkMode ? "text-slate-200" : "text-slate-800"
                }`}
              >
                {title || "Document Source"}
              </h3>
              {citation && (
                <p
                  className={`text-[12px] truncate mt-0.5 font-medium ${
                    isDarkMode ? "text-amber-400" : "text-amber-600"
                  }`}
                >
                  {citation}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-2 rounded-xl transition-colors ${
                    isDarkMode
                      ? "hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                      : "hover:bg-slate-100 text-slate-500 hover:text-slate-800"
                  }`}
                  title="Open in standalone tab"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              )}
              <button
                onClick={onClose}
                className={`p-2 rounded-xl transition-colors ${
                  isDarkMode
                    ? "hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                    : "hover:bg-slate-100 text-slate-500 hover:text-slate-800"
                }`}
                title="Close sidebar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* VIEWER BODY */}
          <div className="flex-1 relative flex items-center justify-center bg-black/5">
            {isLoading && (
              <div className="flex flex-col items-center gap-4">
                <span className="animate-spin text-3xl">⏳</span>
                <span
                  className={`text-[11px] font-bold uppercase tracking-widest ${
                    isDarkMode ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  Decrypting & Loading Document...
                </span>
              </div>
            )}

            {error && !isLoading && (
              <div
                className={`p-5 mx-6 rounded-2xl border text-center shadow-sm ${
                  isDarkMode
                    ? "bg-red-900/20 border-red-900/50 text-red-400"
                    : "bg-red-50 border-red-200 text-red-600"
                }`}
              >
                <p className="text-[14px] font-bold mb-1.5">Failed to open source</p>
                <p className="text-[13px] opacity-90 leading-relaxed">{error}</p>
              </div>
            )}

            {url && !isLoading && !error && (
              <iframe
                src={url}
                className="absolute inset-0 w-full h-full border-none bg-white"
                title="PDF Viewer"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}