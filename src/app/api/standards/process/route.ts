import { NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { embedMany } from "ai";
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

const supabaseAdmin =
  createClient(
    supabaseUrl,
    supabaseServiceKey
  );

// Keep this deliberately moderate.
// One embedMany call = one embedding API request.
const BATCH_SIZE = 20;

export async function POST(
  req: Request
) {
  try {
    // ========================================================
    // AUTH
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
          error:
            "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    // ========================================================
    // REQUEST
    // ========================================================

    const body =
      await req.json();

    const documentId =
      body?.documentId;

    if (!documentId) {
      return NextResponse.json(
        {
          error:
            "documentId is required.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // DOCUMENT
    // ========================================================

    const {
      data: document,
      error:
        documentError,
    } =
      await supabaseAdmin
        .from(
          "standard_documents"
        )
        .select(
          `
          id,
          total_chunks,
          processed_chunks,
          ingestion_status
          `
        )
        .eq(
          "id",
          documentId
        )
        .eq(
          "user_id",
          user.id
        )
        .single();

    if (
      documentError
    ) {
      return NextResponse.json(
        {
          error:
            documentError.message,
        },
        {
          status: 404,
        }
      );
    }

    if (
      document.ingestion_status ===
      "completed"
    ) {
      return NextResponse.json({
        success: true,
        status:
          "completed",
        processedChunks:
          document.processed_chunks,
        totalChunks:
          document.total_chunks,
        remaining:
          0,
      });
    }

    // ========================================================
    // FETCH NEXT EMBEDDING BATCH
    // ========================================================

    const {
      data: chunks,
      error:
        chunkError,
    } =
      await supabaseAdmin
        .from(
          "standard_chunks"
        )
        .select(
          "id, content, chunk_index"
        )
        .eq(
          "standard_document_id",
          documentId
        )
        .is(
          "embedding",
          null
        )
        .order(
          "chunk_index",
          {
            ascending:
              true,
          }
        )
        .limit(
          BATCH_SIZE
        );

    if (
      chunkError
    ) {
      throw chunkError;
    }

    // ========================================================
    // NOTHING LEFT
    // ========================================================

    if (
      !chunks ||
      chunks.length === 0
    ) {
      await supabaseAdmin
        .from(
          "standard_documents"
        )
        .update({
          ingestion_status:
            "completed",

          processed_chunks:
            document.total_chunks ||
            0,

          error_message:
            null,
        })
        .eq(
          "id",
          documentId
        )
        .eq(
          "user_id",
          user.id
        );

      return NextResponse.json({
        success: true,
        status:
          "completed",

        processedChunks:
          document.total_chunks ||
          0,

        totalChunks:
          document.total_chunks ||
          0,

        remaining:
          0,
      });
    }

    // ========================================================
    // MARK PROCESSING
    // ========================================================

    await supabaseAdmin
      .from(
        "standard_documents"
      )
      .update({
        ingestion_status:
          "processing",

        error_message:
          null,
      })
      .eq(
        "id",
        documentId
      )
      .eq(
        "user_id",
        user.id
      );

    // ========================================================
    // EMBED BATCH
    // ========================================================

    let embeddings;

    try {
      const result =
        await embedMany({
          model:
            google.textEmbeddingModel(
              "gemini-embedding-2"
            ),

          values:
            chunks.map(
              (chunk) =>
                chunk.content
            ),
        });

      embeddings =
        result.embeddings;
    } catch (
      embeddingError: any
    ) {
      const message =
        embeddingError
          ?.message ||
        String(
          embeddingError
        );

      const quotaError =
        /quota|rate.?limit|free.?tier|embed_content/i.test(
          message
        );

      await supabaseAdmin
        .from(
          "standard_documents"
        )
        .update({
          ingestion_status:
            quotaError
              ? "paused"
              : "failed",

          error_message:
            message,
        })
        .eq(
          "id",
          documentId
        )
        .eq(
          "user_id",
          user.id
        );

      return NextResponse.json(
        {
          success: false,

          status:
            quotaError
              ? "paused"
              : "failed",

          error:
            message,

          processedChunks:
            document.processed_chunks,

          totalChunks:
            document.total_chunks,

          remaining:
            Math.max(
              (document.total_chunks ||
                0) -
                (document.processed_chunks ||
                  0),
              0
            ),
        },
        {
          status:
            quotaError
              ? 429
              : 500,
        }
      );
    }

    // ========================================================
    // VALIDATE EMBEDDINGS
    // ========================================================

    if (
      embeddings.length !==
      chunks.length
    ) {
      throw new Error(
        `Embedding count mismatch. Expected ${chunks.length}, got ${embeddings.length}.`
      );
    }

    // ========================================================
    // SAVE EACH EMBEDDING
    // ========================================================

    for (
      let i = 0;
      i < chunks.length;
      i++
    ) {
      const {
        error:
          updateError,
      } =
        await supabaseAdmin
          .from(
            "standard_chunks"
          )
          .update({
            embedding:
              embeddings[
                i
              ].slice(
                0,
                768
              ),
          })
          .eq(
            "id",
            chunks[i].id
          )
          .eq(
            "standard_document_id",
            documentId
          );

      if (
        updateError
      ) {
        throw updateError;
      }
    }

    // ========================================================
    // PROGRESS
    // ========================================================

    const {
      count:
        remainingCount,
      error:
        countError,
    } =
      await supabaseAdmin
        .from(
          "standard_chunks"
        )
        .select(
          "id",
          {
            count:
              "exact",
            head: true,
          }
        )
        .eq(
          "standard_document_id",
          documentId
        )
        .is(
          "embedding",
          null
        );

    if (
      countError
    ) {
      throw countError;
    }

    const remaining =
      remainingCount ||
      0;

    const total =
      document.total_chunks ||
      0;

    const processed =
      Math.max(
        total -
          remaining,
        0
      );

    const completed =
      remaining === 0;

    await supabaseAdmin
      .from(
        "standard_documents"
      )
      .update({
        ingestion_status:
          completed
            ? "completed"
            : "processing",

        processed_chunks:
          processed,

        error_message:
          null,
      })
      .eq(
        "id",
        documentId
      )
      .eq(
        "user_id",
        user.id
      );

    return NextResponse.json({
      success: true,

      status:
        completed
          ? "completed"
          : "processing",

      processedChunks:
        processed,

      totalChunks:
        total,

      remaining,

      batchSize:
        chunks.length,

      percent:
        total > 0
          ? Math.round(
              (processed /
                total) *
                100
            )
          : 100,
    });
  } catch (
    error: any
  ) {
    console.error(
      "STANDARD PROCESS ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Failed to process embedding batch.",
      },
      {
        status: 500,
      }
    );
  }
}