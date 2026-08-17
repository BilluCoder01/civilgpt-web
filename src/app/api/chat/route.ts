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

  const standardName =
    source.standard_number
      ? source.edition_year
        ? `${source.standard_number}:${source.edition_year}`
        : source.standard_number
      : null;

  if (standardName) {
    parts.push(standardName);
  }

  // Annex is part of the immutable source label when present.
  if (source.annex_no) {
    parts.push(`Annex ${source.annex_no}`);
  }

  // Clause/sub-clause is used exactly as returned by the database.
  if (source.clause_no) {
    parts.push(
      source.sub_clause_no
        ? `Clause ${source.clause_no}.${source.sub_clause_no}`
        : `Clause ${source.clause_no}`
    );
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

function buildImmutableSourceLabel(
  source: StandardChunk,
  index: number
): string {
  const sourceId = `STD-${index + 1}`;
  const citation = formatStandardCitation(source);

  return citation
    ? `${sourceId} — ${citation}`
    : `${sourceId} — No verified citation metadata`;
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
      const immutableCitation =
        buildImmutableSourceLabel(
          source,
          index
        );

      return `
[${sourceId}]
SOURCE TYPE: AUTHORITATIVE IS STANDARD

IMMUTABLE CITATION LABEL:
${immutableCitation}

Standard: ${source.standard_number || "Unknown"}
Title: ${source.standard_title || "Unknown"}
Edition Year: ${source.edition_year ?? "Unknown"}
Status: ${source.standard_status || "Unknown"}

DATABASE METADATA:
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

You have retrieved authoritative IS-standard source blocks labelled [STD-1], [STD-2], etc.

EACH SOURCE HAS ONE IMMUTABLE CITATION LABEL.

When a statement is supported by a source, cite THAT SOURCE'S IMMUTABLE CITATION LABEL exactly as written.

Example:

Source block:
[STD-2]
IMMUTABLE CITATION LABEL:
STD-2 — 10262:2009 — Table 2 — Page 8

Then your answer must use:
**Source: IS 10262:2009 — Table 2 — Page 8**

STRICT RULES:

1. Never construct a citation by combining metadata from different [STD-*] sources.
2. Never move a clause, table, annex, figure, or page from one source onto another source.
3. Never invent missing citation metadata.
4. Never use a citation component that is not present in that source's IMMUTABLE CITATION LABEL.
5. The content and the citation must come from the SAME [STD-*] source block.
6. If the source has no verified citation metadata, do not fabricate one.
7. If a second statement is supported by a different source, cite that source separately.
8. For table values, prefer the source whose CONTENT actually contains the table or table value.
9. For an example calculation, cite the source whose CONTENT actually contains that example.
10. Do not cite IS-code material from memory when the retrieved source does not support the claim.
11. When there is any uncertainty, omit the citation rather than guessing.

VISIBLE CITATION FORMAT:
**Source: <copy the human-readable citation represented by the source's IMMUTABLE CITATION LABEL>**

The source ID itself, such as STD-2, is internal and should not normally be shown to the user.
`
        : `
IS-CODE CITATION RULE

No IS-standard source was retrieved for this question.

Do not fabricate an IS-code citation.
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

SOURCE-BINDING CHECK:
Before producing any IS-code citation, identify the single [STD-*] block
whose CONTENT supports the statement. Then use only that block's
IMMUTABLE CITATION LABEL. Never merge fields from multiple sources.
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