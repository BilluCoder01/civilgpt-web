"use client";

import { useEffect, useState } from "react";

type StandardSourceViewerProps = {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  page: number;
  title?: string;
  citation?: string;
  isDarkMode: boolean;
};

type SourceResponse = {
  success?: boolean;
  filename?: string;
  url?: string;
  page?: number;
  pageCount?: number | null;
  error?: string;
};

export default function StandardSourceViewer({
  isOpen,
  onClose,
  documentId,
  page,
  title,
  citation,
  isDarkMode,
}: StandardSourceViewerProps) {
  const [source, setSource] =
    useState<SourceResponse | null>(null);
  const [isLoading, setIsLoading] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSource(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const loadSource = async () => {
      setIsLoading(true);
      setError(null);
      setSource(null);

      try {
        const response =
          await fetch(
            "/api/standards/source",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                documentId,
                page,
              }),
            }
          );

        const responseText =
          await response.text();

        let data: SourceResponse =
          {};

        try {
          data = responseText
            ? JSON.parse(responseText)
            : {};
        } catch {
          throw new Error(
            responseText ||
              `Source request failed with status ${response.status}.`
          );
        }

        if (!response.ok) {
          throw new Error(
            data.error ||
              `Source request failed with status ${response.status}.`
          );
        }

        if (
          !data.url
        ) {
          throw new Error(
            "The source API did not return a PDF URL."
          );
        }

        if (!cancelled) {
          setSource(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to open source PDF."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadSource();

    return () => {
      cancelled = true;
    };
  }, [
    documentId,
    isOpen,
    page,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const pageNumber =
    source?.page ?? page;

  const pageCount =
    source?.pageCount ?? null;

  const basePdfUrl =
    source?.url
      ? `${source.url}#page=${pageNumber}`
      : null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={
        title ||
        "IS Standard source viewer"
      }
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        className={`relative z-[121] flex h-[92vh] w-[96vw] max-w-7xl flex-col overflow-hidden rounded-[26px] border shadow-2xl ${
          isDarkMode
            ? "bg-[#1a1b1c] border-slate-700"
            : "bg-white border-slate-200"
        }`}
      >
        {/* HEADER */}
        <div
          className={`flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3 md:px-5 ${
            isDarkMode
              ? "border-slate-700 bg-[#1e1f20]"
              : "border-slate-200 bg-white"
          }`}
        >
          <div className="min-w-0">
            <div
              className={`truncate text-[13px] font-semibold ${
                isDarkMode
                  ? "text-slate-200"
                  : "text-slate-800"
              }`}
            >
              {title ||
                source?.filename ||
                "IS Standard Source"}
            </div>

            <div
              className={`mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] ${
                isDarkMode
                  ? "text-slate-500"
                  : "text-slate-500"
              }`}
            >
              {citation && (
                <span>
                  {citation}
                </span>
              )}

              {!citation && (
                <span>
                  Page {pageNumber}
                  {pageCount
                    ? ` / ${pageCount}`
                    : ""}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {source?.url && (
              <a
                href={basePdfUrl || source.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`hidden sm:inline-flex items-center rounded-full px-3 py-2 text-[11px] font-medium transition-colors ${
                  isDarkMode
                    ? "text-slate-300 hover:bg-slate-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Open PDF
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                isDarkMode
                  ? "text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              }`}
              aria-label="Close source viewer"
              title="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 6l12 12M18 6 6 18"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* BODY */}
        <div
          className={`relative flex-1 min-h-0 ${
            isDarkMode
              ? "bg-[#101112]"
              : "bg-slate-100"
          }`}
        >
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div
                className={`rounded-2xl border px-5 py-4 text-center shadow-lg ${
                  isDarkMode
                    ? "bg-[#1e1f20] border-slate-700"
                    : "bg-white border-slate-200"
                }`}
              >
                <div className="text-xl mb-2">
                  ⏳
                </div>

                <div
                  className={`text-sm font-medium ${
                    isDarkMode
                      ? "text-slate-200"
                      : "text-slate-800"
                  }`}
                >
                  Opening source…
                </div>

                <div
                  className={`mt-1 text-[11px] ${
                    isDarkMode
                      ? "text-slate-500"
                      : "text-slate-500"
                  }`}
                >
                  Loading page {pageNumber}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-5">
              <div
                className={`max-w-md rounded-2xl border px-5 py-4 shadow-lg ${
                  isDarkMode
                    ? "bg-[#1e1f20] border-red-900/60"
                    : "bg-white border-red-200"
                }`}
              >
                <div
                  className={`text-sm font-semibold ${
                    isDarkMode
                      ? "text-red-300"
                      : "text-red-600"
                  }`}
                >
                  Could not open source
                </div>

                <div
                  className={`mt-2 text-[12px] leading-5 ${
                    isDarkMode
                      ? "text-slate-400"
                      : "text-slate-500"
                  }`}
                >
                  {error}
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className={`mt-4 rounded-full px-4 py-2 text-[11px] font-medium ${
                    isDarkMode
                      ? "bg-slate-700 text-slate-200 hover:bg-slate-600"
                      : "bg-slate-900 text-white hover:bg-slate-800"
                  }`}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {basePdfUrl && !error && (
            <iframe
              title={
                title ||
                "IS Standard source PDF"
              }
              src={basePdfUrl}
              className="h-full w-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}