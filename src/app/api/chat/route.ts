import { NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { streamText, embed } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "";

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey
);

// ============================================================
// TYPES
// ============================================================

type EngineeringDocument = {
  id: number;
  content: string;
  metadata: Record<string, any> | null;
  similarity: number;
};

type StandardChunk = {
  id: number;
  content: string;

  page_number: number | null;

  clause_no: string | null;
  sub_clause_no: string | null;

  table_no: string | null;
  figure_no: string | null;
  annex_no: string | null;

  section_title: string | null;

  standard_number: string;
  standard_title: string;

  edition_year: number | null;
  standard_status: string;

  similarity: number;
};

// ============================================================
// SOURCE FORMATTER
// ============================================================

function formatStandardCitation(
  source: StandardChunk
): string {
  const parts: string[] = [];

  const standardName =
    source.edition_year
      ? `${source.standard_number}:${source.edition_year}`
      : source.standard_number;

  parts.push(standardName);

  if (source.clause_no) {
    if (source.sub_clause_no) {
      parts.push(
        `Clause ${source.clause_no}.${source.sub_clause_no}`
      );
    } else {
      parts.push(
        `Clause ${source.clause_no}`
      );
    }
  }

  if (source.table_no) {
    parts.push(
      `Table ${source.table_no}`
    );
  }

  if (source.figure_no) {
    parts.push(
      `Figure ${source.figure_no}`
    );
  }

  if (source.annex_no) {
    parts.push(
      `Annex ${source.annex_no}`
    );
  }

  if (source.page_number) {
    parts.push(
      `Page ${source.page_number}`
    );
  }

  return parts.join(" — ");
}

// ============================================================
// POST
// ============================================================

export async function POST(
  req: Request
) {
  try {
    // ========================================================
    // AUTHENTICATION
    // ========================================================

    const cookieStore =
      await cookies();

    const supabaseAuth =
      createServerClient(
        process.env
          .NEXT_PUBLIC_SUPABASE_URL!,
        process.env
          .NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
          },
        }
      );

    const {
      data: { user },
    } =
      await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    // ========================================================
    // REQUEST DATA
    // ========================================================

    const body =
      await req.json();

    const {
      messages,
      sessionId:
        clientSessionId,
    } = body;

    if (
      !Array.isArray(messages) ||
      messages.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No messages provided.",
        },
        {
          status: 400,
        }
      );
    }

    const latestMessage =
      messages[
        messages.length - 1
      ];

    const latestContent =
      typeof latestMessage?.content ===
      "string"
        ? latestMessage.content.trim()
        : "";

    if (!latestContent) {
      return NextResponse.json(
        {
          error:
            "The latest message is empty.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // SESSION
    // ========================================================

    let sessionId =
      clientSessionId;

    // --------------------------------------------------------
    // Fallback only if the frontend didn't send a session ID.
    // --------------------------------------------------------

    if (!sessionId) {
      const {
        data: existingSessions,
        error:
          sessionLookupError,
      } =
        await supabaseAdmin
          .from("chat_sessions")
          .select("id")
          .eq(
            "user_id",
            user.id
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          )
          .limit(1);

      if (
        sessionLookupError
      ) {
        throw sessionLookupError;
      }

      if (
        existingSessions &&
        existingSessions.length > 0
      ) {
        sessionId =
          existingSessions[0].id;
      } else {
        const {
          data: newSession,
          error:
            createSessionError,
        } =
          await supabaseAdmin
            .from(
              "chat_sessions"
            )
            .insert([
              {
                user_id:
                  user.id,
                title:
                  "Engineering Workspace",
              },
            ])
            .select("id")
            .single();

        if (
          createSessionError
        ) {
          throw createSessionError;
        }

        sessionId =
          newSession.id;
      }
    }

    // ========================================================
    // SAVE USER MESSAGE
    // ========================================================

    const {
      error:
        userMessageError,
    } =
      await supabaseAdmin
        .from("messages")
        .insert([
          {
            session_id:
              sessionId,
            role: "user",
            content:
              latestContent,
          },
        ]);

    if (
      userMessageError
    ) {
      throw userMessageError;
    }

    // ========================================================
    // QUERY EMBEDDING
    // ========================================================

    const {
      embedding,
    } =
      await embed({
        model:
          google.textEmbeddingModel(
            "gemini-embedding-2"
          ),
        value:
          latestContent,
      });

    // Keep compatibility with your existing
    // vector(768) database schema.
    const queryEmbedding =
      embedding.slice(
        0,
        768
      );

    // ========================================================
    // PARALLEL RAG SEARCH
    // ========================================================
    //
    // Search BOTH:
    //
    // 1. standards → authoritative IS-code material
    // 2. engineering_documents → user's general/project PDFs
    //
    // ========================================================

    const [
      standardsResult,
      engineeringResult,
    ] = await Promise.all([
      supabaseAdmin.rpc(
        "match_standard_chunks",
        {
          query_embedding:
            queryEmbedding,

          match_threshold:
            0.50,

          match_count:
            6,

          p_user_id:
            user.id,
        }
      ),

      supabaseAdmin.rpc(
        "match_engineering_codes",
        {
          query_embedding:
            queryEmbedding,

          match_threshold:
            0.50,

          match_count:
            5,

          p_user_id:
            user.id,
        }
      ),
    ]);

    // ========================================================
    // ERROR HANDLING
    // ========================================================

    if (
      standardsResult.error
    ) {
      console.error(
        "Standards RAG error:",
        standardsResult.error
      );
    }

    if (
      engineeringResult.error
    ) {
      console.error(
        "Engineering document RAG error:",
        engineeringResult.error
      );
    }

    const standardChunks =
      (standardsResult.data ||
        []) as StandardChunk[];

    const engineeringDocuments =
      (engineeringResult.data ||
        []) as EngineeringDocument[];

    // ========================================================
    // BUILD STANDARD CONTEXT
    // ========================================================

    const standardContext =
      standardChunks
        .map(
          (
            source,
            index
          ) => {
            const citation =
              formatStandardCitation(
                source
              );

            return `
[STANDARD SOURCE ${index + 1}]
Citation: ${citation}
Standard Title: ${source.standard_title}
Status: ${source.standard_status}
Similarity: ${source.similarity.toFixed(
              4
            )}

Content:
${source.content}
`.trim();
          }
        )
        .join(
          "\n\n--------------------------------\n\n"
        );

    // ========================================================
    // BUILD GENERAL ENGINEERING CONTEXT
    // ========================================================

    const engineeringContext =
      engineeringDocuments
        .map(
          (
            document,
            index
          ) => {
            const filename =
              document.metadata
                ?.filename ||
              "Engineering document";

            return `
[ENGINEERING DOCUMENT ${index + 1}]
Filename: ${filename}
Similarity: ${document.similarity.toFixed(
              4
            )}

Content:
${document.content}
`.trim();
          }
        )
        .join(
          "\n\n--------------------------------\n\n"
        );

    const hasStandards =
      standardChunks.length >
      0;

    const hasEngineeringDocuments =
      engineeringDocuments.length >
      0;

    // ========================================================
    // SOURCE INSTRUCTIONS
    // ========================================================

    const citationInstruction =
      hasStandards
        ? `
AUTHORITATIVE SOURCE CITATION RULES:

You have retrieved material from the user's IS-code knowledge base.

When your answer uses a fact, requirement, limit, formula, table value, definition, or procedure from an IS standard:

1. State the answer clearly.
2. Cite the exact standard source immediately after the relevant statement.
3. Use the citation information supplied in [STANDARD SOURCE].
4. Prefer this format:

   **Source: IS 10262:2019 — Clause 5.3 — Table 5 — Page 8**

5. Do NOT invent a clause number, table number, figure number, annex number, or page number.
6. If only a standard number is available, cite only the information that is actually available.
7. Do not claim an IS-code source when the information came only from a general engineering document.
8. If multiple standards were used, cite each relevant source separately.
9. If the retrieved source metadata conflicts with your prior knowledge, prefer the retrieved source for the answer and clearly state the retrieved citation.

Do not create citations based on memory.
Only cite source metadata actually supplied in the retrieved context.
`
        : `
IS-CODE CITATION RULE:

No IS-standard chunks were retrieved for this question.

Do not fabricate an IS-code citation.
If the answer is based on general engineering knowledge or the user's project documents, say so.
`;

    // ========================================================
    // SYSTEM PROMPT
    // ========================================================

    const systemPrompt = `
You are CivilGPT, a professional structural and civil engineering AI assistant.

Your job is to provide technically useful, careful, and traceable answers.

IMPORTANT BEHAVIOR:

1. Analyze the entire conversation history.
2. Maintain continuity between consecutive messages in the same chat.
3. Adapt explanations to the user's apparent level:
   - Student/basic question → clear step-by-step explanation.
   - Technical engineering question → precise professional explanation.
4. Never pretend that an assumption is an IS-code requirement.
5. Clearly distinguish:
   - code requirement
   - calculation
   - engineering assumption
   - trial value
   - engineering recommendation
6. For structural or construction safety matters, encourage verification against the applicable standard and project conditions.
7. Do not invent source citations.

IS-CODE PRIORITY:

When relevant IS-code material has been retrieved, treat that retrieved standard material as the primary authority for code-specific statements.

GENERAL ENGINEERING DOCUMENTS:

The user may also have personal engineering/project documents. Use those when relevant, but do not present their contents as official IS-code requirements.

${citationInstruction}

RETRIEVED IS-CODE CONTEXT:

${
  hasStandards
    ? standardContext
    : "No matching IS-code clauses were retrieved."
}

RETRIEVED GENERAL ENGINEERING DOCUMENT CONTEXT:

${
  hasEngineeringDocuments
    ? engineeringContext
    : "No matching general engineering document content was retrieved."
}
`.trim();

    // ========================================================
    // STREAM RESPONSE
    // ========================================================

    const result =
      await streamText({
        model:
          google(
            "gemini-3.6-flash"
          ),

        system:
          systemPrompt,

        messages,

        onFinish:
          async ({
            text,
          }) => {
            try {
              // ------------------------------------------------
              // SAVE ASSISTANT MESSAGE
              // ------------------------------------------------

              if (sessionId) {
                const {
                  error:
                    assistantInsertError,
                } =
                  await supabaseAdmin
                    .from(
                      "messages"
                    )
                    .insert([
                      {
                        session_id:
                          sessionId,
                        role:
                          "assistant",
                        content:
                          text,
                      },
                    ]);

                if (
                  assistantInsertError
                ) {
                  console.error(
                    "Failed to save assistant message:",
                    assistantInsertError
                  );

                  return;
                }

                // ----------------------------------------------
                // UPDATE CHAT TITLE
                // ----------------------------------------------

                const {
                  count:
                    msgCount,
                } =
                  await supabaseAdmin
                    .from(
                      "messages"
                    )
                    .select(
                      "*",
                      {
                        count:
                          "exact",
                        head: true,
                      }
                    )
                    .eq(
                      "session_id",
                      sessionId
                    );

                if (
                  msgCount !==
                    null &&
                  msgCount <
                    3
                ) {
                  const shortTitle =
                    latestContent.length >
                    25
                      ? `${latestContent.substring(
                          0,
                          25
                        )}...`
                      : latestContent;

                  const {
                    error:
                      titleError,
                  } =
                    await supabaseAdmin
                      .from(
                        "chat_sessions"
                      )
                      .update({
                        title:
                          shortTitle,
                      })
                      .eq(
                        "id",
                        sessionId
                      )
                      .eq(
                        "user_id",
                        user.id
                      );

                  if (
                    titleError
                  ) {
                    console.error(
                      "Failed to update chat title:",
                      titleError
                    );
                  }
                }
              }
            } catch (
              finishError
            ) {
              console.error(
                "onFinish database error:",
                finishError
              );
            }
          },
      });

    // ========================================================
    // RESPONSE
    // ========================================================

    return result.toTextStreamResponse();
  } catch (
    error: any
  ) {
    console.error(
      "\n❌ CHAT CRASH:",
      error?.message ||
        error,
      "\n"
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "An unexpected chat error occurred.",
      },
      {
        status: 500,
      }
    );
  }
}