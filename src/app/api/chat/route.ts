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

if (!supabaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL is not configured."
  );
}

if (!supabaseServiceKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is not configured."
  );
}

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
// HELPERS
// ============================================================

function formatStandardCitation(
  source: StandardChunk
): string {
  const parts: string[] = [];

  const standardName = source.edition_year
    ? `${source.standard_number}:${source.edition_year}`
    : source.standard_number;

  if (standardName) {
    parts.push(standardName);
  }

  if (source.annex_no) {
    parts.push(`Annex ${source.annex_no}`);
  }

  if (source.clause_no) {
    const clause = source.sub_clause_no
      ? `${source.clause_no}.${source.sub_clause_no}`
      : source.clause_no;

    parts.push(`Clause ${clause}`);
  }

  if (source.table_no) {
    parts.push(`Table ${source.table_no}`);
  }

  if (source.figure_no) {
    parts.push(`Figure ${source.figure_no}`);
  }

  if (source.page_number !== null) {
    parts.push(`Page ${source.page_number}`);
  }

  return parts.join(" — ");
}

function safeSimilarity(
  similarity: unknown
): string {
  const value = Number(similarity);

  return Number.isFinite(value)
    ? value.toFixed(4)
    : "unknown";
}

function buildStandardContext(
  sources: StandardChunk[]
): string {
  return sources
    .map((source, index) => {
      const sourceId = `STD-${index + 1}`;
      const citation = formatStandardCitation(source);

      return `
[${sourceId}]
SOURCE TYPE: AUTHORITATIVE IS STANDARD
Standard: ${source.standard_number || "Unknown"}
Title: ${source.standard_title || "Unknown"}
Edition Year: ${source.edition_year ?? "Unknown"}
Status: ${source.standard_status || "Unknown"}

VERIFIED CITATION METADATA:
Citation: ${citation || "No citation metadata available"}
Page: ${source.page_number ?? "Unknown"}
Clause: ${source.clause_no ?? "Unknown"}
Sub-clause: ${source.sub_clause_no ?? "Unknown"}
Table: ${source.table_no ?? "Unknown"}
Figure: ${source.figure_no ?? "Unknown"}
Annex: ${source.annex_no ?? "Unknown"}
Section Title: ${source.section_title ?? "Unknown"}

Similarity: ${safeSimilarity(
  source.similarity
)}

CONTENT:
${source.content}
`.trim();
    })
    .join(
      "\n\n--------------------------------\n\n"
    );
}

function buildEngineeringContext(
  sources: EngineeringDocument[]
): string {
  return sources
    .map((source, index) => {
      const sourceId = `ENG-${index + 1}`;
      const filename =
        source.metadata?.filename ||
        "Engineering document";

      return `
[${sourceId}]
SOURCE TYPE: USER ENGINEERING DOCUMENT
Filename: ${filename}
Similarity: ${safeSimilarity(
  source.similarity
)}

CONTENT:
${source.content}
`.trim();
    })
    .join(
      "\n\n--------------------------------\n\n"
    );
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

    const cookieStore = await cookies();

    const supabaseAuth =
      createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
      sessionId: clientSessionId,
    } = body;

    if (
      !Array.isArray(messages) ||
      messages.length === 0
    ) {
      return NextResponse.json(
        {
          error: "No messages provided.",
        },
        {
          status: 400,
        }
      );
    }

    const latestMessage =
      messages[messages.length - 1];

    const latestContent =
      typeof latestMessage?.content === "string"
        ? latestMessage.content.trim()
        : "";

    if (!latestContent) {
      return NextResponse.json(
        {
          error: "The latest message is empty.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // SESSION
    // ========================================================

    let sessionId = clientSessionId;

    if (!sessionId) {
      const {
        data: existingSessions,
        error: sessionLookupError,
      } =
        await supabaseAdmin
          .from("chat_sessions")
          .select("id")
          .eq("user_id", user.id)
          .order("created_at", {
            ascending: false,
          })
          .limit(1);

      if (sessionLookupError) {
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
          error: createSessionError,
        } =
          await supabaseAdmin
            .from("chat_sessions")
            .insert([
              {
                user_id: user.id,
                title: "Engineering Workspace",
              },
            ])
            .select("id")
            .single();

        if (createSessionError) {
          throw createSessionError;
        }

        sessionId = newSession.id;
      }
    }

    // ========================================================
    // SAVE USER MESSAGE
    // ========================================================

    const {
      error: userMessageError,
    } =
      await supabaseAdmin
        .from("messages")
        .insert([
          {
            session_id: sessionId,
            role: "user",
            content: latestContent,
          },
        ]);

    if (userMessageError) {
      throw userMessageError;
    }

    // ========================================================
    // QUERY EMBEDDING
    // ========================================================

    const { embedding } =
      await embed({
        model:
          google.textEmbeddingModel(
            "gemini-embedding-2"
          ),
        value: latestContent,
      });

    const queryEmbedding =
      embedding.slice(0, 768);

    // ========================================================
    // PARALLEL RAG SEARCH
    // ========================================================

    const [
      standardsResult,
      engineeringResult,
    ] = await Promise.all([
      supabaseAdmin.rpc(
        "match_standard_chunks",
        {
          query_embedding: queryEmbedding,
          match_threshold: 0.50,
          match_count: 6,
          p_user_id: user.id,
        }
      ),

      supabaseAdmin.rpc(
        "match_engineering_codes",
        {
          query_embedding: queryEmbedding,
          match_threshold: 0.50,
          match_count: 5,
          p_user_id: user.id,
        }
      ),
    ]);

    // ========================================================
    // ERROR HANDLING
    // ========================================================

    if (standardsResult.error) {
      console.error(
        "Standards RAG error:",
        standardsResult.error
      );
    }

    if (engineeringResult.error) {
      console.error(
        "Engineering document RAG error:",
        engineeringResult.error
      );
    }

    const standardChunks =
      (standardsResult.data || []) as StandardChunk[];

    const engineeringDocuments =
      (engineeringResult.data || []) as EngineeringDocument[];

    // ========================================================
    // CONTEXT
    // ========================================================

    const hasStandards =
      standardChunks.length > 0;

    const hasEngineeringDocuments =
      engineeringDocuments.length > 0;

    const standardContext =
      hasStandards
        ? buildStandardContext(
            standardChunks
          )
        : "No matching IS-code sources were retrieved.";

    const engineeringContext =
      hasEngineeringDocuments
        ? buildEngineeringContext(
            engineeringDocuments
          )
        : "No matching engineering-document sources were retrieved.";

    // ========================================================
    // CITATION RULES
    // ========================================================

    const citationInstruction =
      hasStandards
        ? `
AUTHORITATIVE IS-CODE CITATION RULES

You have been given structured IS-standard sources labelled [STD-1], [STD-2], etc.

For every code-specific factual statement that materially depends on a retrieved standard source — including requirements, limits, formulas, definitions, procedures, table values, or prescribed methods — cite the supporting source immediately after that statement.

Use this visible format:

**Source: IS 10262:2009 — Clause 4.3 — Page 8**

or, when applicable:

**Source: IS 10262:2009 — Annex A — A-6 — Page 10**

Rules:

1. Use ONLY citation metadata explicitly provided in the corresponding [STD-*] source.
2. Never invent or infer a clause number.
3. Never invent or infer a sub-clause number.
4. Never invent or infer a table, figure, annex, or page number.
5. If a metadata field is missing, omit it rather than guessing.
6. The source title may be used for identification, but it does not replace missing citation metadata.
7. Do not cite an engineering-project PDF as though it were an IS Standard.
8. If multiple standard sources support different parts of the answer, cite them separately.
9. If the retrieved standard sources do not support a requested claim, explicitly say that the retrieved material does not establish it.
10. Do not use your pretrained memory to manufacture an IS-code citation.
11. The [STD-*] source blocks are the authoritative source identifiers for this response.

CITATION CONSISTENCY:
The citation printed in the answer must correspond to the exact [STD-*] block whose content supports that statement.
`
        : `
IS-CODE CITATION RULE

No IS-standard source was retrieved for this question.

Do not fabricate an IS-code citation.
Do not claim that a general engineering document or your pretrained knowledge is an official IS-code source.
`;

    // ========================================================
    // SYSTEM PROMPT
    // ========================================================

    const systemPrompt = `
You are CivilGPT, a professional civil and structural engineering AI assistant.

CORE BEHAVIOR

1. Answer the user's actual question directly.
2. Maintain continuity with the conversation.
3. Distinguish clearly between:
   - official code requirements,
   - retrieved source content,
   - calculations,
   - assumptions,
   - engineering judgement,
   - recommendations.
4. Never present an assumption or recommendation as a mandatory code requirement.
5. Never fabricate a source or citation.
6. For safety-critical structural or construction decisions, state important assumptions and recommend checking the applicable project-specific requirements.

SOURCE PRIORITY

When retrieved IS-standard content is relevant to the question, use it as the primary authority for code-specific statements.

User engineering/project documents may be useful for project-specific context, but they are NOT automatically authoritative code material.

${
  citationInstruction
}

RETRIEVED AUTHORITATIVE IS-STANDARD SOURCES

${standardContext}

RETRIEVED USER ENGINEERING-DOCUMENT SOURCES

${engineeringContext}

IMPORTANT:
Answer from the retrieved evidence when the question is code-specific.
If the evidence is insufficient, say so instead of guessing.
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
              if (!sessionId) {
                return;
              }

              // ------------------------------------------------
              // SAVE ASSISTANT MESSAGE
              // ------------------------------------------------

              const {
                error:
                  assistantInsertError,
              } =
                await supabaseAdmin
                  .from("messages")
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

              if (assistantInsertError) {
                console.error(
                  "Failed to save assistant message:",
                  assistantInsertError
                );

                return;
              }

              // ------------------------------------------------
              // UPDATE CHAT TITLE
              // ------------------------------------------------

              const {
                count: msgCount,
              } =
                await supabaseAdmin
                  .from("messages")
                  .select(
                    "*",
                    {
                      count: "exact",
                      head: true,
                    }
                  )
                  .eq(
                    "session_id",
                    sessionId
                  );

              if (
                msgCount !== null &&
                msgCount < 3
              ) {
                const shortTitle =
                  latestContent.length > 25
                    ? `${latestContent.substring(
                        0,
                        25
                      )}...`
                    : latestContent;

                const {
                  error: titleError,
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

                if (titleError) {
                  console.error(
                    "Failed to update chat title:",
                    titleError
                  );
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
      error?.message || error,
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