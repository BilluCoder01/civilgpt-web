"use client";

import { useState } from "react";

type SourceApiTestProps = {
  isDarkMode?: boolean;
};

export default function SourceApiTest({
  isDarkMode = false,
}: SourceApiTestProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    status: number;
    message: string;
  } | null>(null);

  const runTest = async () => {
    setIsTesting(true);
    setResult(null);

    try {
      const response = await fetch(
        "/api/standards/source",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            documentId:
              "89ba6142-899d-408c-829b-f9634e2af7d2",
            page: 8,
          }),
        }
      );

      const text =
        await response.text();

      let data: any = null;

      try {
        data = text
          ? JSON.parse(text)
          : null;
      } catch {
        throw new Error(
          text ||
            `Request failed with status ${response.status}.`
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
            `Request failed with status ${response.status}.`
        );
      }

      setResult({
        success: true,
        status: response.status,
        message:
          `Source API works — ${data.filename}, page ${data.page}/${data.pageCount}.`,
      });
    } catch (error) {
      setResult({
        success: false,
        status: 0,
        message:
          error instanceof Error
            ? error.message
            : "Source API test failed.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div
      className={`rounded-[20px] border p-4 ${
        isDarkMode
          ? "bg-[#1e1f20] border-slate-700"
          : "bg-white border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p
            className={`text-[13px] font-semibold ${
              isDarkMode
                ? "text-slate-200"
                : "text-slate-800"
            }`}
          >
            Source API Test
          </p>

          <p
            className={`mt-1 text-[11px] ${
              isDarkMode
                ? "text-slate-500"
                : "text-slate-500"
            }`}
          >
            Tests secure access to IS 10262:2009, page 8.
          </p>
        </div>

        <button
          type="button"
          onClick={runTest}
          disabled={isTesting}
          className={`shrink-0 rounded-full px-4 py-2 text-[11px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isDarkMode
              ? "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
              : "bg-slate-900 text-white hover:bg-slate-800"
          }`}
        >
          {isTesting ? "Testing…" : "Test Source API"}
        </button>
      </div>

      {result && (
        <div
          className={`mt-3 rounded-[14px] px-3.5 py-3 text-[12px] ${
            result.success
              ? isDarkMode
                ? "bg-emerald-900/20 text-emerald-300"
                : "bg-emerald-50 text-emerald-700"
              : isDarkMode
              ? "bg-red-900/20 text-red-300"
              : "bg-red-50 text-red-700"
          }`}
        >
          {result.message}
          {!result.success && result.status > 0 && (
            <span className="block mt-1 opacity-70">
              HTTP {result.status}
            </span>
          )}
        </div>
      )}
    </div>
  );
}