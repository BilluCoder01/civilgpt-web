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
  standard_document_id?: string;
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

function isTableSource(
  source: StandardChunk
): boolean {
  return (
    source.table_no !== null &&
    source.table_no.trim() !== ""
  );
}

function isDirectTableLookupQuestion(
  question: string
): boolean {
  const q = question.toLowerCase();

  return (
    /\btable\s+\d+\b/.test(q) ||
    /\bwhat does table\b/.test(q) ||
    /\bmaximum water content\b/.test(q) ||
    /\bwater content\b/.test(q) ||
    /\bnominal maximum size\b/.test(q) ||
    /\bstandard deviation\b.*\btable\b/.test(q)
  );
}

function prioritizeStandardSources(
  sources: StandardChunk[],
  question: string
): StandardChunk[] {
  if (
    !sources.length ||
    !isDirectTableLookupQuestion(question)
  ) {
    return sources;
  }

  const tableSources =
    sources.filter(isTableSource);

  if (!tableSources.length) {
    return sources;
  }

  return [
    ...tableSources,
    ...sources.filter(
      (source) => !isTableSource(source)
    ),
  ];
}

function buildStandardContext(
  sources: StandardChunk[]
): {
  context: string;
  citationMap: Map<string, string>;
} {
  const citationMap =
    new Map<string, string>();

  const blocks = sources.map(
    (source, index) => {
      const sourceId =
        `STD-${index + 1}`;

      const citationText =
        formatStandardCitation(source);

      const docId = source.standard_document_id || "";
      const page = source.page_number || 1;
      
      const citationLink = docId 
        ? `[Source: ${citationText}](#viewer/${docId}/${page}/${source.similarity.toFixed(3)})` 
        : `**Source: ${citationText}**`;

      citationMap.set(
        sourceId,
        citationLink
      );

      const role =
        isTableSource(source)
          ? "DIRECT TABLE SOURCE — PREFER FOR DIRECT TABLE/VALUE QUESTIONS"
          : "GENERAL STANDARD SOURCE";

      const metaLines = [
        `Standard: ${source.standard_number || "Unknown"}`,
        `Title: ${source.standard_title || "Unknown"}`,
        `Edition Year: ${source.edition_year ?? "Unknown"}`,
        `Status: ${source.standard_status || "Unknown"}`,
        `Page: ${source.page_number ?? "Unknown"}`,
        `Clause: ${source.clause_no ?? "Unknown"}`,
        `Sub-clause: ${source.sub_clause_no ?? "Unknown"}`,
        `Table: ${source.table_no ?? "Unknown"}`,
        `Figure: ${source.figure_no ?? "Unknown"}`,
        `Annex: ${source.annex_no ?? "Unknown"}`,
        `Section Title: ${source.section_title ?? "Unknown"}`,
        `Similarity: ${safeSimilarity(source.similarity)}`,
      ];

      return [
        `[${sourceId}]`,
        `SourceRole: ${role}`,
        `VerifiedCitation: ${citationText || "No verified citation metadata"}`,
        metaLines.join(" | "),
        "Content:",
        source.content.trim(),
      ].join("\n");
    }
  );

  return {
    context: blocks.join(
      "\n\n--------------------------------\n\n"
    ),
    citationMap,
  };
}


function safeSimilarity(
  similarity: unknown
): string {
  const value = Number(similarity);

  return Number.isFinite(value)
    ? value.toFixed(4)
    : "unknown";
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
// DETERMINISTIC CITATION TOKEN REWRITE
// ============================================================

const CITATION_TOKEN_REGEX =
  /\[\[CITE:(STD-\d+)\]\]/g;

function stripModelAuthoredCitations(
  text: string
): string {
  return text
    .replace(
      /\*\*Source:\s*[^*\n]+?\*\*/gi,
      ""
    )
    .replace(
      /\\bSource:\s*(?:IS\s*)?\\d{4,6}\s*(?::\s*\\d{4})?(?:\s*[—-]\s*(?:Clause|Table|Figure|Annex|Page|A-\d+|B-\d+)[^.\\n]*)?/gi,
      ""
    )
    .replace(
      /\\b(?:IS\s*)?\\d{4,6}\s*:\s*\\d{4}\s*[—-]\s*(?:Clause|Table|Figure|Annex|Page)[^.\\n]*/gi,
      ""
    )
    .replace(/\\n{3,}/g, "\\n\\n")
    .trim();
}

function replaceCitationTokens(
  text: string,
  citationMap: Map<string, string>
): string {
  const cleaned =
    stripModelAuthoredCitations(text);

  return cleaned.replace(
    CITATION_TOKEN_REGEX,
    (_match, sourceId: string) => {
      const citation =
        citationMap.get(sourceId);

      return citation ? citation : "";
    }
  );
}

function createCitationRewriteStream(
  citationMap: Map<string, string>
): TransformStream<
  Uint8Array,
  Uint8Array
> {
  const decoder =
    new TextDecoder();

  const encoder =
    new TextEncoder();

  let pending = "";

  const flushSafe = (
    controller: TransformStreamDefaultController<Uint8Array>,
    flushAll: boolean
  ) => {
    if (!pending) {
      return;
    }

    if (!flushAll) {
      const lastTokenStart =
        pending.lastIndexOf(
          "[[CITE:"
        );

      if (lastTokenStart !== -1) {
        const closing =
          pending.indexOf(
            "]]",
            lastTokenStart
          );

        if (closing === -1) {
          const safePrefix =
            pending.slice(
              0,
              lastTokenStart
            );

          pending =
            pending.slice(
              lastTokenStart
            );

          if (safePrefix) {
            controller.enqueue(
              encoder.encode(
                replaceCitationTokens(
                  safePrefix,
                  citationMap
                )
              )
            );
          }

          return;
        }
      }
    }

    if (flushAll) {
      pending =
        pending.replace(
          /\[\[CITE:[A-Za-z0-9_-]*$/,
          ""
        );
    }

    const rewritten =
      replaceCitationTokens(
        pending,
        citationMap
      );

    pending = "";

    if (rewritten) {
      controller.enqueue(
        encoder.encode(
          rewritten
        )
      );
    }
  };

  return new TransformStream<
    Uint8Array,
    Uint8Array
  >({
    transform(
      chunk,
      controller
    ) {
      pending +=
        decoder.decode(
          chunk,
          { stream: true }
        );

      flushSafe(
        controller,
        false
      );
    },

    flush(controller) {
      pending +=
        decoder.decode();

      flushSafe(
        controller,
        true
      );
    },
  });
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
    // PARALLEL RAG SEARCH (SUPER LIGHTWEIGHT FOR SPEED)
    // ========================================================

    const [
      standardsResult,
      engineeringResult,
    ] = await Promise.all([
      supabaseAdmin.rpc(
        "match_standard_chunks",
        {
          query_embedding: queryEmbedding,
          match_threshold: 0.40, // Slightly lowered threshold
          match_count: 2,        // Reduced to 2 for instant execution
          p_user_id: user.id,
        }
      ),

      supabaseAdmin.rpc(
        "match_engineering_codes",
        {
          query_embedding: queryEmbedding,
          match_threshold: 0.40,
          match_count: 2,        // Reduced to 2 for instant execution
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

    const prioritizedStandardChunks =
      prioritizeStandardSources(
        standardChunks,
        latestContent
      );

    const {
      context: standardContext,
      citationMap,
    } =
      hasStandards
        ? buildStandardContext(
            prioritizedStandardChunks
          )
        : {
            context:
              "No matching IS-code sources were retrieved.",
            citationMap:
              new Map<string, string>(),
          };

    const engineeringContext =
      hasEngineeringDocuments
        ? buildEngineeringContext(
            engineeringDocuments
          )
        : "No matching engineering-document sources were retrieved.";

    // ========================================================
    // CITATION + SYSTEM PROMPT
    // ========================================================

    const citationInstruction =
      hasStandards
        ? `
AUTHORITATIVE IS-CODE CITATION RULES

The retrieved IS-standard sources are labelled [STD-1], [STD-2], etc.

Do NOT write human-readable IS-code citations yourself.

When a statement is supported by a standard source, output ONLY its exact
source token at the end of the supported statement:

[[CITE:STD-1]]
[[CITE:STD-2]]

Strict rules:

1. The token MUST refer to the single source whose CONTENT supports the statement.
2. Never combine metadata from different sources.
3. Never invent clause, sub-clause, table, figure, annex, edition, or page information.
4. Never output "Source: IS ..." yourself. The server inserts that text.
5. For a direct table/value question, prefer a source labelled:
   DIRECT TABLE SOURCE — PREFER FOR DIRECT TABLE/VALUE QUESTIONS
   when that source's CONTENT contains the requested value.
6. You are NOT allowed to write any human-readable citation or "Source: ..." text yourself. The server will generate it from [[CITE:STD-X]] tokens only.
6. Do not cite an Annex/example merely because it repeats a value that is already
   directly present in a retrieved table.
7. If no retrieved standard source supports the code-specific statement,
   say that the retrieved evidence is insufficient.
8. Do not output bare [STD-1]. Always use [[CITE:STD-1]].
9. Do not invent citation tokens that were not supplied.
`
        : `
IS-CODE CITATION RULE

No IS-standard chunks were retrieved for this question.
Do not fabricate an IS-code citation.
`;

    const systemPrompt = `
You are CivilGPT, a professional civil and structural engineering AI assistant.

CORE BEHAVIOR

1. Answer the user's actual question directly.
2. Maintain continuity with the conversation.
3. Distinguish official code requirements from calculations, assumptions,
   engineering judgement, recommendations, and project-document content.
4. Never present an assumption as an IS-code requirement.
5. Never fabricate a citation.
6. For safety-critical engineering decisions, clearly state important assumptions.

SOURCE PRIORITY

When relevant IS-standard material has been retrieved, use that material as
the primary authority for code-specific statements.

User engineering/project documents may provide project context but are not
automatically official code requirements.

${citationInstruction}

RETRIEVED IS-STANDARD CONTEXT:

${
  hasStandards
    ? standardContext
    : "No matching IS-code sources were retrieved."
}

RETRIEVED ENGINEERING-DOCUMENT CONTEXT:

${
  hasEngineeringDocuments
    ? engineeringContext
    : "No matching engineering-document sources were retrieved."
}

IMPORTANT SOURCE-BINDING CHECK

Before emitting a citation token, identify the ONE [STD-*] source whose
CONTENT supports the statement. Emit only that source's token.
Never borrow citation metadata from another source.
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
                        replaceCitationTokens(
                          text,
                          citationMap
                        ),
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

    const rawResponse =
      result.toTextStreamResponse();

    if (!rawResponse.body) {
      return rawResponse;
    }

    const rewrittenBody =
      rawResponse.body.pipeThrough(
        createCitationRewriteStream(
          citationMap
        )
      );

    const headers =
      new Headers(
        rawResponse.headers
      );

    headers.set(
      "Content-Type",
      "text/plain; charset=utf-8"
    );

    return new Response(
      rewrittenBody,
      {
        status:
          rawResponse.status,
        headers,
      }
    );
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