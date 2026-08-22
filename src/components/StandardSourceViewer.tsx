"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

// Configure the PDF.js worker securely via CDN
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);

  // Fetch the Secure Signed URL
  useEffect(() => {
    if (!isOpen || !documentId) return;

    let isMounted = true;
    setIsLoadingUrl(true);
    setIsPdfLoading(true);
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
          setUrl(data.url);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setIsLoadingUrl(false);
      }
    };

    fetchPdf();

    return () => {
      isMounted = false;
    };
  }, [isOpen, documentId, page]);

  // Extract the most specific target to highlight from the citation string
  const targetText = useMemo(() => {
    if (!citation) return "";
    const parts = citation.split("—").map((p) => p.trim());
    const validParts = parts.filter(
      (p) => !p.match(/^(IS|Page|Source|View Source)/i)
    );
    return validParts.length > 0 ? validParts[validParts.length - 1] : "";
  }, [citation]);

  // Custom renderer to inject <mark> tags into the PDF text layer using an HTML string
  const customTextRenderer = useCallback(
    (textItem: any) => {
      const str = textItem.str;
      if (!targetText || !str) return str;

      // Escape special characters and create a case-insensitive regex
      const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(${escapeRegExp(targetText)})`, "gi");

      if (regex.test(str)) {
        // Return as an HTML string to satisfy react-pdf types
        return str.replace(
          regex,
          `<mark class="bg-amber-300 text-transparent rounded-sm shadow-[0_0_8px_rgba(252,211,77,0.8)] highlight-mark" style="color: transparent">$1</mark>`
        );
      }
      return str;
    },
    [targetText]
  );

  // Auto-scroll to the highlight once the page completely renders
  const onPageLoadSuccess = () => {
    setIsPdfLoading(false);
    setTimeout(() => {
      const mark = document.querySelector(".highlight-mark");
      if (mark) {
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 400); // Slight delay ensures DOM is fully painted
  };

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
            className={`flex items-center justify-between px-5 py-3.5 shrink-0 border-b shadow-sm z-20 relative ${
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
                  {citation.replace(/(View )?Source:\s*/i, '')}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Zoom Controls */}
              <div className={`flex items-center mr-2 rounded-lg border overflow-hidden ${isDarkMode ? "border-slate-700" : "border-slate-200"}`}>
                 <button onClick={() => setScale(prev => Math.max(0.5, prev - 0.2))} className={`px-2.5 py-1 transition-colors ${isDarkMode ? "bg-[#333537] hover:bg-slate-700 text-slate-300" : "bg-slate-50 hover:bg-slate-200 text-slate-600"}`}>-</button>
                 <span className={`px-2 py-1 text-[11px] font-semibold border-x ${isDarkMode ? "bg-[#1e1f20] border-slate-700 text-slate-400" : "bg-white border-slate-200 text-slate-500"}`}>{Math.round(scale * 100)}%</span>
                 <button onClick={() => setScale(prev => Math.min(2.5, prev + 0.2))} className={`px-2.5 py-1 transition-colors ${isDarkMode ? "bg-[#333537] hover:bg-slate-700 text-slate-300" : "bg-slate-50 hover:bg-slate-200 text-slate-600"}`}>+</button>
              </div>

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
                  title="Open full PDF in new tab"
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
                    ? "hover:bg-slate-700 text-rose-400 hover:bg-rose-900/30"
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
          <div className={`flex-1 relative flex flex-col items-center overflow-y-auto ${isDarkMode ? "bg-[#131314]" : "bg-slate-100"}`}>
            
            {(isLoadingUrl || isPdfLoading) && !error && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/5 backdrop-blur-sm">
                <span className="animate-spin text-3xl mb-4">⏳</span>
                <span className={`text-[11px] font-bold uppercase tracking-widest ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                  {isLoadingUrl ? "Decrypting Document..." : "Rendering Page..."}
                </span>
              </div>
            )}

            {error && (
              <div className={`m-auto p-5 max-w-sm rounded-2xl border text-center shadow-sm ${isDarkMode ? "bg-red-900/20 border-red-900/50 text-red-400" : "bg-red-50 border-red-200 text-red-600"}`}>
                <p className="text-[14px] font-bold mb-1.5">Failed to load document</p>
                <p className="text-[13px] opacity-90 leading-relaxed">{error}</p>
              </div>
            )}

            {url && !error && (
              <div className="py-8 px-4 w-full flex justify-center">
                <Document
                  file={url}
                  loading={null}
                  error={null}
                >
                  <Page
                    pageNumber={page}
                    scale={scale}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    customTextRenderer={customTextRenderer}
                    onLoadSuccess={onPageLoadSuccess}
                    className="shadow-2xl bg-white"
                  />
                </Document>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}