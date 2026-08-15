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

// ------------------------------------------------------------
// CHAT BUBBLE
// ------------------------------------------------------------

const MessageBubble = memo(
  ({
    m,
    isTyping,
    isDark,
  }: {
    m: Message;
    isTyping?: boolean;
    isDark: boolean;
  }) => {
    if (m.role === "user") {
      return (
        <div className="flex justify-end mb-8">
          <div
            className={`${
              isDark
                ? "bg-[#333537] text-slate-200"
                : "bg-[#f0f4f9] text-slate-800"
            } px-5 py-3 rounded-[24px] rounded-br-sm max-w-[85%] md:max-w-[70%] text-[15px] leading-relaxed shadow-sm`}
          >
            <div className="whitespace-pre-wrap">
              {m.content}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-start gap-4 mb-8">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-lg shrink-0 mt-1 shadow-sm border ${
            isDark
              ? "bg-amber-900/30 border-amber-800/50"
              : "bg-amber-100 border-amber-200"
          }`}
        >
          🏗️
        </div>

        <div
          className={`flex-1 max-w-[90%] md:max-w-[80%] text-[15px] leading-relaxed ${
            isDark
              ? "text-slate-300"
              : "text-slate-800"
          } ${isTyping ? "typing-cursor" : ""}`}
        >
          <ReactMarkdown
            remarkPlugins={[
              remarkMath,
              remarkGfm,
            ]}
            rehypePlugins={[rehypeKatex]}
            components={{
              h1: ({ node, ...props }) => (
                <h1
                  className={`text-2xl font-semibold mt-6 mb-4 ${
                    isDark
                      ? "text-white"
                      : "text-slate-900"
                  }`}
                  {...props}
                />
              ),

              h2: ({ node, ...props }) => (
                <h2
                  className={`text-xl font-semibold mt-5 mb-3 ${
                    isDark
                      ? "text-white"
                      : "text-slate-900"
                  }`}
                  {...props}
                />
              ),

              h3: ({ node, ...props }) => (
                <h3
                  className={`text-lg font-medium mt-4 mb-2 ${
                    isDark
                      ? "text-white"
                      : "text-slate-900"
                  }`}
                  {...props}
                />
              ),

              p: ({ node, ...props }) => (
                <p
                  className="mb-4"
                  {...props}
                />
              ),

              ul: ({ node, ...props }) => (
                <ul
                  className={`list-disc pl-5 mb-4 space-y-1.5 ${
                    isDark
                      ? "marker:text-slate-600"
                      : "marker:text-slate-400"
                  }`}
                  {...props}
                />
              ),

              ol: ({ node, ...props }) => (
                <ol
                  className={`list-decimal pl-5 mb-4 space-y-1.5 ${
                    isDark
                      ? "marker:text-slate-600"
                      : "marker:text-slate-400"
                  }`}
                  {...props}
                />
              ),

              strong: ({ node, ...props }) => (
                <strong
                  className={`font-semibold ${
                    isDark
                      ? "text-white"
                      : "text-slate-900"
                  }`}
                  {...props}
                />
              ),

              table: ({ node, ...props }) => (
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

              thead: ({ node, ...props }) => (
                <thead
                  className={`${
                    isDark
                      ? "bg-[#1e1f20] border-slate-700"
                      : "bg-[#f0f4f9] border-slate-200"
                  } border-b`}
                  {...props}
                />
              ),

              th: ({ node, ...props }) => (
                <th
                  className={`py-2.5 px-4 font-medium whitespace-nowrap ${
                    isDark
                      ? "text-slate-300"
                      : "text-slate-700"
                  }`}
                  {...props}
                />
              ),

              td: ({ node, ...props }) => (
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
        </div>
      </div>
    );
  }
);

MessageBubble.displayName = "MessageBubble";

// ------------------------------------------------------------
// MAIN COMPONENT
// ------------------------------------------------------------

export default function Chat() {
  const router = useRouter();

  const supabase = useMemo(
    () => createClient(),
    []
  );

  const [activeTab, setActiveTab] =
    useState<"chat" | "calculator">(
      "chat"
    );

  const [isSidebarOpen, setIsSidebarOpen] =
    useState(true);

  const [isDarkMode, setIsDarkMode] =
    useState(false);

  const [isSettingsOpen, setIsSettingsOpen] =
    useState(false);

  const [sessions, setSessions] =
    useState<Session[]>([]);

  // null = fresh unsaved chat
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

  const [isFetchingHistory, setIsFetchingHistory] =
    useState(true);

  // ------------------------------------------------------------
  // NEW PDF ATTACHMENT STATE
  // ------------------------------------------------------------

  const [uploadedPdfName, setUploadedPdfName] =
    useState<string | null>(null);

  // ------------------------------------------------------------
  // CALCULATOR STATE
  // ------------------------------------------------------------

  const [fck, setFck] =
    useState<number>(25);

  const [stdDev, setStdDev] =
    useState<number>(4);

  const [wcRatio, setWcRatio] =
    useState<number>(0.5);

  const [sgCement, setSgCement] =
    useState<number>(3.15);

  const [sgFA, setSgFA] =
    useState<number>(2.74);

  const [sgCA, setSgCA] =
    useState<number>(2.74);

  const [waterContent, setWaterContent] =
    useState<number>(186);

  const [mixResult, setMixResult] =
    useState<any>(null);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const messagesEndRef =
    useRef<HTMLDivElement>(null);

  // Prevent an older session request from
  // overwriting a newer session.
  const sessionLoadRef =
    useRef(0);

  // ------------------------------------------------------------
  // RESPONSIVE SIDEBAR
  // ------------------------------------------------------------

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
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

    return () => {
      window.removeEventListener(
        "resize",
        handleResize
      );
    };
  }, []);

  // ------------------------------------------------------------
  // INITIAL HISTORY LOAD
  // ------------------------------------------------------------
  // We load the list of chats but intentionally do NOT
  // open the newest one.
  // The user starts with a blank unsaved chat.
  // ------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    const loadChatHistory =
      async () => {
        setIsFetchingHistory(true);

        const {
          data: { user },
        } =
          await supabase.auth.getUser();

        if (!user || cancelled) {
          if (!cancelled) {
            setIsFetchingHistory(false);
          }

          return;
        }

        const {
          data: allSessions,
          error: sessionsError,
        } =
          await supabase
            .from("chat_sessions")
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

        if (sessionsError) {
          console.error(
            "Failed to load sessions:",
            sessionsError
          );

          setSessions([]);
          setIsFetchingHistory(false);

          return;
        }

        setSessions(
          allSessions || []
        );

        setActiveSessionId(null);
        setMessages([]);

        setIsFetchingHistory(false);
      };

    loadChatHistory();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // ------------------------------------------------------------
  // LOAD HISTORICAL SESSION
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
        window.innerWidth < 768
      ) {
        setIsSidebarOpen(false);
      }

      setActiveTab("chat");
      setActiveSessionId(sessionId);
      setIsFetchingHistory(true);
      setMessages([]);

      const {
        data: dbMessages,
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
          (dbMessages ||
            []) as Message[]
        );
      }

      setIsFetchingHistory(false);
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
  // This does not create a DB session.
  // A DB session is created only on first message.
  // ------------------------------------------------------------

  const handleNewChat =
    () => {
      if (isLoading) {
        return;
      }

      sessionLoadRef.current += 1;

      setActiveSessionId(null);
      setMessages([]);
      setMyInput("");
      setActiveTab("chat");
      setIsFetchingHistory(false);

      // Keep the uploaded PDF visible.
      // It remains in the user's RAG knowledge base.
      // This is only a UI reset for the chat itself.

      if (
        window.innerWidth < 768
      ) {
        setIsSidebarOpen(false);
      }
    };

  // ------------------------------------------------------------
  // PDF UPLOAD
  // ------------------------------------------------------------

  const handleFileUpload =
    async (
      e: React.ChangeEvent<HTMLInputElement>
    ) => {
      const file =
        e.target.files?.[0];

      if (!file) {
        return;
      }

      setIsUploading(true);
      setUploadStatus(null);

      const formData =
        new FormData();

      formData.append(
        "file",
        file
      );

      try {
        const res =
          await fetch(
            "/api/upload",
            {
              method: "POST",
              body: formData,
            }
          );

        if (!res.ok) {
          throw new Error(
            await res.text()
          );
        }

        // Keep the actual filename for the
        // attachment chip above the composer.
        setUploadedPdfName(
          file.name
        );

        setUploadStatus({
          type: "success",
          message:
            "PDF Memorized.",
        });

        setTimeout(() => {
          setUploadStatus(null);
        }, 3000);
      } catch (error: any) {
        console.error(
          "PDF upload failed:",
          error
        );

        setUploadStatus({
          type: "error",
          message:
            "Failed to read PDF.",
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
  // REMOVE PDF ATTACHMENT FROM UI
  // ------------------------------------------------------------
  // This does NOT delete the document from Supabase.
  // It only hides the visual attachment chip.
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

      // --------------------------------------------------------
      // CREATE SESSION ONLY ON FIRST MESSAGE
      // --------------------------------------------------------

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
          error: sessionError,
        } =
          await supabase
            .from("chat_sessions")
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
          sessionError ||
          !newSession
        ) {
          console.error(
            "Failed to create chat session:",
            sessionError
          );

          setUploadStatus({
            type: "error",
            message:
              "Unable to create chat session.",
          });

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

      // --------------------------------------------------------
      // CREATE LOCAL USER MESSAGE
      // --------------------------------------------------------

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
          const exactError =
            await response.text();

          setMessages(
            (prev) =>
              prev.map(
                (msg) =>
                  msg.id ===
                  aiMsgId
                    ? {
                        ...msg,
                        content:
                          `⚠️ ${exactError}`,
                      }
                    : msg
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
                (msg) =>
                  msg.id ===
                  aiMsgId
                    ? {
                        ...msg,
                        content:
                          currentAiText,
                      }
                    : msg
              )
          );
        }

        currentAiText +=
          decoder.decode();

        setMessages(
          (prev) =>
            prev.map(
              (msg) =>
                msg.id === aiMsgId
                  ? {
                      ...msg,
                      content:
                        currentAiText,
                    }
                  : msg
            )
        );

        // Update sidebar title.
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
              (msg) =>
                msg.id === aiMsgId
                  ? {
                      ...msg,
                      content:
                        "⚠️ Stream failed.",
                    }
                  : msg
            )
        );
      } finally {
        setIsLoading(false);
      }
    };

  // ------------------------------------------------------------
  // CALCULATOR
  // ------------------------------------------------------------

  const calculateMix =
    () => {
      const targetStrength =
        fck +
        1.65 *
          stdDev;

      const cement =
        waterContent /
        wcRatio;

      const volCement =
        cement /
        (sgCement *
          1000);

      const volWater =
        waterContent /
        1000;

      const airVolume =
        0.02;

      const volAggregates =
        1 -
        (volCement +
          volWater +
          airVolume);

      const volCA =
        volAggregates *
        0.6;

      const volFA =
        volAggregates *
        0.4;

      const massCA =
        volCA *
        sgCA *
        1000;

      const massFA =
        volFA *
        sgFA *
        1000;

      setMixResult({
        targetStrength:
          targetStrength.toFixed(
            2
          ),
        cement:
          cement.toFixed(
            2
          ),
        water:
          waterContent.toFixed(
            2
          ),
        fa:
          massFA.toFixed(
            2
          ),
        ca:
          massCA.toFixed(
            2
          ),
        ratio:
          `1 : ${(massFA / cement).toFixed(
            2
          )} : ${(massCA / cement).toFixed(
            2
          )}`,
      });
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
      {/* -------------------------------------------------- */}
      {/* SIDEBAR TOGGLE */}
      {/* -------------------------------------------------- */}

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

      {/* -------------------------------------------------- */}
      {/* SIDEBAR */}
      {/* -------------------------------------------------- */}

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

          {/* AI ASSISTANT */}

          <div className="relative group w-full flex justify-center md:justify-start">
            <button
              onClick={() => {
                setActiveTab("chat");

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

          {/* CALCULATOR */}

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

        {/* CHAT HISTORY */}

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
      {/* MAIN CONTENT */}
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

        {/* -------------------------------------------------- */}
        {/* CHAT */}
        {/* -------------------------------------------------- */}

        {activeTab === "chat" && (
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
                      m,
                      index
                    ) => (
                      <MessageBubble
                        key={m.id}
                        m={m}
                        isTyping={
                          isLoading &&
                          index ===
                            messages.length -
                              1 &&
                          m.role ===
                            "assistant"
                        }
                        isDark={
                          isDarkMode
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

            {/* ------------------------------------------------ */}
            {/* FLOATING COMPOSER                               */}
            {/* ------------------------------------------------ */}

            <div
              className={`absolute bottom-0 left-0 w-full pt-6 pb-6 px-4 md:px-8 bg-gradient-to-t ${
                isDarkMode
                  ? "from-[#131314] via-[#131314] to-transparent"
                  : "from-white via-white to-transparent"
              }`}
            >
              <div className="max-w-3xl mx-auto w-full">
                {/* ------------------------------------------------ */}
                {/* PDF ATTACHMENT CARD                               */}
                {/* ------------------------------------------------ */}

                {uploadedPdfName && (
                  <div className="mb-3 flex items-center">
                    <div
                      className={`group inline-flex max-w-full items-center gap-3 px-3.5 py-2.5 rounded-[18px] border shadow-sm transition-all ${
                        isDarkMode
                          ? "bg-[#1e1f20] border-slate-700 text-slate-200"
                          : "bg-white border-slate-200 text-slate-700"
                      }`}
                    >
                      {/* PDF ICON */}
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

                      {/* FILENAME + STATUS */}
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

                      {/* REMOVE FROM UI */}
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

                {/* UPLOAD STATUS */}
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

                {/* COMPOSER */}
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

                  {/* ATTACH / REPLACE */}
                  <button
                    type="button"
                    onClick={() =>
                      fileInputRef.current?.click()
                    }
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
                        ? "Replace PDF"
                        : "Upload IS Code PDF"
                    }
                  >
                    {isUploading ? (
                      <span className="text-sm">
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
          <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-12 h-full">
            <div className="max-w-4xl mx-auto w-full">
              <div
                className={`border rounded-[32px] p-8 md:p-10 shadow-sm mt-8 md:mt-2 transition-colors ${
                  isDarkMode
                    ? "bg-[#1e1f20] border-slate-800"
                    : "bg-white border-slate-200"
                }`}
              >
                <div className="mb-8">
                  <h2
                    className={`text-3xl font-medium tracking-tight ${
                      isDarkMode
                        ? "text-white"
                        : "text-slate-800"
                    }`}
                  >
                    Mix Design Calculator
                  </h2>

                  <p
                    className={`mt-2 text-[15px] ${
                      isDarkMode
                        ? "text-slate-400"
                        : "text-slate-500"
                    }`}
                  >
                    IS 10262:2019 Absolute
                    Volume Method
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
                  {/* INPUTS */}

                  <div className="space-y-5">
                    <div>
                      <label
                        className={`block text-[13px] font-medium mb-1.5 ${
                          isDarkMode
                            ? "text-slate-300"
                            : "text-slate-700"
                        }`}
                      >
                        Target Grade (fck)
                      </label>

                      <select
                        value={fck}
                        onChange={(e) =>
                          setFck(
                            Number(
                              e.target
                                .value
                            )
                          )
                        }
                        className={`w-full p-3 rounded-[16px] border outline-none text-[14px] transition-colors ${
                          isDarkMode
                            ? "bg-[#131314] border-slate-700 text-slate-200 focus:border-slate-500"
                            : "bg-[#f0f4f9] border-slate-200 text-slate-800 focus:bg-white focus:border-slate-300"
                        }`}
                      >
                        <option value={20}>
                          M20
                        </option>
                        <option value={25}>
                          M25
                        </option>
                        <option value={30}>
                          M30
                        </option>
                        <option value={40}>
                          M40
                        </option>
                      </select>
                    </div>

                    <div>
                      <label
                        className={`block text-[13px] font-medium mb-1.5 ${
                          isDarkMode
                            ? "text-slate-300"
                            : "text-slate-700"
                        }`}
                      >
                        Standard Deviation (s) -
                        N/mm²
                      </label>

                      <input
                        type="number"
                        step="0.1"
                        value={stdDev}
                        onChange={(e) =>
                          setStdDev(
                            Number(
                              e.target
                                .value
                            )
                          )
                        }
                        className={`w-full p-3 rounded-[16px] border outline-none text-[14px] transition-colors ${
                          isDarkMode
                            ? "bg-[#131314] border-slate-700 text-slate-200 focus:border-slate-500"
                            : "bg-[#f0f4f9] border-slate-200 text-slate-800 focus:bg-white focus:border-slate-300"
                        }`}
                      />
                    </div>

                    <div>
                      <label
                        className={`block text-[13px] font-medium mb-1.5 ${
                          isDarkMode
                            ? "text-slate-300"
                            : "text-slate-700"
                        }`}
                      >
                        Water-Cement Ratio
                      </label>

                      <input
                        type="number"
                        step="0.01"
                        value={wcRatio}
                        onChange={(e) =>
                          setWcRatio(
                            Number(
                              e.target
                                .value
                            )
                          )
                        }
                        className={`w-full p-3 rounded-[16px] border outline-none text-[14px] transition-colors ${
                          isDarkMode
                            ? "bg-[#131314] border-slate-700 text-slate-200 focus:border-slate-500"
                            : "bg-[#f0f4f9] border-slate-200 text-slate-800 focus:bg-white focus:border-slate-300"
                        }`}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label
                          className={`block text-[13px] font-medium mb-1.5 ${
                            isDarkMode
                              ? "text-slate-300"
                              : "text-slate-700"
                          }`}
                        >
                          Sp. Gravity (Cement)
                        </label>

                        <input
                          type="number"
                          step="0.01"
                          value={
                            sgCement
                          }
                          onChange={(e) =>
                            setSgCement(
                              Number(
                                e.target
                                  .value
                              )
                            )
                          }
                          className={`w-full p-3 rounded-[16px] border outline-none text-[14px] transition-colors ${
                            isDarkMode
                              ? "bg-[#131314] border-slate-700 text-slate-200 focus:border-slate-500"
                              : "bg-[#f0f4f9] border-slate-200 text-slate-800 focus:bg-white focus:border-slate-300"
                          }`}
                        />
                      </div>

                      <div>
                        <label
                          className={`block text-[13px] font-medium mb-1.5 ${
                            isDarkMode
                              ? "text-slate-300"
                              : "text-slate-700"
                          }`}
                        >
                          Max Water (kg/m³)
                        </label>

                        <input
                          type="number"
                          value={
                            waterContent
                          }
                          onChange={(e) =>
                            setWaterContent(
                              Number(
                                e.target
                                  .value
                              )
                            )
                          }
                          className={`w-full p-3 rounded-[16px] border outline-none text-[14px] transition-colors ${
                            isDarkMode
                              ? "bg-[#131314] border-slate-700 text-slate-200 focus:border-slate-500"
                              : "bg-[#f0f4f9] border-slate-200 text-slate-800 focus:bg-white focus:border-slate-300"
                          }`}
                        />
                      </div>
                    </div>

                    <button
                      onClick={
                        calculateMix
                      }
                      className={`w-full py-3.5 mt-2 rounded-[24px] font-medium text-[14px] transition-colors shadow-sm ${
                        isDarkMode
                          ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                          : "bg-slate-800 text-white hover:bg-slate-700"
                      }`}
                    >
                      Calculate Proportions
                    </button>
                  </div>

                  {/* RESULTS */}

                  <div
                    className={`rounded-[24px] p-8 h-full transition-colors border ${
                      isDarkMode
                        ? "bg-[#131314] border-slate-800"
                        : "bg-[#f0f4f9] border-transparent"
                    }`}
                  >
                    <h3
                      className={`text-[12px] font-medium uppercase tracking-wider mb-5 ${
                        isDarkMode
                          ? "text-slate-500"
                          : "text-slate-500"
                      }`}
                    >
                      Output per m³
                    </h3>

                    {mixResult ? (
                      <div className="space-y-4">
                        <div
                          className={`flex justify-between items-end border-b pb-2.5 ${
                            isDarkMode
                              ? "border-slate-700/50"
                              : "border-slate-200/60"
                          }`}
                        >
                          <span
                            className={`text-[14px] ${
                              isDarkMode
                                ? "text-slate-400"
                                : "text-slate-600"
                            }`}
                          >
                            Target Mean Strength
                            ($f_m$)
                          </span>

                          <span
                            className={`text-[16px] font-medium ${
                              isDarkMode
                                ? "text-slate-200"
                                : "text-slate-800"
                            }`}
                          >
                            {
                              mixResult.targetStrength
                            }{" "}
                            N/mm²
                          </span>
                        </div>

                        <div
                          className={`flex justify-between items-end border-b pb-2.5 ${
                            isDarkMode
                              ? "border-slate-700/50"
                              : "border-slate-200/60"
                          }`}
                        >
                          <span
                            className={`text-[14px] ${
                              isDarkMode
                                ? "text-slate-400"
                                : "text-slate-600"
                            }`}
                          >
                            Cement
                          </span>

                          <span
                            className={`text-[16px] font-medium ${
                              isDarkMode
                                ? "text-amber-400"
                                : "text-slate-800"
                            }`}
                          >
                            {
                              mixResult.cement
                            }{" "}
                            kg
                          </span>
                        </div>

                        <div
                          className={`flex justify-between items-end border-b pb-2.5 ${
                            isDarkMode
                              ? "border-slate-700/50"
                              : "border-slate-200/60"
                          }`}
                        >
                          <span
                            className={`text-[14px] ${
                              isDarkMode
                                ? "text-slate-400"
                                : "text-slate-600"
                            }`}
                          >
                            Water
                          </span>

                          <span
                            className={`text-[16px] font-medium ${
                              isDarkMode
                                ? "text-slate-200"
                                : "text-slate-800"
                            }`}
                          >
                            {
                              mixResult.water
                            }{" "}
                            kg
                          </span>
                        </div>

                        <div
                          className={`flex justify-between items-end border-b pb-2.5 ${
                            isDarkMode
                              ? "border-slate-700/50"
                              : "border-slate-200/60"
                          }`}
                        >
                          <span
                            className={`text-[14px] ${
                              isDarkMode
                                ? "text-slate-400"
                                : "text-slate-600"
                            }`}
                          >
                            Fine Aggregate (FA)
                          </span>

                          <span
                            className={`text-[16px] font-medium ${
                              isDarkMode
                                ? "text-slate-200"
                                : "text-slate-800"
                            }`}
                          >
                            {mixResult.fa}{" "}
                            kg
                          </span>
                        </div>

                        <div
                          className={`flex justify-between items-end border-b pb-2.5 ${
                            isDarkMode
                              ? "border-slate-700/50"
                              : "border-slate-200/60"
                          }`}
                        >
                          <span
                            className={`text-[14px] ${
                              isDarkMode
                                ? "text-slate-400"
                                : "text-slate-600"
                            }`}
                          >
                            Coarse Aggregate (CA)
                          </span>

                          <span
                            className={`text-[16px] font-medium ${
                              isDarkMode
                                ? "text-slate-200"
                                : "text-slate-800"
                            }`}
                          >
                            {mixResult.ca}{" "}
                            kg
                          </span>
                        </div>

                        <div className="pt-4 mt-4">
                          <p
                            className={`text-[12px] mb-1 font-medium ${
                              isDarkMode
                                ? "text-slate-500"
                                : "text-slate-500"
                            }`}
                          >
                            Mix Ratio (C :
                            FA : CA)
                          </p>

                          <p
                            className={`text-[26px] font-medium tracking-tight ${
                              isDarkMode
                                ? "text-white"
                                : "text-slate-800"
                            }`}
                          >
                            {
                              mixResult.ratio
                            }
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`h-full flex flex-col items-center justify-center text-center space-y-3 pb-12 ${
                          isDarkMode
                            ? "text-slate-500"
                            : "text-slate-400"
                        }`}
                      >
                        <p className="text-[14px]">
                          Adjust your parameters
                          and click calculate to
                          view the mix proportions.
                        </p>
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