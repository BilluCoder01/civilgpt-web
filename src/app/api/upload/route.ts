import { NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { embedMany } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

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

type UploadType =
  | "engineering"
  | "standard";

// ============================================================
// PDF EXTRACTION
// ============================================================

async function extractPdf(
  buffer: Buffer
) {
  const { CanvasFactory } = await import(
    "pdf-parse/worker"
  );

  const { PDFParse } = await import(
    "pdf-parse"
  );

  const parser = new PDFParse({
    data: buffer,
    CanvasFactory,
  });

  try {
    const result =
      await parser.getText();

    return result;
  } finally {
    await parser.destroy();
  }
}

// ============================================================
// HASH
// ============================================================

function getDocumentHash(
  buffer: Buffer
): string {
  return createHash("sha256")
    .update(buffer)
    .digest("hex");
}

// ============================================================
// CLEAN TEXT
// ============================================================

function cleanText(
  text: string
): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// POST
// ============================================================

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
            "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    // ========================================================
    // FORM DATA
    // ========================================================

    const formData =
      await req.formData();

    const file =
      formData.get(
        "file"
      ) as File | null;

    const uploadType =
      (
        formData.get(
          "uploadType"
        ) || "engineering"
      ).toString() as UploadType;

    const isNumber =
      formData
        .get("isNumber")
        ?.toString()
        .trim() || "";

    const editionYearRaw =
      formData
        .get("editionYear")
        ?.toString()
        .trim() || "";

    const title =
      formData
        .get("title")
        ?.toString()
        .trim() || "";

    const editionYear =
      editionYearRaw
        ? Number(
            editionYearRaw
          )
        : null;

    if (!file) {
      return NextResponse.json(
        {
          error:
            "No file uploaded.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      uploadType !==
        "engineering" &&
      uploadType !==
        "standard"
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid upload type.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // PDF VALIDATION
    // ========================================================

    const isPdf =
      file.type ===
        "application/pdf" ||
      file.name
        .toLowerCase()
        .endsWith(".pdf");

    if (!isPdf) {
      return NextResponse.json(
        {
          error:
            "Only PDF files are supported.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // STANDARD METADATA VALIDATION
    // ========================================================

    if (
      uploadType ===
      "standard"
    ) {
      if (
        !isNumber
      ) {
        return NextResponse.json(
          {
            error:
              "IS Standard number is required.",
          },
          {
            status: 400,
          }
        );
      }

      if (
        !editionYear ||
        !Number.isInteger(
          editionYear
        ) ||
        editionYear < 1900 ||
        editionYear >
          2100
      ) {
        return NextResponse.json(
          {
            error:
              "A valid standard edition year is required.",
          },
          {
            status: 400,
          }
        );
      }

      if (!title) {
        return NextResponse.json(
          {
            error:
              "IS Standard title is required.",
          },
          {
            status: 400,
          }
        );
      }
    }

    // ========================================================
    // READ FILE
    // ========================================================

    const buffer =
      Buffer.from(
        await file.arrayBuffer()
      );

    if (
      buffer.length ===
      0
    ) {
      return NextResponse.json(
        {
          error:
            "Uploaded PDF is empty.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // HASH
    // ========================================================

    const documentHash =
      getDocumentHash(
        buffer
      );

    // ========================================================
    // DUPLICATE CHECK — ENGINEERING PDF
    // ========================================================

    if (
      uploadType ===
      "engineering"
    ) {
      const {
        data:
          existingDocument,
        error:
          duplicateCheckError,
      } =
        await supabaseAdmin
          .from(
            "engineering_documents"
          )
          .select(
            "id, metadata"
          )
          .eq(
            "user_id",
            user.id
          )
          .eq(
            "document_hash",
            documentHash
          )
          .limit(1)
          .maybeSingle();

      if (
        duplicateCheckError
      ) {
        throw duplicateCheckError;
      }

      if (
        existingDocument
      ) {
        const filename =
          existingDocument
            .metadata
            ?.filename ||
          file.name;

        return NextResponse.json(
          {
            success: true,
            duplicate:
              true,
            uploadType:
              "engineering",
            filename,
            documentHash,
            message:
              "This PDF is already in your engineering knowledge base.",
          },
          {
            status: 200,
          }
        );
      }
    }

    // ========================================================
    // DUPLICATE CHECK — IS STANDARD
    // ========================================================

    if (
      uploadType ===
      "standard"
    ) {
      const {
        data:
          existingStandard,
        error:
          standardLookupError,
      } =
        await supabaseAdmin
          .from(
            "standard_documents"
          )
          .select(
            "id, filename, standard_id"
          )
          .eq(
            "user_id",
            user.id
          )
          .eq(
            "document_hash",
            documentHash
          )
          .limit(1)
          .maybeSingle();

      if (
        standardLookupError
      ) {
        throw standardLookupError;
      }

      if (
        existingStandard
      ) {
        return NextResponse.json(
          {
            success: true,
            duplicate:
              true,
            uploadType:
              "standard",
            filename:
              existingStandard.filename,
            documentHash,
            message:
              "This IS Standard PDF is already in your standards library.",
          },
          {
            status: 200,
          }
        );
      }
    }

    // ========================================================
    // EXTRACT PDF
    // ========================================================

    const parsedPdf =
      await extractPdf(
        buffer
      );

    const rawText =
      parsedPdf.text || "";

    const cleanFullText =
      cleanText(
        rawText
      );

    if (
      cleanFullText.length ===
      0
    ) {
      return NextResponse.json(
        {
          error:
            "No readable text was found in the PDF.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // ENGINEERING PDF
    // ========================================================

    if (
      uploadType ===
      "engineering"
    ) {
      const chunks: string[] =
        [];

      for (
        let i = 0;
        i <
        cleanFullText.length;
        i += 1000
      ) {
        const chunk =
          cleanFullText.substring(
            i,
            i + 1000
          );

        if (
          chunk.trim()
            .length > 0
        ) {
          chunks.push(
            chunk.trim()
          );
        }
      }

      const {
        embeddings,
      } =
        await embedMany({
          model:
            google.textEmbeddingModel(
              "gemini-embedding-2"
            ),
          values:
            chunks,
        });

      if (
        embeddings.length !==
        chunks.length
      ) {
        throw new Error(
          `Embedding count mismatch. Expected ${chunks.length}, got ${embeddings.length}.`
        );
      }

      const rowsToInsert =
        chunks.map(
          (
            chunk,
            index
          ) => ({
            content:
              chunk,

            embedding:
              embeddings[
                index
              ].slice(
                0,
                768
              ),

            metadata: {
              filename:
                file.name,

              chunk_index:
                index,
            },

            user_id:
              user.id,

            document_hash:
              documentHash,
          })
        );

      const {
        error:
          insertError,
      } =
        await supabaseAdmin
          .from(
            "engineering_documents"
          )
          .insert(
            rowsToInsert
          );

      if (
        insertError
      ) {
        if (
          insertError.code ===
          "23505"
        ) {
          return NextResponse.json(
            {
              success: true,
              duplicate:
                true,
              uploadType:
                "engineering",
              filename:
                file.name,
              documentHash,
              message:
                "This PDF was already uploaded.",
            },
            {
              status: 200,
            }
          );
        }

        throw insertError;
      }

      return NextResponse.json(
        {
          success: true,
          duplicate:
            false,
          uploadType:
            "engineering",
          filename:
            file.name,
          documentHash,
          chunks:
            chunks.length,
          message:
            "PDF Memorized.",
        },
        {
          status: 200,
        }
      );
    }

    // ========================================================
    // STANDARD PDF
    // ========================================================

    // --------------------------------------------------------
    // 1. FIND OR CREATE STANDARD
    // --------------------------------------------------------

    let standardId:
      | string
      | null =
      null;

    const {
      data:
        existingStandard,
      error:
        standardFindError,
    } =
      await supabaseAdmin
        .from(
          "standards"
        )
        .select(
          "id, title, status"
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "is_number",
          isNumber
        )
        .eq(
          "edition_year",
          editionYear
        )
        .maybeSingle();

    if (
      standardFindError
    ) {
      throw standardFindError;
    }

    if (
      existingStandard
    ) {
      standardId =
        existingStandard.id;

      // ------------------------------------------------------
      // Do not silently reactivate a superseded/withdrawn
      // standard just because a user uploads another copy.
      // ------------------------------------------------------

      if (
        existingStandard.status !==
        "active"
      ) {
        return NextResponse.json(
          {
            error:
              `This standard already exists with status "${existingStandard.status}". Review the existing standard before uploading another edition.`,
          },
          {
            status: 409,
          }
        );
      }
    } else {
      const {
        data:
          newStandard,
        error:
          createStandardError,
      } =
        await supabaseAdmin
          .from(
            "standards"
          )
          .insert([
            {
              is_number:
                isNumber,

              title,

              edition_year:
                editionYear,

              status:
                "active",

              source:
                "manual_upload",

              source_url:
                null,

              user_id:
                user.id,
            },
          ])
          .select(
            "id"
          )
          .single();

      if (
        createStandardError
      ) {
        throw createStandardError;
      }

      standardId =
        newStandard.id;
    }

    // --------------------------------------------------------
    // 2. CREATE DOCUMENT RECORD
    // --------------------------------------------------------

    const {
      data:
        standardDocument,
      error:
        documentCreateError,
    } =
      await supabaseAdmin
        .from(
          "standard_documents"
        )
        .insert([
          {
            standard_id:
              standardId,

            filename:
              file.name,

            document_hash:
              documentHash,

            page_count:
              null,

            uploaded_at:
              new Date().toISOString(),

            user_id:
              user.id,
          },
        ])
        .select(
          "id"
        )
        .single();

    if (
      documentCreateError
    ) {
      if (
        documentCreateError.code ===
        "23505"
      ) {
        return NextResponse.json(
          {
            success: true,
            duplicate:
              true,
            uploadType:
              "standard",
            filename:
              file.name,
            documentHash,
            message:
              "This IS Standard PDF is already in your standards library.",
          },
          {
            status: 200,
          }
        );
      }

      throw documentCreateError;
    }

    // --------------------------------------------------------
    // 3. CHUNK STANDARD TEXT
    // --------------------------------------------------------
    //
    // This is intentionally a transitional chunker.
    // It preserves page/metadata architecture first.
    //
    // Clause/table/figure parsing will be improved in the
    // next ingestion stage after this upload route is verified.
    // --------------------------------------------------------

    const standardChunks: Array<{
      content: string;
      chunk_index: number;
      page_number: number | null;
      clause_no: string | null;
      sub_clause_no: string | null;
      table_no: string | null;
      figure_no: string | null;
      annex_no: string | null;
      section_title: string | null;
    }> = [];

    const basicChunks =
      [];

    for (
      let i = 0;
      i <
      cleanFullText.length;
      i += 1000
    ) {
      const chunk =
        cleanFullText.substring(
          i,
          i + 1000
        );

      if (
        chunk.trim()
          .length > 0
      ) {
        basicChunks.push(
          chunk.trim()
        );
      }
    }

    for (
      let index = 0;
      index <
      basicChunks.length;
      index++
    ) {
      const content =
        basicChunks[
          index
        ];

      standardChunks.push({
        content,

        chunk_index:
          index,

        page_number:
          null,

        clause_no:
          null,

        sub_clause_no:
          null,

        table_no:
          null,

        figure_no:
          null,

        annex_no:
          null,

        section_title:
          null,
      });
    }

    // --------------------------------------------------------
    // 4. EMBEDDINGS
    // --------------------------------------------------------

    const {
      embeddings,
    } =
      await embedMany({
        model:
          google.textEmbeddingModel(
            "gemini-embedding-2"
          ),
        values:
          standardChunks.map(
            (chunk) =>
              chunk.content
          ),
      });

    if (
      embeddings.length !==
      standardChunks.length
    ) {
      throw new Error(
        `Embedding count mismatch. Expected ${standardChunks.length}, got ${embeddings.length}.`
      );
    }

    // --------------------------------------------------------
    // 5. INSERT STANDARD CHUNKS
    // --------------------------------------------------------

    const rows =
      standardChunks.map(
        (
          chunk,
          index
        ) => ({
          standard_id:
            standardId,

          standard_document_id:
            standardDocument.id,

          content:
            chunk.content,

          embedding:
            embeddings[
              index
            ].slice(
              0,
              768
            ),

          page_number:
            chunk.page_number,

          clause_no:
            chunk.clause_no,

          sub_clause_no:
            chunk.sub_clause_no,

          table_no:
            chunk.table_no,

          figure_no:
            chunk.figure_no,

          annex_no:
            chunk.annex_no,

          section_title:
            chunk.section_title,

          chunk_index:
            chunk.chunk_index,

          user_id:
            user.id,
        })
      );

    const {
      error:
        chunkInsertError,
    } =
      await supabaseAdmin
        .from(
          "standard_chunks"
        )
        .insert(
          rows
        );

    if (
      chunkInsertError
    ) {
      // Clean up the document row if chunk ingestion
      // failed after the document record was created.
      await supabaseAdmin
        .from(
          "standard_documents"
        )
        .delete()
        .eq(
          "id",
          standardDocument.id
        )
        .eq(
          "user_id",
          user.id
        );

      throw chunkInsertError;
    }

    // ========================================================
    // SUCCESS
    // ========================================================

    return NextResponse.json(
      {
        success: true,
        duplicate:
          false,
        uploadType:
          "standard",
        filename:
          file.name,
        documentHash,
        standard: {
          id:
            standardId,
          isNumber,
          title,
          editionYear,
        },
        chunks:
          standardChunks.length,
        message:
          "IS Standard added to your standards library.",
      },
      {
        status: 200,
      }
    );
  } catch (
    error: any
  ) {
    console.error(
      "\n❌ UPLOAD CRASH:",
      error?.message ||
        error,
      "\n"
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Failed to process PDF.",
      },
      {
        status: 500,
      }
    );
  }
}