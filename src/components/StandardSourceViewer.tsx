"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { createClient } from "@/utils/supabase/client";

// Load the PDF.js worker from a CDN matching the installed pdfjs-dist
// version. This avoids bundler-specific worker configuration in Next.js.
// If you'd rather self-host the worker, swap this for:
//   pdfjs.GlobalWorkerOptions.workerSrc = new URL(
//     "pdfjs-dist/build/pdf.worker.min.mjs",
//     import.meta.url
//   ).toString();
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type StandardSourceViewerProps = {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  page: number;
  title: string;
  citation: string;
  isDarkMode: boolean;
};

const PANEL_WIDTH = 500; // px — the fixed inner width used during the slide animation

// ------------------------------------------------------------
// CITATION HIGHLIGHT MATCHING
// ------------------------------------------------------------
// PDF.js text layers split page text into many small positioned <span>
// items, and a multi-word citation like "Table 2" is frequently split
// across two separate items ("Table" / "2"), so a single full-phrase
// regex often won't find a match inside any one item. We try the full
// phrase first (works when the phrase does live in one item), then fall
// back to matching just the bare identifier (e.g. "2", "3.2.1") pulled
// out of the citation, which is far more likely to appear as its own
// isolated text item on the page.

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildHighlightPatterns(citation: string): RegExp[] {
  const trimmed = citation.trim();
  if (!trimmed) return [];

  const patterns: RegExp[] = [new RegExp(`(${escapeRegExp(trimmed)})`, "gi")];

  const idMatch = trimmed.match(/\d+(?:\.\d+)*/);
  if (idMatch) {
    patterns.push(new RegExp(`(?<![\\w.])(${escapeRegExp(idMatch[0])})(?![\\w.])`, "g"));
  }

  return patterns;
}

function highlightTextItem(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      pattern.lastIndex = 0;
      return text.replace(pattern, '<mark class="cgpt-citation-highlight">$1</mark>');
    }
  }
  return text;
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
  const supabase = useMemo(() => createClient(), []);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isResolvingUrl, setIsResolvingUrl] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(page || 1);
  const [scale, setScale] = useState(1.15);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const highlightScrollAttemptedRef = useRef(false);

  const highlightPatterns = useMemo(() => buildHighlightPatterns(citation), [citation]);

  // ----------------------------------------------------------
  // Resolve documentId -> signed Supabase Storage URL
  // ----------------------------------------------------------
  useEffect(() => {
    if (!documentId) return;

    let cancelled = false;

    const resolveUrl = async () => {
      setIsResolvingUrl(true);
      setLoadError(null);
      setPdfUrl(null);

      try {
        // ASSUMPTION: verify `storage_path` matches your actual
        // standard_documents schema.
        const { data: docRow, error: docError } = await supabase
          .from("standard_documents")
          .select("storage_path")
          .eq("id", documentId)
          .single();

        if (docError || !docRow?.storage_path) {
          throw new Error(docError?.message || "Document not found.");
        }

        const { data: signed, error: signError } = await supabase.storage
          .from("civilgpt-pdfs")
          .createSignedUrl(docRow.storage_path, 60 * 60);

        if (signError || !signed?.signedUrl) {
          throw new Error(signError?.message || "Could not sign document URL.");
        }

        if (!cancelled) {
          setPdfUrl(signed.signedUrl);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load document.");
        }
      } finally {
        if (!cancelled) setIsResolvingUrl(false);
      }
    };

    resolveUrl();

    return () => {
      cancelled = true;
    };
  }, [documentId, supabase]);

  // Jump to the cited page whenever a new citation opens the viewer.
  useEffect(() => {
    setPageNumber(page || 1);
    highlightScrollAttemptedRef.current = false;
  }, [page, documentId]);

  const goToPage = (next: number) => {
    if (!numPages) return;
    setPageNumber(Math.min(Math.max(next, 1), numPages));
  };

  const handleTextLayerRendered = () => {
    if (highlightScrollAttemptedRef.current) return;
    highlightScrollAttemptedRef.current = true;

    // Give the text layer a tick to paint before searching for the mark.
    window.setTimeout(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const highlighted = container.querySelector(".cgpt-citation-highlight");
      if (highlighted) {
        highlighted.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 60);
  };

  return (
    <div
      className={`h-full shrink-0 border-l overflow-hidden transition-[width] duration-300 ease-in-out ${
        isOpen ? `w-[${PANEL_WIDTH}px]` : "w-0"
      } ${isDarkMode ? "bg-[#1e1f20] border-slate-800" : "bg-white border-slate-200"}`}
      style={{ width: isOpen ? PANEL_WIDTH : 0 }}
      aria-hidden={!isOpen}
    >
      {/* Fixed-width inner shell so content never reflows/squishes mid-animation */}
      <div style={{ width: PANEL_WIDTH }} className="h-full flex flex-col">
        {/* HEADER */}
        <div
          className={`flex items-start justify-between gap-3 px-4 py-3.5 border-b shrink-0 ${
            isDarkMode ? "border-slate-800" : "border-slate-200"
          }`}
        >
          <div className="min-w-0">
            <p
              className={`text-[13px] font-semibold truncate ${
                isDarkMode ? "text-slate-100" : "text-slate-900"
              }`}
              title={title}
            >
              {title || "Source document"}
            </p>
            {citation && (
              <p
                className={`mt-0.5 text-[11.5px] truncate ${
                  isDarkMode ? "text-amber-400/80" : "text-amber-700"
                }`}
                title={citation}
              >
                {citation}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              isDarkMode
                ? "text-slate-500 hover:bg-slate-700 hover:text-slate-200"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            }`}
            aria-label="Close source viewer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="w-4 h-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {/* TOOLBAR */}
        <div
          className={`flex items-center justify-between gap-2 px-3 py-2 border-b shrink-0 ${
            isDarkMode ? "border-slate-800" : "border-slate-200"
          }`}
        >
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goToPage(pageNumber - 1)}
              disabled={pageNumber <= 1}
              className={`w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30 transition-colors ${
                isDarkMode ? "hover:bg-slate-700 text-slate-300" : "hover:bg-slate-100 text-slate-600"
              }`}
              aria-label="Previous page"
            >
              ‹
            </button>

            <span className={`text-[12px] tabular-nums px-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
              {numPages ? `${pageNumber} / ${numPages}` : "—"}
            </span>

            <button
              type="button"
              onClick={() => goToPage(pageNumber + 1)}
              disabled={!numPages || pageNumber >= numPages}
              className={`w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30 transition-colors ${
                isDarkMode ? "hover:bg-slate-700 text-slate-300" : "hover:bg-slate-100 text-slate-600"
              }`}
              aria-label="Next page"
            >
              ›
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(0.6, +(s - 0.15).toFixed(2)))}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] transition-colors ${
                isDarkMode ? "hover:bg-slate-700 text-slate-300" : "hover:bg-slate-100 text-slate-600"
              }`}
              aria-label="Zoom out"
            >
              −
            </button>
            <span className={`text-[11px] tabular-nums w-9 text-center ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(2.5, +(s + 0.15).toFixed(2)))}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] transition-colors ${
                isDarkMode ? "hover:bg-slate-700 text-slate-300" : "hover:bg-slate-100 text-slate-600"
              }`}
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
        </div>

        {/* PDF CONTENT */}
        <div
          ref={scrollContainerRef}
          className={`flex-1 overflow-auto px-3 py-4 flex justify-center ${
            isDarkMode ? "bg-[#131314]" : "bg-slate-100"
          }`}
        >
          {isResolvingUrl && (
            <div className={`flex items-center justify-center h-full text-sm ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
              <span className="animate-spin mr-2">⏳</span> Loading document…
            </div>
          )}

          {loadError && !isResolvingUrl && (
            <div className={`flex flex-col items-center justify-center h-full text-center px-4 ${isDarkMode ? "text-red-400" : "text-red-500"}`}>
              <p className="text-sm font-medium">Couldn't load this document</p>
              <p className={`mt-1 text-xs ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>{loadError}</p>
            </div>
          )}

          {pdfUrl && !loadError && (
            <Document
              file={pdfUrl}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              onLoadError={(err) => setLoadError(err.message)}
              loading={
                <div className={`text-sm ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                  <span className="animate-spin mr-2">⏳</span> Rendering…
                </div>
              }
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderTextLayer
                renderAnnotationLayer
                onRenderTextLayerSuccess={handleTextLayerRendered}
                customTextRenderer={(textItem) => highlightTextItem(textItem.str, highlightPatterns)}
                className={`shadow-lg ${isDarkMode ? "shadow-black/40" : "shadow-slate-300/60"}`}
              />
            </Document>
          )}
        </div>
      </div>

      {/* Highlight styling — scoped globally since PDF.js injects raw HTML into the text layer */}
      <style jsx global>{`
        .cgpt-citation-highlight {
          background-color: rgba(245, 158, 11, 0.55);
          border-radius: 2px;
          padding: 0 1px;
        }
      `}</style>
    </div>
  );
}