
"use client";

import {
  useRef,
  useEffect,
  useState,
  useMemo,
  memo,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import "katex/dist/katex.min.css";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import MixDesignCalculator from "@/components/MixDesignCalculator";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Session = {
  id: string;
  title: string;
  created_at: string;
};

type UploadStatus =
  | {
      type: "success" | "error";
      message: string;
    }
  | null;

type UploadType = "engineering" | "standard";

// Temporary: the prepared IS 10262:2009 document currently in the database.
const EXISTING_STANDARD_DOCUMENT_ID =
  "89ba6142-899d-408c-829b-f9634e2af7d2";

// ------------------------------------------------------------
// MESSAGE BUBBLE
// ------------------------------------------------------------

const MessageBubble = memo(
  ({
    m,
    isTyping,
    isDark,
    isCopied,
    onCopy,
  }: {
    m: Message;
    isTyping?: boolean;
    isDark: boolean;
    isCopied: boolean;
    onCopy: (
      messageId: string,
      content: string
    ) => void;
  }) => {
    return (
      <div
        className={`group ${
          m.role === "user"
            ? "flex justify-end"
            : "flex justify-start gap-4"
        } mb-8`}
      >
        {/* Assistant icon */}
        {m.role === "assistant" && (
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-lg shrink-0 mt-1 shadow-sm border ${
              isDark
                ? "bg-amber-900/30 border-amber-800/50"
                : "bg-amber-100 border-amber-200"
            }`}
          >
            🏗️
          </div>
        )}

        <div
          className={`${
            m.role === "user"
              ? "max-w-[85%] md:max-w-[70%]"
              : "flex-1 max-w-[90%] md:max-w-[80%]"
          }`}
        >
          {/* MESSAGE */}
          <div
            className={`${
              m.role === "user"
                ? `${
                    isDark
                      ? "bg-[#333537] text-slate-200"
                      : "bg-[#f0f4f9] text-slate-800"
                  } px-5 py-3 rounded-[24px] rounded-br-sm`
                : `text-[15px] leading-relaxed ${
                    isDark
                      ? "text-slate-300"
                      : "text-slate-800"
                  } ${
                    isTyping
                      ? "typing-cursor"
                      : ""
                  }`
            }`}
          >
            {m.role === "user" ? (
              <div className="whitespace-pre-wrap">
                {m.content}
              </div>
            ) : (
              <ReactMarkdown
                remarkPlugins={[
                  remarkMath,
                  remarkGfm,
                ]}
                rehypePlugins={[
                  rehypeKatex,
                ]}
                components={{
                  h1: ({
                    node,
                    ...props
                  }) => (
                    <h1
                      className={`text-2xl font-semibold mt-6 mb-4 ${
                        isDark
                          ? "text-white"
                          : "text-slate-900"
                      }`}
                      {...props}
                    />
                  ),

                  h2: ({
                    node,
                    ...props
                  }) => (
                    <h2
                      className={`text-xl font-semibold mt-5 mb-3 ${
                        isDark
                          ? "text-white"
                          : "text-slate-900"
                      }`}
                      {...props}
                    />
                  ),

                  h3: ({
                    node,
                    ...props
                  }) => (
                    <h3
                      className={`text-lg font-medium mt-4 mb-2 ${
                        isDark
                          ? "text-white"
                          : "text-slate-900"
                      }`}
                      {...props}
                    />
                  ),

                  p: ({
                    node,
                    ...props
                  }) => (
                    <p
                      className="mb-4"
                      {...props}
                    />
                  ),

                  ul: ({
                    node,
                    ...props
                  }) => (
                    <ul
                      className={`list-disc pl-5 mb-4 space-y-1.5 ${
                        isDark
                          ? "marker:text-slate-600"
                          : "marker:text-slate-400"
                      }`}
                      {...props}
                    />
                  ),

                  ol: ({
                    node,
                    ...props
                  }) => (
                    <ol
                      className={`list-decimal pl-5 mb-4 space-y-1.5 ${
                        isDark
                          ? "marker:text-slate-600"
                          : "marker:text-slate-400"
                      }`}
                      {...props}
                    />
                  ),

                  strong: ({
                    node,
                    ...props
                  }) => (
                    <strong
                      className={`font-semibold ${
                        isDark
                          ? "text-white"
                          : "text-slate-900"
                      }`}
                      {...props}
                    />
                  ),

                  table: ({
                    node,
                    ...props
                  }) => (
                    <div
                      className={`overflow-x-auto my-6 rounded-2xl border ${
                        isDark
                          ? "border-slate-700"
                          : "border-slate-200"
                      }`}
                    >
                      <table
                        className="w-full text-left border-collapse"
                        {...props}
                      />
                    </div>
                  ),

                  thead: ({
                    node,
                    ...props
                  }) => (
                    <thead
                      className={`${
                        isDark
                          ? "bg-[#1e1f20] border-slate-700"
                          : "bg-[#f0f4f9] border-slate-200"
                      } border-b`}
                      {...props}
                    />
                  ),

                  th: ({
                    node,
                    ...props
                  }) => (
                    <th
                      className={`py-2.5 px-4 font-medium whitespace-nowrap ${
                        isDark
                          ? "text-slate-300"
                          : "text-slate-700"
                      }`}
                      {...props}
                    />
                  ),

                  td: ({
                    node,
                    ...props
                  }) => (
                    <td
                      className={`py-2.5 px-4 border-b ${
                        isDark
                          ? "border-slate-700/50"
                          : "border-slate-100"
                      }`}
                      {...props}
                    />
                  ),
                }}
              >
                {m.content}
              </ReactMarkdown>
            )}
          </div>

          {/* COPY BUTTON */}
          <div
            className={`mt-1.5 flex ${
              m.role === "user"
                ? "justify-end"
                : "justify-start"
            }`}
          >
            <button
              type="button"
              onClick={() =>
                onCopy(
                  m.id,
                  m.content
                )
              }
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] transition-all duration-200 ${
                isCopied
                  ? isDark
                    ? "text-emerald-400 bg-emerald-900/20"
                    : "text-emerald-600 bg-emerald-50"
                  : isDark
                  ? "text-slate-500 hover:text-slate-300 hover:bg-[#1e1f20] opacity-0 group-hover:opacity-100"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100 opacity-0 group-hover:opacity-100"
              }`}
              aria-label={
                isCopied
                  ? "Copied"
                  : "Copy message"
              }
            >
              <span
                className={`inline-flex transition-transform duration-200 ${
                  isCopied
                    ? "scale-110"
                    : "scale-100"
                }`}
              >
                {isCopied ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-3.5 h-3.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m4.5 12.75 6 6 9-13.5"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.8}
                    stroke="currentColor"
                    className="w-3.5 h-3.5"
                  >
                    <rect
                      width="9"
                      height="9"
                      x="4"
                      y="4"
                      rx="1.5"
                    />

                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11 11h7.5A1.5 1.5 0 0 1 20 12.5V19a1.5 1.5 0 0 1-1.5 1.5H12A1.5 1.5 0 0 1 10.5 19v-7.5A.5.5 0 0 1 11 11Z"
                    />
                  </svg>
                )}
              </span>

              <span>
                {isCopied
                  ? "Copied"
                  : "Copy"}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }
);

MessageBubble.displayName =
  "MessageBubble";

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

export default function Chat() {
  const router = useRouter();

  const supabase = useMemo(
    () => createClient(),
    []
  );

  const [activeTab, setActiveTab] =
    useState<
      "chat" | "calculator"
    >("chat");

  const [isSidebarOpen, setIsSidebarOpen] =
    useState(true);

  const [isDarkMode, setIsDarkMode] =
    useState(false);

  const [isSettingsOpen, setIsSettingsOpen] =
    useState(false);

  const [sessions, setSessions] =
    useState<Session[]>([]);

  const [activeSessionId, setActiveSessionId] =
    useState<string | null>(null);

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [myInput, setMyInput] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(false);

  const [isUploading, setIsUploading] =
    useState(false);

  const [uploadStatus, setUploadStatus] =
    useState<UploadStatus>(null);

  const [standardDocumentId, setStandardDocumentId] =
    useState<string | null>(EXISTING_STANDARD_DOCUMENT_ID);

  const [isProcessingStandard, setIsProcessingStandard] =
    useState(false);

  const [standardProcessingProgress, setStandardProcessingProgress] =
    useState<{
      processed: number;
      total: number;
      percent: number;
    } | null>({
      processed: 0,
      total: 146,
      percent: 0,
    });

  const [isRepairingStandard, setIsRepairingStandard] =
    useState(false);

  const [isFetchingHistory, setIsFetchingHistory] =
    useState(true);

  const [uploadedPdfName, setUploadedPdfName] =
    useState<string | null>(null);

  const [showUploadDialog, setShowUploadDialog] =
    useState(false);

  const [uploadType, setUploadType] =
    useState<UploadType>("engineering");

  const [standardIsNumber, setStandardIsNumber] =
    useState("");

  const [standardEditionYear, setStandardEditionYear] =
    useState("");

  const [standardTitle, setStandardTitle] =
    useState("");

  // Keeps the upload type stable while the native file picker is open.
  const uploadTypeRef =
    useRef<UploadType>("engineering");

  // Message ID currently displaying "Copied".
  const [copiedMessageId, setCopiedMessageId] =
    useState<string | null>(null);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const messagesEndRef =
    useRef<HTMLDivElement>(null);

  const sessionLoadRef =
    useRef(0);

  // ------------------------------------------------------------
  // SIDEBAR RESPONSIVENESS
  // ------------------------------------------------------------

  useEffect(() => {
    const handleResize = () => {
      if (
        window.innerWidth <
        768
      ) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };

    handleResize();

    window.addEventListener(
      "resize",
      handleResize
    );

    return () =>
      window.removeEventListener(
        "resize",
        handleResize
      );
  }, []);

  // ------------------------------------------------------------
  // LOAD SESSION LIST
  // ------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    const loadChatHistory =
      async () => {
        setIsFetchingHistory(
          true
        );

        const {
          data: { user },
        } =
          await supabase.auth.getUser();

        if (!user || cancelled) {
          if (!cancelled) {
            setIsFetchingHistory(
              false
            );
          }

          return;
        }

        const {
          data: allSessions,
          error,
        } =
          await supabase
            .from(
              "chat_sessions"
            )
            .select(
              "id, title, created_at"
            )
            .eq(
              "user_id",
              user.id
            )
            .order(
              "created_at",
              {
                ascending: false,
              }
            );

        if (cancelled) {
          return;
        }

        if (error) {
          console.error(
            "Failed to load sessions:",
            error
          );

          setSessions([]);
          setIsFetchingHistory(
            false
          );

          return;
        }

        // User starts with a fresh unsaved chat.
        setSessions(
          allSessions || []
        );

        setActiveSessionId(null);
        setMessages([]);

        setIsFetchingHistory(
          false
        );
      };

    loadChatHistory();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // ------------------------------------------------------------
  // LOAD SPECIFIC CHAT
  // ------------------------------------------------------------

  const loadSpecificSession =
    async (
      sessionId: string
    ) => {
      if (isLoading) {
        return;
      }

      const requestId =
        ++sessionLoadRef.current;

      if (
        window.innerWidth <
        768
      ) {
        setIsSidebarOpen(false);
      }

      setActiveTab("chat");

      setActiveSessionId(
        sessionId
      );

      setIsFetchingHistory(
        true
      );

      setMessages([]);

      const {
        data,
        error,
      } =
        await supabase
          .from("messages")
          .select(
            "id, role, content"
          )
          .eq(
            "session_id",
            sessionId
          )
          .order(
            "created_at",
            {
              ascending: true,
            }
          );

      if (
        requestId !==
        sessionLoadRef.current
      ) {
        return;
      }

      if (error) {
        console.error(
          "Failed to load session:",
          error
        );

        setMessages([]);
      } else {
        setMessages(
          (data ||
            []) as Message[]
        );
      }

      setIsFetchingHistory(
        false
      );
    };

  // ------------------------------------------------------------
  // COPY MESSAGE
  // ------------------------------------------------------------

  const handleCopyMessage =
    async (
      messageId: string,
      content: string
    ) => {
      try {
        await navigator.clipboard.writeText(
          content
        );

        setCopiedMessageId(
          messageId
        );

        window.setTimeout(() => {
          setCopiedMessageId(
            (current) =>
              current ===
              messageId
                ? null
                : current
          );
        }, 1800);
      } catch (error) {
        console.error(
          "Failed to copy message:",
          error
        );
      }
    };

  // ------------------------------------------------------------
  // AUTO SCROLL
  // ------------------------------------------------------------

  useEffect(() => {
    if (
      activeTab === "chat"
    ) {
      messagesEndRef.current?.scrollIntoView(
        {
          behavior: "smooth",
        }
      );
    }
  }, [
    messages,
    activeTab,
  ]);

  // ------------------------------------------------------------
  // LOGOUT
  // ------------------------------------------------------------

  const handleLogout =
    async () => {
      await supabase.auth.signOut();
      router.push("/login");
    };

  // ------------------------------------------------------------
  // NEW CHAT
  // ------------------------------------------------------------

  const handleNewChat =
    () => {
      if (isLoading) {
        return;
      }

      sessionLoadRef.current += 1;

      setActiveSessionId(
        null
      );

      setMessages([]);

      setMyInput("");

      setActiveTab("chat");

      setIsFetchingHistory(
        false
      );

      setCopiedMessageId(
        null
      );

      if (
        window.innerWidth <
        768
      ) {
        setIsSidebarOpen(false);
      }
    };

  // ------------------------------------------------------------
  // UPLOAD DIALOG / PDF UPLOAD
  // ------------------------------------------------------------

  const openUploadDialog = () => {
    if (isUploading || isLoading) {
      return;
    }

    setUploadStatus(null);
    setShowUploadDialog(true);
  };

  const chooseEngineeringPdf = () => {
    uploadTypeRef.current = "engineering";
    setUploadType("engineering");
    setShowUploadDialog(false);

    window.setTimeout(() => {
      fileInputRef.current?.click();
    }, 0);
  };

  const chooseStandardPdf = () => {
    const normalizedIsNumber =
      standardIsNumber.trim();

    const normalizedTitle =
      standardTitle.trim();

    const year = Number(
      standardEditionYear
    );

    if (!normalizedIsNumber) {
      setUploadStatus({
        type: "error",
        message: "Enter the IS Standard number first.",
      });
      return;
    }

    if (
      !Number.isInteger(year) ||
      year < 1900 ||
      year > 2100
    ) {
      setUploadStatus({
        type: "error",
        message: "Enter a valid edition year.",
      });
      return;
    }

    if (!normalizedTitle) {
      setUploadStatus({
        type: "error",
        message: "Enter the IS Standard title first.",
      });
      return;
    }

    uploadTypeRef.current = "standard";
    setUploadType("standard");
    setShowUploadDialog(false);

    window.setTimeout(() => {
      fileInputRef.current?.click();
    }, 0);
  };

  const handleFileUpload =
    async (
      e: React.ChangeEvent<HTMLInputElement>
    ) => {
      const file =
        e.target.files?.[0];

      if (!file) {
        return;
      }

      const currentUploadType =
        uploadTypeRef.current;

      setIsUploading(true);
      setUploadStatus(null);

      try {
        // ------------------------------------------------------
        // AUTHENTICATED USER
        // ------------------------------------------------------

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          throw new Error(
            "You must be signed in to upload a PDF."
          );
        }

        // ------------------------------------------------------
        // PDF VALIDATION
        // ------------------------------------------------------

        const isPdf =
          file.type ===
            "application/pdf" ||
          file.name
            .toLowerCase()
            .endsWith(".pdf");

        if (!isPdf) {
          throw new Error(
            "Only PDF files are supported."
          );
        }

        // ------------------------------------------------------
        // DIRECT SUPABASE STORAGE UPLOAD
        // ------------------------------------------------------
        //
        // IMPORTANT:
        // The PDF is uploaded directly from the browser to
        // Supabase Storage. It never travels through Vercel's
        // /api/upload request body, avoiding FUNCTION_PAYLOAD_TOO_LARGE.
        //
        // Storage path format:
        // <user-id>/<random-id>-<safe-filename>.pdf
        //
        // The Storage RLS policy only allows the authenticated
        // user to insert into the first-level folder matching
        // their own user ID.
        // ------------------------------------------------------

        const safeFilename = file.name
          .trim()
          .replace(/[^a-zA-Z0-9._-]+/g, "-")
          .replace(/-+/g, "-");

        const storagePath =
          `${user.id}/${crypto.randomUUID()}-${safeFilename || "document.pdf"}`;

        const {
          error: storageUploadError,
        } = await supabase.storage
          .from("civilgpt-pdfs")
          .upload(
            storagePath,
            file,
            {
              contentType:
                "application/pdf",
              upsert: false,
            }
          );

        if (storageUploadError) {
          throw new Error(
            `Storage upload failed: ${storageUploadError.message}`
          );
        }

        // ------------------------------------------------------
        // SERVER-SIDE PROCESSING
        // ------------------------------------------------------
        //
        // Only a small JSON payload is now sent to /api/upload.
        // The server downloads the PDF from private Storage.
        // ------------------------------------------------------

        const payload: {
          storagePath: string;
          filename: string;
          uploadType: UploadType;
          isNumber?: string;
          editionYear?: string;
          title?: string;
        } = {
          storagePath,
          filename: file.name,
          uploadType: currentUploadType,
        };

        if (
          currentUploadType ===
          "standard"
        ) {
          payload.isNumber =
            standardIsNumber.trim();

          payload.editionYear =
            standardEditionYear.trim();

          payload.title =
            standardTitle.trim();
        }

        const res =
          await fetch(
            "/api/upload",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify(
                payload
              ),
            }
          );

        const responseText =
          await res.text();

        let data: any = null;

        try {
          data = responseText
            ? JSON.parse(responseText)
            : null;
        } catch {
          throw new Error(
            responseText ||
              `Upload request failed with status ${res.status}.`
          );
        }

        if (!res.ok) {
          throw new Error(
            data?.error ||
              `Upload request failed with status ${res.status}.`
          );
        }

        setUploadedPdfName(
          data.filename ||
            file.name
        );

        if (currentUploadType === "standard") {
          setStandardDocumentId(
            data.standardDocumentId || null
          );

          if (data.standardDocumentId) {
            setStandardProcessingProgress({
              processed: Number(data.processedChunks) || 0,
              total: Number(data.totalChunks) || 0,
              percent: Number(data.totalChunks) > 0
                ? Math.round(
                    ((Number(data.processedChunks) || 0) /
                      Number(data.totalChunks)) *
                      100
                  )
                : 0,
            });
          }
        } else {
          setStandardDocumentId(null);
          setStandardProcessingProgress(null);
        }

        if (data.duplicate) {
          setUploadStatus({
            type: "success",
            message:
              currentUploadType ===
              "standard"
                ? "This IS Standard PDF is already in your standards library."
                : "This PDF is already in your knowledge base.",
          });
        } else {
          setUploadStatus({
            type: "success",
            message:
              currentUploadType ===
              "standard"
                ? "IS Standard prepared for batch embedding."
                : "PDF Memorized.",
          });
        }

        setTimeout(() => {
          setUploadStatus(null);
        }, 4500);
      } catch (error) {
        console.error(
          "PDF upload failed:",
          error
        );

        setUploadStatus({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to process PDF.",
        });
      } finally {
        setIsUploading(false);

        if (
          fileInputRef.current
        ) {
          fileInputRef.current.value =
            "";
        }
      }
    };

  // ------------------------------------------------------------
  // PROCESS STANDARD EMBEDDINGS
  // ------------------------------------------------------------

  const processStandardEmbeddings =
    async () => {
      const documentIdToProcess =
        standardDocumentId ||
        EXISTING_STANDARD_DOCUMENT_ID;

      if (isProcessingStandard) {
        return;
      }

      setStandardDocumentId(
        documentIdToProcess
      );

      setIsProcessingStandard(true);
      setUploadStatus(null);

      try {
        let finished = false;

        while (!finished) {
          const res = await fetch(
            "/api/standards/process",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                documentId: documentIdToProcess,
              }),
            }
          );

          const responseText =
            await res.text();

          let data: any = null;

          try {
            data = responseText
              ? JSON.parse(responseText)
              : null;
          } catch {
            throw new Error(
              responseText ||
                `Processing request failed with status ${res.status}.`
            );
          }

          if (data?.processedChunks != null) {
            const processed =
              Number(data.processedChunks) || 0;
            const total =
              Number(data.totalChunks) || 0;
            const percent =
              Number(data.percent) ||
              (total > 0
                ? Math.round(
                    (processed / total) * 100
                  )
                : 0);

            setStandardProcessingProgress({
              processed,
              total,
              percent,
            });
          }

          if (
            data?.status ===
            "completed"
          ) {
            setUploadStatus({
              type: "success",
              message:
                `IS Standard ready — ${data.processedChunks}/${data.totalChunks} chunks embedded.`,
            });

            finished = true;
            break;
          }

          if (
            data?.status ===
            "paused"
          ) {
            setUploadStatus({
              type: "error",
              message:
                "Embedding quota reached. Processing is safely paused. You can resume later without starting over.",
            });

            finished = true;
            break;
          }

          if (!res.ok) {
            throw new Error(
              data?.error ||
                `Standard processing failed with status ${res.status}.`
            );
          }

          const processed =
            Number(data?.processedChunks) || 0;
          const total =
            Number(data?.totalChunks) || 0;

          setUploadStatus({
            type: "success",
            message:
              `Processing IS Standard — ${processed}/${total} chunks embedded${
                total > 0
                  ? ` (${Math.round((processed / total) * 100)}%)`
                  : ""
              }.`,
          });

          await new Promise((resolve) =>
            window.setTimeout(
              resolve,
              300
            )
          );
        }
      } catch (error) {
        console.error(
          "Standard processing failed:",
          error
        );

        setUploadStatus({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to process IS Standard embeddings.",
        });
      } finally {
        setIsProcessingStandard(false);
      }
    };

  // ------------------------------------------------------------
  // REPAIR IS 10262 CITATION METADATA
  // ------------------------------------------------------------

  const repairStandardMetadata =
    async () => {
      if (
        isRepairingStandard ||
        isProcessingStandard
      ) {
        return;
      }

      setIsRepairingStandard(true);
      setUploadStatus(null);

      try {
        const res =
          await fetch(
            "/api/standards/repair-metadata",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                documentId:
                  standardDocumentId ||
                  "89ba6142-899d-408c-829b-f9634e2af7d2",
              }),
            }
          );

        const responseText =
          await res.text();

        let data: any = null;

        try {
          data = responseText
            ? JSON.parse(responseText)
            : null;
        } catch {
          throw new Error(
            responseText ||
              `Metadata repair failed with status ${res.status}.`
          );
        }

        if (!res.ok) {
          throw new Error(
            data?.error ||
              `Metadata repair failed with status ${res.status}.`
          );
        }

        setUploadStatus({
          type: "success",
          message:
            `Citation metadata repaired — ${data.updatedChunks} chunks updated. Embeddings were preserved.`,
        });
      } catch (error) {
        console.error(
          "Standard metadata repair failed:",
          error
        );

        setUploadStatus({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to repair citation metadata.",
        });
      } finally {
        setIsRepairingStandard(false);
      }
    };

  // ------------------------------------------------------------
  // REMOVE PDF VISUAL CHIP
  // ------------------------------------------------------------

  const removePdfAttachment =
    () => {
      setUploadedPdfName(null);
      setUploadStatus(null);
    };

  // ------------------------------------------------------------
  // SEND MESSAGE
  // ------------------------------------------------------------

  const customHandleSubmit =
    async (
      e?: React.FormEvent
    ) => {
      if (e) {
        e.preventDefault();
      }

      const input =
        myInput.trim();

      if (
        !input ||
        isLoading
      ) {
        return;
      }

      let sessionId =
        activeSessionId;

      // Create the DB session only when
      // the first message is actually sent.
      if (!sessionId) {
        const {
          data: { user },
        } =
          await supabase.auth.getUser();

        if (!user) {
          console.error(
            "Cannot send message: user is not authenticated."
          );

          return;
        }

        const {
          data: newSession,
          error,
        } =
          await supabase
            .from(
              "chat_sessions"
            )
            .insert([
              {
                user_id:
                  user.id,
                title:
                  "New Engineering Chat",
              },
            ])
            .select(
              "id, title, created_at"
            )
            .single();

        if (
          error ||
          !newSession
        ) {
          console.error(
            "Failed to create chat session:",
            error
          );

          return;
        }

        sessionId =
          newSession.id;

        setSessions(
          (prev) => [
            newSession,
            ...prev,
          ]
        );

        setActiveSessionId(
          newSession.id
        );

        sessionLoadRef.current += 1;
      }

      const userMsg: Message =
        {
          id:
            crypto.randomUUID(),
          role: "user",
          content: input,
        };

      const aiMsgId =
        crypto.randomUUID();

      setMessages(
        (prev) => [
          ...prev,
          userMsg,
          {
            id: aiMsgId,
            role: "assistant",
            content: "",
          },
        ]
      );

      setMyInput("");

      setIsLoading(true);

      try {
        const response =
          await fetch(
            "/api/chat",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                messages: [
                  ...messages,
                  userMsg,
                ],
                sessionId,
              }),
            }
          );

        if (!response.ok) {
          const errorText =
            await response.text();

          setMessages(
            (prev) =>
              prev.map(
                (message) =>
                  message.id ===
                  aiMsgId
                    ? {
                        ...message,
                        content:
                          `⚠️ ${errorText}`,
                      }
                    : message
              )
          );

          return;
        }

        if (!response.body) {
          throw new Error(
            "Response body is empty."
          );
        }

        const reader =
          response.body.getReader();

        const decoder =
          new TextDecoder();

        let currentAiText =
          "";

        while (true) {
          const {
            done,
            value,
          } =
            await reader.read();

          if (done) {
            break;
          }

          currentAiText +=
            decoder.decode(
              value,
              {
                stream: true,
              }
            );

          setMessages(
            (prev) =>
              prev.map(
                (message) =>
                  message.id ===
                  aiMsgId
                    ? {
                        ...message,
                        content:
                          currentAiText,
                      }
                    : message
              )
          );
        }

        currentAiText +=
          decoder.decode();

        setMessages(
          (prev) =>
            prev.map(
              (message) =>
                message.id ===
                aiMsgId
                  ? {
                      ...message,
                      content:
                        currentAiText,
                    }
                  : message
            )
        );

        const shortTitle =
          input.length > 25
            ? `${input.substring(
                0,
                25
              )}...`
            : input;

        setSessions(
          (prev) =>
            prev.map(
              (session) =>
                session.id ===
                sessionId
                  ? {
                      ...session,
                      title:
                        shortTitle,
                    }
                  : session
            )
        );
      } catch (error) {
        console.error(
          "Chat stream failed:",
          error
        );

        setMessages(
          (prev) =>
            prev.map(
              (message) =>
                message.id ===
                aiMsgId
                  ? {
                      ...message,
                      content:
                        "⚠️ Stream failed.",
                    }
                  : message
            )
        );
      } finally {
        setIsLoading(false);
      }
    };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  return (
    <div
      className={`flex h-screen overflow-hidden font-sans transition-colors duration-300 ${
        isDarkMode
          ? "bg-[#131314] text-slate-200"
          : "bg-white text-slate-800"
      }`}
    >
      {/* SIDEBAR TOGGLE */}

      <button
        onClick={() =>
          setIsSidebarOpen(
            !isSidebarOpen
          )
        }
        className={`fixed top-3 left-3 z-[60] p-2.5 rounded-full transition-colors ${
          isDarkMode
            ? "hover:bg-[#333537] text-slate-400"
            : "hover:bg-[#e8eaed] text-slate-600"
        }`}
        aria-label="Toggle Sidebar"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-[22px] h-[22px]"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"
          />
        </svg>
      </button>

      {/* MOBILE OVERLAY */}

      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden transition-opacity"
          onClick={() =>
            setIsSidebarOpen(false)
          }
        />
      )}

      {/* SIDEBAR */}

      <aside
        className={`fixed inset-y-0 left-0 z-50 md:relative transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] flex-shrink-0 flex flex-col ${
          isDarkMode
            ? "bg-[#1e1f20]"
            : "bg-[#f0f4f9]"
        } ${
          isSidebarOpen
            ? "w-[260px] translate-x-0"
            : "w-[260px] -translate-x-full md:translate-x-0 md:w-[64px]"
        }`}
      >
        {/* HEADER */}

        <div className="h-[64px] flex items-center shrink-0">
          <div className="w-[64px] shrink-0" />

          <span
            className={`text-[18px] font-medium tracking-wide select-none whitespace-nowrap overflow-hidden transition-all duration-300 ${
              isDarkMode
                ? "text-slate-300"
                : "text-slate-700"
            } ${
              isSidebarOpen
                ? "opacity-100 max-w-[120px]"
                : "opacity-0 max-w-0"
            }`}
          >
            CivilGPT
          </span>
        </div>

        {/* NEW CHAT */}

        <div className="px-3 py-2 shrink-0 relative group flex justify-center md:justify-start">
          <button
            onClick={
              handleNewChat
            }
            disabled={isLoading}
            className={`flex items-center transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
              isDarkMode
                ? "bg-[#333537] hover:bg-[#444749] text-slate-200"
                : "bg-[#e8eaed] hover:bg-[#dce0e3] text-slate-700"
            } ${
              isSidebarOpen
                ? "rounded-[16px] py-2.5 px-3.5 w-full md:w-[140px]"
                : "rounded-full h-[40px] w-[40px] justify-center px-0"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-[18px] h-[18px] shrink-0"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>

            <span
              className={`font-medium text-[13px] whitespace-nowrap overflow-hidden transition-all duration-300 ${
                isSidebarOpen
                  ? "ml-2.5 opacity-100 max-w-[100px]"
                  : "w-0 opacity-0 ml-0 max-w-0"
              }`}
            >
              New chat
            </span>
          </button>

          {!isSidebarOpen && (
            <div
              className={`absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 text-xs font-medium rounded opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none whitespace-nowrap shadow-md ${
                isDarkMode
                  ? "bg-slate-700 text-white"
                  : "bg-slate-800 text-white"
              }`}
            >
              New Chat
            </div>
          )}
        </div>

        {/* TOOLS */}

        <div className="mt-2 px-3 space-y-1">
          <h3
            className={`text-[12px] font-medium px-2 mb-2 transition-all duration-300 overflow-hidden whitespace-nowrap ${
              isSidebarOpen
                ? "max-w-[100px] opacity-100"
                : "max-w-0 opacity-0 h-0 m-0"
            } ${
              isDarkMode
                ? "text-slate-500"
                : "text-slate-500"
            }`}
          >
            Tools
          </h3>

          <div className="relative group w-full flex justify-center md:justify-start">
            <button
              onClick={() => {
                setActiveTab(
                  "chat"
                );

                if (
                  window.innerWidth <
                  768
                ) {
                  setIsSidebarOpen(
                    false
                  );
                }
              }}
              className={`flex items-center rounded-full transition-colors ${
                activeTab ===
                "chat"
                  ? isDarkMode
                    ? "bg-[#333537] text-amber-400 font-medium"
                    : "bg-[#dce0e3] text-slate-900 font-medium"
                  : isDarkMode
                  ? "text-slate-300 hover:bg-[#333537]"
                  : "text-slate-700 hover:bg-[#e8eaed]"
              } ${
                isSidebarOpen
                  ? "w-full py-2 px-3"
                  : "h-[40px] w-[40px] justify-center px-0"
              }`}
            >
              <span className="w-5 flex justify-center text-amber-500 shrink-0 text-sm">
                ✦
              </span>

              <span
                className={`text-[13px] whitespace-nowrap overflow-hidden transition-all duration-300 ${
                  isSidebarOpen
                    ? "ml-3 opacity-100 max-w-[200px]"
                    : "w-0 opacity-0 ml-0 max-w-0"
                }`}
              >
                AI Assistant
              </span>
            </button>

            {!isSidebarOpen && (
              <div
                className={`absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 text-xs font-medium rounded opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none whitespace-nowrap shadow-md ${
                  isDarkMode
                    ? "bg-slate-700 text-white"
                    : "bg-slate-800 text-white"
                }`}
              >
                AI Assistant
              </div>
            )}
          </div>

          <div className="relative group w-full flex justify-center md:justify-start">
            <button
              onClick={() => {
                setActiveTab(
                  "calculator"
                );

                if (
                  window.innerWidth <
                  768
                ) {
                  setIsSidebarOpen(
                    false
                  );
                }
              }}
              className={`flex items-center rounded-full transition-colors ${
                activeTab ===
                "calculator"
                  ? isDarkMode
                    ? "bg-[#333537] text-slate-100 font-medium"
                    : "bg-[#dce0e3] text-slate-900 font-medium"
                  : isDarkMode
                  ? "text-slate-300 hover:bg-[#333537]"
                  : "text-slate-700 hover:bg-[#e8eaed]"
              } ${
                isSidebarOpen
                  ? "w-full py-2 px-3"
                  : "h-[40px] w-[40px] justify-center px-0"
              }`}
            >
              <span className="w-5 flex justify-center text-slate-400 shrink-0 text-sm">
                🧮
              </span>

              <span
                className={`text-[13px] whitespace-nowrap overflow-hidden transition-all duration-300 ${
                  isSidebarOpen
                    ? "ml-3 opacity-100 max-w-[200px]"
                    : "w-0 opacity-0 ml-0 max-w-0"
                }`}
              >
                Mix Calculator
              </span>
            </button>

            {!isSidebarOpen && (
              <div
                className={`absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 text-xs font-medium rounded opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none whitespace-nowrap shadow-md ${
                  isDarkMode
                    ? "bg-slate-700 text-white"
                    : "bg-slate-800 text-white"
                }`}
              >
                Mix Calculator
              </div>
            )}
          </div>
        </div>

        {/* HISTORY */}

        <div className="flex-1 overflow-y-auto overflow-x-hidden mt-2 px-3 space-y-0.5 pb-4">
          <h3
            className={`text-[12px] font-medium px-2 mt-4 mb-2 transition-all duration-300 overflow-hidden whitespace-nowrap ${
              isSidebarOpen
                ? "max-w-[100px] opacity-100"
                : "max-w-0 opacity-0 h-0 m-0"
            } ${
              isDarkMode
                ? "text-slate-500"
                : "text-slate-500"
            }`}
          >
            Recent
          </h3>

          {sessions.length ===
            0 &&
          !isFetchingHistory &&
          isSidebarOpen ? (
            <div className="text-slate-500 text-[13px] px-3 mt-2 whitespace-nowrap">
              No previous chats.
            </div>
          ) : (
            sessions.map(
              (session) => (
                <div
                  key={
                    session.id
                  }
                  className="relative group w-full flex justify-center md:justify-start"
                >
                  <button
                    onClick={() =>
                      loadSpecificSession(
                        session.id
                      )
                    }
                    disabled={
                      isLoading
                    }
                    className={`flex items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      activeSessionId ===
                        session.id &&
                      activeTab ===
                        "chat"
                        ? isDarkMode
                          ? "bg-[#333537] text-slate-200"
                          : "bg-[#dce0e3] text-slate-900 font-medium"
                        : isDarkMode
                        ? "text-slate-400 hover:bg-[#333537]"
                        : "text-slate-600 hover:bg-[#e8eaed]"
                    } ${
                      isSidebarOpen
                        ? "w-full py-2 px-3"
                        : "h-[40px] w-[40px] justify-center px-0"
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={
                        1.5
                      }
                      stroke="currentColor"
                      className="w-[18px] h-[18px] shrink-0 opacity-70"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.436 3 11.996c0 2.29.982 4.367 2.584 5.86.32.298.54.69.58 1.102l.27 2.842a.8.8 0 0 0 1.25.59l2.76-1.74a.8.8 0 0 1 .45-.14 9.1 9.1 0 0 0 1.1.07Z"
                      />
                    </svg>

                    <span
                      className={`text-[13px] whitespace-nowrap overflow-hidden transition-all duration-300 ${
                        isSidebarOpen
                          ? "ml-3 opacity-100 max-w-[150px]"
                          : "max-w-0 opacity-0 ml-0"
                      }`}
                    >
                      {session.title ||
                        "Workspace"}
                    </span>
                  </button>

                  {!isSidebarOpen && (
                    <div
                      className={`absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 text-xs font-medium rounded opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none whitespace-nowrap shadow-md ${
                        isDarkMode
                          ? "bg-slate-700 text-white"
                          : "bg-slate-800 text-white"
                      }`}
                    >
                      {session.title ||
                        "Workspace"}
                    </div>
                  )}
                </div>
              )
            )
          )}
        </div>

        {/* SETTINGS */}

        <div className="p-3 shrink-0 flex flex-col gap-1 relative">
          {isSettingsOpen && (
            <div
              className="fixed inset-0 z-[90]"
              onClick={() =>
                setIsSettingsOpen(
                  false
                )
              }
            />
          )}

          {isSettingsOpen && (
            <div
              className={`absolute left-full ml-2 bottom-4 w-[220px] rounded-2xl p-2 shadow-xl z-[101] border transition-colors ${
                isDarkMode
                  ? "bg-[#333537] border-slate-700 text-slate-200"
                  : "bg-white border-slate-200 text-slate-800"
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-2 px-2 opacity-60">
                Settings
              </div>

              <div
                onClick={() =>
                  setIsDarkMode(
                    !isDarkMode
                  )
                }
                className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                  isDarkMode
                    ? "hover:bg-slate-700"
                    : "hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[15px]">
                    {isDarkMode
                      ? "🌙"
                      : "☀️"}
                  </span>

                  <span className="text-[13px] font-medium">
                    Dark Theme
                  </span>
                </div>

                <div
                  className={`w-8 h-[18px] rounded-full flex items-center p-0.5 transition-colors ${
                    isDarkMode
                      ? "bg-amber-500"
                      : "bg-slate-300"
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                      isDarkMode
                        ? "translate-x-[14px]"
                        : "translate-x-0"
                    }`}
                  />
                </div>
              </div>

              <div className="my-1 border-t border-slate-200/20" />

              <div
                onClick={
                  handleLogout
                }
                className={`flex items-center gap-2.5 p-2 rounded-xl cursor-pointer transition-colors ${
                  isDarkMode
                    ? "hover:bg-slate-700 text-rose-400"
                    : "hover:bg-slate-100 text-rose-500"
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-[16px] h-[16px]"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"
                  />
                </svg>

                <span className="text-[13px] font-medium">
                  Sign out
                </span>
              </div>
            </div>
          )}

          <div className="relative group w-full flex justify-center md:justify-start">
            <button
              onClick={() =>
                setIsSettingsOpen(
                  !isSettingsOpen
                )
              }
              className={`flex items-center rounded-full transition-colors ${
                isSidebarOpen
                  ? "w-full py-2 px-2.5"
                  : "h-[40px] w-[40px] justify-center px-0"
              } ${
                isSettingsOpen
                  ? isDarkMode
                    ? "bg-[#333537] text-slate-200"
                    : "bg-[#e8eaed] text-slate-900"
                  : isDarkMode
                  ? "text-slate-400 hover:bg-[#333537]"
                  : "text-slate-600 hover:bg-[#e8eaed]"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-[18px] h-[18px] shrink-0"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.528.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894Z"
                />

                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                />
              </svg>

              <span
                className={`text-[13px] font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ${
                  isSidebarOpen
                    ? "ml-3 opacity-100 max-w-[150px]"
                    : "max-w-0 opacity-0 ml-0"
                }`}
              >
                Settings
              </span>
            </button>

            {!isSidebarOpen &&
              !isSettingsOpen && (
                <div
                  className={`absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 text-xs font-medium rounded opacity-0 group-hover:opacity-100 transition-opacity z-[100] pointer-events-none whitespace-nowrap shadow-md ${
                    isDarkMode
                      ? "bg-slate-700 text-white"
                      : "bg-slate-800 text-white"
                  }`}
                >
                  Settings
                </div>
              )}
          </div>
        </div>
      </aside>

      {/* -------------------------------------------------- */}
      {/* MAIN */}
      {/* -------------------------------------------------- */}

      <main className="flex-1 flex flex-col relative h-full min-w-0 transition-all duration-300">
        <div className="h-[64px] shrink-0 w-full flex items-center md:hidden pl-[64px]">
          {!isSidebarOpen && (
            <span
              className={`text-[18px] font-medium tracking-wide select-none ${
                isDarkMode
                  ? "text-slate-300"
                  : "text-slate-600"
              }`}
            >
              CivilGPT
            </span>
          )}
        </div>

        {/* CHAT */}

        {activeTab ===
          "chat" && (
          <div className="flex-1 flex flex-col relative overflow-hidden h-full">
            <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-2 pb-32">
              <div className="max-w-3xl mx-auto w-full">
                {isFetchingHistory ? (
                  <div className="flex items-center justify-center h-full pt-20">
                    <span
                      className={`animate-spin text-3xl ${
                        isDarkMode
                          ? "text-slate-700"
                          : "text-[#e8eaed]"
                      }`}
                    >
                      ⏳
                    </span>
                  </div>
                ) : messages.length ===
                  0 ? (
                  <div className="flex flex-col h-full text-left space-y-3 pt-[15vh]">
                    <h2
                      className={`text-4xl font-medium tracking-tight ${
                        isDarkMode
                          ? "text-slate-400"
                          : "text-[#c4c7c5]"
                      }`}
                    >
                      Hello, Engineer.
                    </h2>

                    <p
                      className={`text-2xl font-medium max-w-xl leading-relaxed ${
                        isDarkMode
                          ? "text-slate-500"
                          : "text-[#c4c7c5]"
                      }`}
                    >
                      How can I help you with your
                      structural analysis today?
                    </p>
                  </div>
                ) : (
                  messages.map(
                    (
                      message,
                      index
                    ) => (
                      <MessageBubble
                        key={
                          message.id
                        }
                        m={message}
                        isTyping={
                          isLoading &&
                          index ===
                            messages.length -
                              1 &&
                          message.role ===
                            "assistant"
                        }
                        isDark={
                          isDarkMode
                        }
                        isCopied={
                          copiedMessageId ===
                          message.id
                        }
                        onCopy={
                          handleCopyMessage
                        }
                      />
                    )
                  )
                )}

                <div
                  ref={
                    messagesEndRef
                  }
                  className="h-4"
                />
              </div>
            </div>

            {/* UPLOAD DIALOG */}

            {showUploadDialog && (
              <>
                <div
                  className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px]"
                  onClick={() =>
                    setShowUploadDialog(false)
                  }
                />

                <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
                  <div
                    className={`w-full max-w-md rounded-[28px] border shadow-2xl p-6 ${
                      isDarkMode
                        ? "bg-[#1e1f20] border-slate-700 text-slate-200"
                        : "bg-white border-slate-200 text-slate-800"
                    }`}
                    onClick={(event) =>
                      event.stopPropagation()
                    }
                  >
                    <div className="flex items-start justify-between gap-4 mb-6">
                      <div>
                        <h3 className="text-lg font-semibold">
                          Add PDF to CivilGPT
                        </h3>
                        <p
                          className={`mt-1 text-[12px] ${
                            isDarkMode
                              ? "text-slate-500"
                              : "text-slate-500"
                          }`}
                        >
                          Choose how this document should be indexed.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setShowUploadDialog(false)
                        }
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isDarkMode
                            ? "text-slate-500 hover:bg-slate-700 hover:text-slate-200"
                            : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        }`}
                        aria-label="Close upload dialog"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          className="w-4 h-4"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 6l12 12M18 6 6 18"
                          />
                        </svg>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <button
                        type="button"
                        onClick={() =>
                          setUploadType("engineering")
                        }
                        className={`rounded-[20px] border p-4 text-left transition-all ${
                          uploadType === "engineering"
                            ? isDarkMode
                              ? "border-amber-500/50 bg-amber-500/10"
                              : "border-slate-400 bg-slate-50"
                            : isDarkMode
                            ? "border-slate-700 hover:border-slate-600"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="text-xl mb-2">📐</div>
                        <p className="text-[13px] font-semibold">
                          Engineering PDF
                        </p>
                        <p
                          className={`mt-1 text-[11px] leading-relaxed ${
                            isDarkMode
                              ? "text-slate-500"
                              : "text-slate-500"
                          }`}
                        >
                          Project reports, drawings, notes and other engineering documents.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setUploadType("standard")
                        }
                        className={`rounded-[20px] border p-4 text-left transition-all ${
                          uploadType === "standard"
                            ? isDarkMode
                              ? "border-amber-500/50 bg-amber-500/10"
                              : "border-slate-400 bg-slate-50"
                            : isDarkMode
                            ? "border-slate-700 hover:border-slate-600"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="text-xl mb-2">📘</div>
                        <p className="text-[13px] font-semibold">
                          IS Standard / Code
                        </p>
                        <p
                          className={`mt-1 text-[11px] leading-relaxed ${
                            isDarkMode
                              ? "text-slate-500"
                              : "text-slate-500"
                          }`}
                        >
                          Store as citation-ready authoritative code material.
                        </p>
                      </button>
                    </div>

                    {uploadType === "standard" ? (
                      <div className="space-y-4">
                        <div>
                          <label className={`block text-[12px] font-medium mb-1.5 ${
                            isDarkMode
                              ? "text-slate-300"
                              : "text-slate-700"
                          }`}>
                            IS Number
                          </label>

                          <input
                            value={standardIsNumber}
                            onChange={(e) =>
                              setStandardIsNumber(e.target.value)
                            }
                            placeholder="e.g. IS 10262"
                            className={`w-full px-4 py-3 rounded-[16px] border outline-none text-[13px] ${
                              isDarkMode
                                ? "bg-[#131314] border-slate-700 text-slate-200 placeholder-slate-600 focus:border-slate-500"
                                : "bg-[#f0f4f9] border-slate-200 text-slate-800 placeholder-slate-400 focus:bg-white focus:border-slate-300"
                            }`}
                          />
                        </div>

                        <div>
                          <label className={`block text-[12px] font-medium mb-1.5 ${
                            isDarkMode
                              ? "text-slate-300"
                              : "text-slate-700"
                          }`}>
                            Edition / Year
                          </label>

                          <input
                            type="number"
                            value={standardEditionYear}
                            onChange={(e) =>
                              setStandardEditionYear(e.target.value)
                            }
                            placeholder="e.g. 2019"
                            className={`w-full px-4 py-3 rounded-[16px] border outline-none text-[13px] ${
                              isDarkMode
                                ? "bg-[#131314] border-slate-700 text-slate-200 placeholder-slate-600 focus:border-slate-500"
                                : "bg-[#f0f4f9] border-slate-200 text-slate-800 placeholder-slate-400 focus:bg-white focus:border-slate-300"
                            }`}
                          />
                        </div>

                        <div>
                          <label className={`block text-[12px] font-medium mb-1.5 ${
                            isDarkMode
                              ? "text-slate-300"
                              : "text-slate-700"
                          }`}>
                            Standard Title
                          </label>

                          <input
                            value={standardTitle}
                            onChange={(e) =>
                              setStandardTitle(e.target.value)
                            }
                            placeholder="e.g. Concrete Mix Proportioning — Guidelines"
                            className={`w-full px-4 py-3 rounded-[16px] border outline-none text-[13px] ${
                              isDarkMode
                                ? "bg-[#131314] border-slate-700 text-slate-200 placeholder-slate-600 focus:border-slate-500"
                                : "bg-[#f0f4f9] border-slate-200 text-slate-800 placeholder-slate-400 focus:bg-white focus:border-slate-300"
                            }`}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={chooseStandardPdf}
                          className={`w-full py-3.5 rounded-[20px] text-[13px] font-semibold transition-colors ${
                            isDarkMode
                              ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                              : "bg-slate-800 text-white hover:bg-slate-700"
                          }`}
                        >
                          Choose IS Standard PDF
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={chooseEngineeringPdf}
                        className={`w-full py-3.5 rounded-[20px] text-[13px] font-semibold transition-colors ${
                          isDarkMode
                            ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                            : "bg-slate-800 text-white hover:bg-slate-700"
                        }`}
                      >
                        Choose Engineering PDF
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* COMPOSER */}

            <div
              className={`absolute bottom-0 left-0 w-full pt-6 pb-6 px-4 md:px-8 bg-gradient-to-t ${
                isDarkMode
                  ? "from-[#131314] via-[#131314] to-transparent"
                  : "from-white via-white to-transparent"
              }`}
            >
              <div className="max-w-3xl mx-auto w-full">
                {/* STANDARD EMBEDDING CONTROL */}

                <div className="mb-3">
                      <div
                        className={`rounded-[18px] border px-4 py-3 shadow-sm ${
                          isDarkMode
                            ? "bg-[#1e1f20] border-slate-700"
                            : "bg-white border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p
                              className={`text-[12px] font-semibold ${
                                isDarkMode
                                  ? "text-slate-200"
                                  : "text-slate-800"
                              }`}
                            >
                              IS 10262:2009 embedding
                            </p>
                            <p
                              className={`mt-0.5 text-[11px] ${
                                isDarkMode
                                  ? "text-slate-500"
                                  : "text-slate-500"
                              }`}
                            >
                              {standardProcessingProgress
                                ? `${standardProcessingProgress.processed}/${standardProcessingProgress.total} chunks`
                                : "Ready to start"}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={repairStandardMetadata}
                              disabled={
                                isRepairingStandard ||
                                isProcessingStandard ||
                                isLoading
                              }
                              className={`px-3.5 py-2 rounded-full text-[11px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                isDarkMode
                                  ? "bg-slate-700/60 text-slate-300 hover:bg-slate-700"
                                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                              }`}
                            >
                              {isRepairingStandard
                                ? "Repairing…"
                                : "Repair citations"}
                            </button>

                            <button
                              type="button"
                              onClick={processStandardEmbeddings}
                              disabled={
                                isProcessingStandard ||
                                isRepairingStandard ||
                                isLoading
                              }
                              className={`shrink-0 px-3.5 py-2 rounded-full text-[11px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                isDarkMode
                                  ? "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                                  : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                              }`}
                            >
                              {isProcessingStandard
                                ? "Processing…"
                                : standardProcessingProgress?.percent === 100
                                ? "Completed"
                                : "Process IS 10262"}
                            </button>
                          </div>
                        </div>

                        {standardProcessingProgress && (
                          <div
                            className={`mt-3 h-1.5 rounded-full overflow-hidden ${
                              isDarkMode
                                ? "bg-slate-800"
                                : "bg-slate-100"
                            }`}
                          >
                            <div
                              className="h-full rounded-full bg-amber-500 transition-all duration-300"
                              style={{
                                width: `${standardProcessingProgress.percent}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                {/* PDF ATTACHMENT */}

                {uploadedPdfName && (
                  <div className="mb-3 flex items-center">
                    <div
                      className={`inline-flex max-w-full items-center gap-3 px-3.5 py-2.5 rounded-[18px] border shadow-sm ${
                        isDarkMode
                          ? "bg-[#1e1f20] border-slate-700 text-slate-200"
                          : "bg-white border-slate-200 text-slate-700"
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-[12px] flex items-center justify-center shrink-0 ${
                          isDarkMode
                            ? "bg-red-900/30 text-red-400"
                            : "bg-red-50 text-red-500"
                        }`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          className="w-[18px] h-[18px]"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6.75 3.75h7.5L18.75 8.25v12a1.5 1.5 0 0 1-1.5 1.5h-10.5a1.5 1.5 0 0 1-1.5-1.5v-15a1.5 1.5 0 0 1 1.5-1.5Z"
                          />

                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M14.25 3.75v4.5h4.5"
                          />
                        </svg>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-[13px] font-medium truncate max-w-[240px] md:max-w-[420px] ${
                            isDarkMode
                              ? "text-slate-200"
                              : "text-slate-800"
                          }`}
                          title={
                            uploadedPdfName
                          }
                        >
                          {uploadedPdfName}
                        </p>

                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isDarkMode
                                ? "bg-emerald-400"
                                : "bg-emerald-500"
                            }`}
                          />

                          <span
                            className={`text-[11px] ${
                              isDarkMode
                                ? "text-emerald-400"
                                : "text-emerald-600"
                            }`}
                          >
                            Memorized
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={
                          removePdfAttachment
                        }
                        disabled={
                          isLoading
                        }
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                          isDarkMode
                            ? "text-slate-500 hover:bg-slate-700 hover:text-slate-200"
                            : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        }`}
                        aria-label="Remove PDF attachment"
                        title="Remove attachment"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          className="w-4 h-4"
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
                )}

                {/* STATUS */}

                {uploadStatus && (
                  <div
                    className={`mb-3 text-[12px] px-4 py-2 rounded-full inline-flex font-medium shadow-sm ${
                      uploadStatus.type ===
                      "success"
                        ? isDarkMode
                          ? "bg-emerald-900/30 text-emerald-400"
                          : "bg-[#e6f4ea] text-[#137333]"
                        : isDarkMode
                        ? "bg-red-900/30 text-red-400"
                        : "bg-[#fce8e6] text-[#c5221f]"
                    }`}
                  >
                    {
                      uploadStatus.message
                    }
                  </div>
                )}

                {/* FORM */}

                <form
                  onSubmit={
                    customHandleSubmit
                  }
                  className={`relative flex items-end rounded-[32px] p-2 pr-4 transition-all focus-within:shadow-md border ${
                    isDarkMode
                      ? "bg-[#1e1f20] border-transparent focus-within:bg-[#333537] focus-within:border-slate-600"
                      : "bg-[#f0f4f9] border-transparent focus-within:bg-white focus-within:border-slate-200"
                  }`}
                >
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    ref={
                      fileInputRef
                    }
                    onChange={
                      handleFileUpload
                    }
                  />

                  {/* UPLOAD */}

                  <button
                    type="button"
                    onClick={openUploadDialog}
                    disabled={
                      isUploading ||
                      isLoading
                    }
                    className={`p-2.5 rounded-full transition-colors shrink-0 mb-0.5 ml-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                      isDarkMode
                        ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                    }`}
                    title={
                      uploadedPdfName
                        ? "Add or replace PDF"
                        : "Add PDF"
                    }
                  >
                    {isUploading ? (
                      <span>
                        ⏳
                      </span>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="w-5 h-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                    )}
                  </button>

                  {/* TEXT INPUT */}

                  <textarea
                    className={`flex-1 bg-transparent text-[15px] px-3 py-3 focus:outline-none resize-none min-h-[48px] max-h-[200px] ${
                      isDarkMode
                        ? "text-slate-200 placeholder-slate-500"
                        : "text-slate-800 placeholder-slate-500"
                    }`}
                    rows={1}
                    value={
                      myInput
                    }
                    placeholder="Ask about codes, mix proportions, or loads..."
                    onChange={(e) =>
                      setMyInput(
                        e.target.value
                      )
                    }
                    onKeyDown={(e) => {
                      if (
                        e.key ===
                          "Enter" &&
                        !e.shiftKey
                      ) {
                        e.preventDefault();

                        customHandleSubmit();
                      }
                    }}
                    disabled={
                      isLoading
                    }
                  />

                  {/* SEND */}

                  <button
                    type="submit"
                    disabled={
                      myInput.trim() ===
                        "" ||
                      isLoading
                    }
                    className={`p-2.5 rounded-full shrink-0 mb-0.5 transition-colors ${
                      myInput.trim() ===
                        "" ||
                      isLoading
                        ? isDarkMode
                          ? "text-slate-600"
                          : "text-slate-300"
                        : isDarkMode
                        ? "text-amber-400 hover:bg-slate-700"
                        : "text-slate-800 hover:bg-slate-200/50"
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-[22px] h-[22px]"
                    >
                      <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                    </svg>
                  </button>
                </form>

                <div
                  className={`text-center mt-2.5 text-[11px] ${
                    isDarkMode
                      ? "text-slate-500"
                      : "text-slate-400"
                  }`}
                >
                  CivilGPT can make mistakes.
                  Verify critical structural
                  calculations against IS Codes.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* CALCULATOR */}
        {/* -------------------------------------------------- */}

        {activeTab ===
          "calculator" && (
          <MixDesignCalculator
            isDarkMode={
              isDarkMode
            }
          />
        )}
      </main>
    </div>
  );
}