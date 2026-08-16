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

// ============================================================
// ENVIRONMENT
// ============================================================

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

// Server-side admin client.
// The service role is NEVER exposed to the browser.
const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey
);

const STORAGE_BUCKET =
  "civilgpt-pdfs";

// ============================================================
// TYPES
// ============================================================

type UploadType =
  | "engineering"
  | "standard";

type UploadRequest = {
  storagePath?: string;
  filename?: string;
  uploadType?: UploadType;

  isNumber?: string;
  editionYear?: string;
  title?: string;
};

// ============================================================
// PDF EXTRACTION
// ============================================================

async function extractPdf(
  buffer: Buffer
) {
  // pdf-parse v2.x can require the worker explicitly in a
  // Node.js server environment.
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
// SHA-256
// ============================================================

function getDocumentHash(
  buffer: Buffer
): string {
  return createHash("sha256")
    .update(buffer)
    .digest("hex");
}

// ============================================================
// TEXT CLEANING
// ============================================================

function cleanText(
  text: string
): string {
  return text
    .replace(
      /\u0000/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

// ============================================================
// STORAGE PATH VALIDATION
// ============================================================

function isUserStoragePath(
  storagePath: string,
  userId: string
): boolean {
  const expectedPrefix =
    `${userId}/`;

  return (
    storagePath.startsWith(
      expectedPrefix
    ) &&
    storagePath.length >
      expectedPrefix.length
  );
}

// ============================================================
// DELETE STORAGE OBJECT
// ============================================================

async function deleteStorageFile(
  storagePath: string
) {
  try {
    const {
      error,
    } =
      await supabaseAdmin.storage
        .from(
          STORAGE_BUCKET
        )
        .remove([
          storagePath,
        ]);

    if (error) {
      console.error(
        "Failed to remove Storage file:",
        error
      );
    }
  } catch (error) {
    console.error(
      "Storage cleanup failed:",
      error
    );
  }
}

// ============================================================
// JSON RESPONSE HELPER
// ============================================================

function errorResponse(
  message: string,
  status = 500
) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
    }
  );
}

// ============================================================
// POST
// ============================================================

export async function POST(
  req: Request
) {
  let storagePathForCleanup:
    | string
    | null = null;

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
      return errorResponse(
        "Unauthorized.",
        401
      );
    }

    // ========================================================
    // REQUEST BODY
    // ========================================================
    //
    // IMPORTANT:
    // The PDF itself is NO LONGER sent here.
    //
    // The browser uploads the PDF directly to Supabase
    // Storage and this endpoint receives only a small JSON
    // payload containing the Storage path and metadata.
    //
    // ========================================================

    let body: UploadRequest;

    try {
      body =
        (await req.json()) as UploadRequest;
    } catch {
      return errorResponse(
        "Invalid JSON request body.",
        400
      );
    }

    const {
      storagePath,
      filename,
      uploadType = "engineering",
      isNumber = "",
      editionYear:
        editionYearRaw = "",
      title = "",
    } = body;

    // ========================================================
    // BASIC VALIDATION
    // ========================================================

    if (!storagePath) {
      return errorResponse(
        "Storage path is required.",
        400
      );
    }

    if (
      !isUserStoragePath(
        storagePath,
        user.id
      )
    ) {
      return errorResponse(
        "Invalid Storage path.",
        403
      );
    }

    storagePathForCleanup =
      storagePath;

    if (!filename) {
      return errorResponse(
        "Filename is required.",
        400
      );
    }

    if (
      uploadType !==
        "engineering" &&
      uploadType !==
        "standard"
    ) {
      return errorResponse(
        "Invalid upload type.",
        400
      );
    }

    // ========================================================
    // PDF FILENAME VALIDATION
    // ========================================================

    const isPdf =
      filename
        .toLowerCase()
        .endsWith(".pdf");

    if (!isPdf) {
      await deleteStorageFile(
        storagePath
      );

      return errorResponse(
        "Only PDF files are supported.",
        400
      );
    }

    // ========================================================
    // STANDARD METADATA VALIDATION
    // ========================================================

    const normalizedIsNumber =
      isNumber.trim();

    const normalizedTitle =
      title.trim();

    const editionYear =
      editionYearRaw.trim()
        ? Number(
            editionYearRaw.trim()
          )
        : null;

    if (
      uploadType ===
      "standard"
    ) {
      if (
        !normalizedIsNumber
      ) {
        await deleteStorageFile(
          storagePath
        );

        return errorResponse(
          "IS Standard number is required.",
          400
        );
      }

      if (
        !editionYear ||
        !Number.isInteger(
          editionYear
        ) ||
        editionYear < 1900 ||
        editionYear > 2100
      ) {
        await deleteStorageFile(
          storagePath
        );

        return errorResponse(
          "A valid standard edition year is required.",
          400
        );
      }

      if (
        !normalizedTitle
      ) {
        await deleteStorageFile(
          storagePath
        );

        return errorResponse(
          "IS Standard title is required.",
          400
        );
      }
    }

    // ========================================================
    // DOWNLOAD PDF FROM PRIVATE STORAGE
    // ========================================================

    const {
      data: storageFile,
      error:
        storageDownloadError,
    } =
      await supabaseAdmin.storage
        .from(
          STORAGE_BUCKET
        )
        .download(
          storagePath
        );

    if (
      storageDownloadError
    ) {
      console.error(
        "Storage download error:",
        storageDownloadError
      );

      await deleteStorageFile(
        storagePath
      );

      return errorResponse(
        `Failed to access uploaded PDF: ${storageDownloadError.message}`,
        500
      );
    }

    if (!storageFile) {
      await deleteStorageFile(
        storagePath
      );

      return errorResponse(
        "Uploaded PDF could not be found in Storage.",
        404
      );
    }

    // ========================================================
    // BUFFER
    // ========================================================

    const buffer =
      Buffer.from(
        await storageFile.arrayBuffer()
      );

    if (
      buffer.length === 0
    ) {
      await deleteStorageFile(
        storagePath
      );

      return errorResponse(
        "Uploaded PDF is empty.",
        400
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
            "id, metadata, storage_path"
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
        const existingFilename =
          existingDocument
            .metadata
            ?.filename ||
          filename;

        // The browser already uploaded this new copy
        // to Storage. Remove that duplicate copy.
        await deleteStorageFile(
          storagePath
        );

        return NextResponse.json(
          {
            success: true,
            duplicate:
              true,
            uploadType:
              "engineering",
            filename:
              existingFilename,
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
            "id, filename, standard_id, storage_path"
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
        // Remove the newly uploaded duplicate.
        await deleteStorageFile(
          storagePath
        );

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
    // EXTRACT PDF TEXT
    // ========================================================

    const parsedPdf =
      await extractPdf(
        buffer
      );

    const rawText =
      parsedPdf.text ||
      "";

    const cleanFullText =
      cleanText(
        rawText
      );

    if (
      cleanFullText.length ===
      0
    ) {
      await deleteStorageFile(
        storagePath
      );

      return errorResponse(
        "No readable text was found in the PDF.",
        400
      );
    }

    // ========================================================
    // ENGINEERING PDF
    // ========================================================

    if (
      uploadType ===
      "engineering"
    ) {
      // ------------------------------------------------------
      // CHUNK
      // ------------------------------------------------------

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

      if (
        chunks.length === 0
      ) {
        await deleteStorageFile(
          storagePath
        );

        return errorResponse(
          "No readable text chunks were produced from the PDF.",
          400
        );
      }

      // ------------------------------------------------------
      // EMBEDDINGS
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // DATABASE ROWS
      // ------------------------------------------------------

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
              filename,
              chunk_index:
                index,

              upload_type:
                "engineering",
            },

            user_id:
              user.id,

            document_hash:
              documentHash,

            storage_path:
              storagePath,
          })
        );

      // ------------------------------------------------------
      // INSERT
      // ------------------------------------------------------

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
        // Race condition protection.
        if (
          insertError.code ===
          "23505"
        ) {
          await deleteStorageFile(
            storagePath
          );

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
                "This PDF was already uploaded.",
            },
            {
              status: 200,
            }
          );
        }

        throw insertError;
      }

      // ------------------------------------------------------
      // SUCCESS
      // ------------------------------------------------------

      // We intentionally KEEP the Storage object.
      // It is the source document associated with these rows.
      storagePathForCleanup =
        null;

      return NextResponse.json(
        {
          success: true,
          duplicate:
            false,
          uploadType:
            "engineering",
          filename,
          documentHash,
          storagePath,
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
    // FIND OR CREATE STANDARD
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
          normalizedIsNumber
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

      if (
        existingStandard.status !==
        "active"
      ) {
        await deleteStorageFile(
          storagePath
        );

        return errorResponse(
          `This standard already exists with status "${existingStandard.status}". Review the existing standard before uploading another edition.`,
          409
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
                normalizedIsNumber,

              title:
                normalizedTitle,

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

    if (!standardId) {
      throw new Error(
        "Failed to determine the standard ID."
      );
    }

    // --------------------------------------------------------
    // CREATE STANDARD DOCUMENT RECORD
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

            filename,

            document_hash:
              documentHash,

            storage_path:
              storagePath,

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
        await deleteStorageFile(
          storagePath
        );

        return NextResponse.json(
          {
            success: true,
            duplicate:
              true,
            uploadType:
              "standard",
            filename,
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
    // TRANSITIONAL STANDARD CHUNKING
    // --------------------------------------------------------
    //
    // IMPORTANT:
    // This is intentionally still the transitional chunker.
    //
    // We do NOT fabricate clause/table/page metadata.
    // Those fields remain null until we implement the
    // clause-aware/page-aware ingestion stage.
    //
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

    for (
      let i = 0,
        chunkIndex = 0;
      i <
      cleanFullText.length;
      i += 1000,
      chunkIndex++
    ) {
      const chunk =
        cleanFullText.substring(
          i,
          i + 1000
        );

      if (
        chunk.trim()
          .length === 0
      ) {
        continue;
      }

      standardChunks.push({
        content:
          chunk.trim(),

        chunk_index:
          chunkIndex,

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

    if (
      standardChunks.length ===
      0
    ) {
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

      await deleteStorageFile(
        storagePath
      );

      return errorResponse(
        "No readable standard chunks were produced from the PDF.",
        400
      );
    }

    // --------------------------------------------------------
    // EMBEDDINGS
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
    // STANDARD CHUNK ROWS
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

    // --------------------------------------------------------
    // INSERT STANDARD CHUNKS
    // --------------------------------------------------------

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
      // Remove the document record.
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

      // Remove the Storage object.
      await deleteStorageFile(
        storagePath
      );

      throw chunkInsertError;
    }

    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    storagePathForCleanup =
      null;

    return NextResponse.json(
      {
        success: true,
        duplicate:
          false,
        uploadType:
          "standard",
        filename,
        documentHash,
        storagePath,
        standard: {
          id:
            standardId,

          isNumber:
            normalizedIsNumber,

          title:
            normalizedTitle,

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

    // Only remove the uploaded object when this request
    // did not successfully persist it.
    if (
      storagePathForCleanup
    ) {
      await deleteStorageFile(
        storagePathForCleanup
      );
    }

    return errorResponse(
      error?.message ||
        "Failed to process PDF.",
      500
    );
  }
}