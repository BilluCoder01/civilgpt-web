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

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey
);

const STORAGE_BUCKET = "civilgpt-pdfs";

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

type ParsedStandardChunk = {
  content: string;

  chunk_index: number;

  page_number: number | null;

  clause_no: string | null;

  sub_clause_no: string | null;

  table_no: string | null;

  figure_no: string | null;

  annex_no: string | null;

  section_title: string | null;
};

// ============================================================
// PDF PARSER
// ============================================================

async function createPdfParser(
  buffer: Buffer
) {
  const { CanvasFactory } =
    await import("pdf-parse/worker");

  const { PDFParse } =
    await import("pdf-parse");

  return {
    PDFParse,
    CanvasFactory,
    buffer,
  };
}

// ============================================================
// GET PAGE COUNT
// ============================================================

async function getPdfPageCount(
  buffer: Buffer
): Promise<number> {
  const {
    PDFParse,
    CanvasFactory,
  } = await createPdfParser(buffer);

  const parser = new PDFParse({
    data: buffer,
    CanvasFactory,
  });

  try {
    const result =
      await parser.getInfo({
        parsePageInfo: true,
      });

    return Number(result.total || 0);
  } finally {
    await parser.destroy();
  }
}

// ============================================================
// EXTRACT SINGLE PAGE
// ============================================================

async function extractSinglePageText(
  buffer: Buffer,
  pageNumber: number
): Promise<string> {
  const {
    PDFParse,
    CanvasFactory,
  } = await createPdfParser(buffer);

  const parser = new PDFParse({
    data: buffer,
    CanvasFactory,
  });

  try {
    const result =
      await parser.getText({
        partial: [pageNumber],
      });

    return result.text || "";
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
// TEXT NORMALIZATION
// ============================================================

function normalizeWhitespace(
  text: string
): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

// ============================================================
// ENGINEERING PDF CHUNKING
// ============================================================

function chunkText(
  text: string,
  maxCharacters = 1000
): string[] {
  const normalized =
    normalizeWhitespace(text);

  if (!normalized) {
    return [];
  }

  const lines =
    normalized
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  const chunks: string[] = [];

  let current = "";

  for (const line of lines) {
    const candidate =
      current.length === 0
        ? line
        : `${current}\n${line}`;

    if (
      candidate.length <=
      maxCharacters
    ) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      chunks.push(
        current.trim()
      );
    }

    if (
      line.length >
      maxCharacters
    ) {
      for (
        let i = 0;
        i < line.length;
        i += maxCharacters
      ) {
        chunks.push(
          line.substring(
            i,
            i + maxCharacters
          )
        );
      }

      current = "";
    } else {
      current = line;
    }
  }

  if (current.length > 0) {
    chunks.push(
      current.trim()
    );
  }

  return chunks;
}

// ============================================================
// CLAUSE DETECTION
// ============================================================

function detectClauseHeading(
  line: string
): {
  clause: string;
  title: string;
} | null {
  const value =
    line
      .replace(/\s+/g, " ")
      .trim();

  /*
   * Valid:
   *
   * 4 Design requirements
   * 4.2 Water content
   * 4.2.1 General
   * 4.2.1.1 Maximum water content
   *
   * Invalid:
   *
   * 11.81 in STAAD units
   * 65.0 kN at the supports
   * 130 kN = sum of reactions
   * 21,718,492.207 kN/m²
   */

  const match =
    value.match(
      /^(\d+(?:\.\d+){0,4})\s+(.+)$/
    );

  if (!match) {
    return null;
  }

  const clause =
    match[1].trim();

  const title =
    match[2].trim();

  if (!title) {
    return null;
  }

  // Must contain meaningful alphabetic text.
  if (!/[A-Za-z]/.test(title)) {
    return null;
  }

  // Reject obvious measurement/value lines.
  if (
    /^\d+(?:\.\d+)?\s*(?:kN|N|mm|cm|m|km|kg|g|MPa|kPa|Pa|GPa|kN\/m|kN\/m²|m²|m³|%|Hz|V|A|s|min|sec)\b/i.test(
      title
    )
  ) {
    return null;
  }

  // Reject values such as:
  // 11.81 in STAAD units
  if (
    /^\d+(?:\.\d+)?\s*(?:in|inch|inches)\b/i.test(
      title
    )
  ) {
    return null;
  }

  // Reject lines beginning with a raw numerical value
  // followed by engineering language.
  if (
    /^\d+(?:\.\d+)?\s+(?:at|from|to|of|in|using|with|per|for)\b/i.test(
      title
    )
  ) {
    return null;
  }

  // Reject obvious equations/calculations.
  if (
    /[=×−+]/.test(title)
  ) {
    return null;
  }

  // Avoid unreasonable clause depth.
  const depth =
    clause.split(".").length;

  if (depth > 5) {
    return null;
  }

  return {
    clause,
    title,
  };
}

// ============================================================
// TABLE DETECTION
// ============================================================

function detectTable(
  line: string
): string | null {
  const value =
    line.trim();

  const match =
    value.match(
      /^(?:table)\s+([A-Za-z]?\d+(?:\.\d+)*)\b/i
    );

  return match
    ? match[1]
    : null;
}

// ============================================================
// FIGURE DETECTION
// ============================================================

function detectFigure(
  line: string
): string | null {
  const value =
    line.trim();

  const match =
    value.match(
      /^(?:figure|fig\.)\s+([A-Za-z]?\d+(?:\.\d+)*)\b/i
    );

  return match
    ? match[1]
    : null;
}

// ============================================================
// ANNEX DETECTION
// ============================================================

function detectAnnex(
  line: string
): string | null {
  const value =
    line.trim();

  const match =
    value.match(
      /^(?:annex)\s+([A-Za-z])(?:\s*[-–—:]?\s*(.*))?$/i
    );

  if (!match) {
    return null;
  }

  return match[1].trim();
}

// ============================================================
// SECTION TITLE DETECTION
// ============================================================

function detectSectionTitle(
  line: string
): string | null {
  const value =
    line
      .replace(/\s+/g, " ")
      .trim();

  if (
    value.length < 3 ||
    value.length > 160
  ) {
    return null;
  }

  if (
    /^table\s+/i.test(value) ||
    /^figure\s+/i.test(value) ||
    /^fig\.\s+/i.test(value) ||
    /^annex\s+/i.test(value)
  ) {
    return null;
  }

  /*
   * We only treat clearly heading-like lines as generic
   * section titles.
   *
   * This prevents regular body sentences from becoming
   * citation headings.
   */

  const isUppercaseHeading =
    value ===
      value.toUpperCase() &&
    /[A-Z]/.test(value);

  if (isUppercaseHeading) {
    return value;
  }

  return null;
}

// ============================================================
// CLAUSE SPLITTER
// ============================================================

function splitClauseNumber(
  fullClause: string
): {
  clauseNo: string | null;
  subClauseNo: string | null;
} {
  const parts =
    fullClause
      .split(".")
      .map((part) =>
        part.trim()
      )
      .filter(Boolean);

  if (parts.length === 0) {
    return {
      clauseNo: null,
      subClauseNo: null,
    };
  }

  return {
    clauseNo:
      parts[0] || null,

    subClauseNo:
      parts.length > 1
        ? parts
            .slice(1)
            .join(".")
        : null,
  };
}

// ============================================================
// PAGE PARSER
// ============================================================

function parsePageIntoChunks(
  pageText: string,
  pageNumber: number,
  startingChunkIndex: number
): {
  chunks: ParsedStandardChunk[];
  nextChunkIndex: number;
} {
  const normalized =
    normalizeWhitespace(
      pageText
    );

  if (!normalized) {
    return {
      chunks: [],
      nextChunkIndex:
        startingChunkIndex,
    };
  }

  const rawLines =
    normalized
      .split("\n")
      .map((line) =>
        line.trim()
      )
      .filter(Boolean);

  let clauseNo:
    | string
    | null = null;

  let subClauseNo:
    | string
    | null = null;

  let tableNo:
    | string
    | null = null;

  let figureNo:
    | string
    | null = null;

  let annexNo:
    | string
    | null = null;

  let sectionTitle:
    | string
    | null = null;

  const annotatedLines:
    Array<{
      text: string;

      clauseNo:
        | string
        | null;

      subClauseNo:
        | string
        | null;

      tableNo:
        | string
        | null;

      figureNo:
        | string
        | null;

      annexNo:
        | string
        | null;

      sectionTitle:
        | string
        | null;
    }> = [];

  for (const line of rawLines) {
    const clause =
      detectClauseHeading(line);

    if (clause) {
      const split =
        splitClauseNumber(
          clause.clause
        );

      clauseNo =
        split.clauseNo;

      subClauseNo =
        split.subClauseNo;

      sectionTitle =
        clause.title;
    }

    const table =
      detectTable(line);

    if (table) {
      tableNo = table;
    }

    const figure =
      detectFigure(line);

    if (figure) {
      figureNo = figure;
    }

    const annex =
      detectAnnex(line);

    if (annex) {
      annexNo = annex;
    }

    const genericSection =
      detectSectionTitle(
        line
      );

    if (
      genericSection &&
      !clause
    ) {
      sectionTitle =
        genericSection;
    }

    annotatedLines.push({
      text: line,

      clauseNo,

      subClauseNo,

      tableNo,

      figureNo,

      annexNo,

      sectionTitle,
    });
  }

  const chunks:
    ParsedStandardChunk[] =
    [];

  let currentLines: string[] =
    [];

  let currentCitation:
    | {
        clauseNo:
          | string
          | null;

        subClauseNo:
          | string
          | null;

        tableNo:
          | string
          | null;

        figureNo:
          | string
          | null;

        annexNo:
          | string
          | null;

        sectionTitle:
          | string
          | null;
      }
    | null = null;

  const flushChunk =
    () => {
      if (
        currentLines.length ===
        0
      ) {
        return;
      }

      const content =
        currentLines
          .join("\n")
          .trim();

      if (!content) {
        currentLines = [];
        return;
      }

      chunks.push({
        content,

        chunk_index:
          startingChunkIndex +
          chunks.length,

        page_number:
          pageNumber,

        clause_no:
          currentCitation
            ?.clauseNo ??
          null,

        sub_clause_no:
          currentCitation
            ?.subClauseNo ??
          null,

        table_no:
          currentCitation
            ?.tableNo ??
          null,

        figure_no:
          currentCitation
            ?.figureNo ??
          null,

        annex_no:
          currentCitation
            ?.annexNo ??
          null,

        section_title:
          currentCitation
            ?.sectionTitle ??
          null,
      });

      currentLines = [];
    };

  for (const annotated of annotatedLines) {
    const citationChanged =
      currentCitation ===
        null ||
      currentCitation.clauseNo !==
        annotated.clauseNo ||
      currentCitation.subClauseNo !==
        annotated.subClauseNo ||
      currentCitation.tableNo !==
        annotated.tableNo ||
      currentCitation.figureNo !==
        annotated.figureNo ||
      currentCitation.annexNo !==
        annotated.annexNo ||
      currentCitation.sectionTitle !==
        annotated.sectionTitle;

    const currentLength =
      currentLines
        .join("\n")
        .length;

    if (
      citationChanged &&
      currentLines.length > 0
    ) {
      flushChunk();
    }

    if (
      currentLines.length > 0 &&
      currentLength +
        annotated.text.length +
        1 >
        1000
    ) {
      flushChunk();
    }

    currentLines.push(
      annotated.text
    );

    currentCitation = {
      clauseNo:
        annotated.clauseNo,

      subClauseNo:
        annotated.subClauseNo,

      tableNo:
        annotated.tableNo,

      figureNo:
        annotated.figureNo,

      annexNo:
        annotated.annexNo,

      sectionTitle:
        annotated.sectionTitle,
    };
  }

  flushChunk();

  return {
    chunks,
    nextChunkIndex:
      startingChunkIndex +
      chunks.length,
  };
}

// ============================================================
// STORAGE HELPERS
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
// ERROR RESPONSE
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
          }
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
      uploadType =
        "engineering",
      isNumber = "",
      editionYear:
        editionYearRaw = "",
      title = "",
    } = body;

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

    if (
      !filename
        .toLowerCase()
        .endsWith(".pdf")
    ) {
      await deleteStorageFile(
        storagePath
      );

      storagePathForCleanup =
        null;

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

        storagePathForCleanup =
          null;

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

        storagePathForCleanup =
          null;

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

        storagePathForCleanup =
          null;

        return errorResponse(
          "IS Standard title is required.",
          400
        );
      }
    }

    // ========================================================
    // DOWNLOAD FROM STORAGE
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
      throw new Error(
        `Failed to access uploaded PDF: ${storageDownloadError.message}`
      );
    }

    if (!storageFile) {
      throw new Error(
        "Uploaded PDF could not be found in Storage."
      );
    }

    const buffer =
      Buffer.from(
        await storageFile.arrayBuffer()
      );

    if (
      buffer.length ===
      0
    ) {
      throw new Error(
        "Uploaded PDF is empty."
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
    // DUPLICATE — ENGINEERING
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
        await deleteStorageFile(
          storagePath
        );

        storagePathForCleanup =
          null;

        const existingFilename =
          existingDocument
            .metadata
            ?.filename ||
          filename;

        return NextResponse.json({
          success: true,
          duplicate: true,
          uploadType:
            "engineering",
          filename:
            existingFilename,
          documentHash,
          message:
            "This PDF is already in your engineering knowledge base.",
        });
      }
    }

    // ========================================================
    // DUPLICATE — STANDARD
    // ========================================================

    if (
      uploadType ===
      "standard"
    ) {
      const {
        data:
          existingStandardDocument,
        error:
          standardLookupError,
      } =
        await supabaseAdmin
          .from(
            "standard_documents"
          )
          .select(
            "id, filename"
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
        existingStandardDocument
      ) {
        await deleteStorageFile(
          storagePath
        );

        storagePathForCleanup =
          null;

        return NextResponse.json({
          success: true,
          duplicate: true,
          uploadType:
            "standard",
          filename:
            existingStandardDocument.filename,
          documentHash,
          message:
            "This IS Standard PDF is already in your standards library.",
        });
      }
    }

    // ========================================================
    // ENGINEERING DOCUMENT INGESTION
    // ========================================================

    if (
      uploadType ===
      "engineering"
    ) {
      const {
        PDFParse,
        CanvasFactory,
      } =
        await createPdfParser(
          buffer
        );

      const parser =
        new PDFParse({
          data: buffer,
          CanvasFactory,
        });

      try {
        const result =
          await parser.getText();

        const cleanFullText =
          normalizeWhitespace(
            result.text || ""
          );

        if (!cleanFullText) {
          throw new Error(
            "No readable text was found in the PDF."
          );
        }

        const chunks =
          chunkText(
            cleanFullText,
            1000
          );

        if (
          chunks.length ===
          0
        ) {
          throw new Error(
            "No readable text chunks were produced from the PDF."
          );
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
            await deleteStorageFile(
              storagePath
            );

            storagePathForCleanup =
              null;

            return NextResponse.json({
              success: true,
              duplicate: true,
              uploadType:
                "engineering",
              filename,
              documentHash,
              message:
                "This PDF was already uploaded.",
            });
          }

          throw insertError;
        }

        storagePathForCleanup =
          null;

        return NextResponse.json({
          success: true,
          duplicate: false,
          uploadType:
            "engineering",
          filename,
          documentHash,
          storagePath,
          chunks:
            chunks.length,
          message:
            "PDF Memorized.",
        });
      } finally {
        await parser.destroy();
      }
    }

    // ========================================================
    // STANDARD — FIND OR CREATE STANDARD
    // ========================================================

    let standardId:
      | string
      | null = null;

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
        throw new Error(
          `This standard already exists with status "${existingStandard.status}". Review the existing standard before uploading another edition.`
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

    // ========================================================
    // PAGE COUNT
    // ========================================================

    const pageCount =
      await getPdfPageCount(
        buffer
      );

    // ========================================================
    // CREATE STANDARD DOCUMENT
    // ========================================================

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
              pageCount ||
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

        storagePathForCleanup =
          null;

        return NextResponse.json({
          success: true,
          duplicate: true,
          uploadType:
            "standard",
          filename,
          documentHash,
          message:
            "This IS Standard PDF is already in your standards library.",
        });
      }

      throw documentCreateError;
    }

    // ========================================================
    // PAGE-AWARE STANDARD INGESTION
    // ========================================================

    const allStandardChunks:
      ParsedStandardChunk[] =
      [];

    let nextChunkIndex =
      0;

    for (
      let pageNumber = 1;
      pageNumber <= pageCount;
      pageNumber++
    ) {
      const pageText =
        await extractSinglePageText(
          buffer,
          pageNumber
        );

      if (
        !normalizeWhitespace(
          pageText
        )
      ) {
        continue;
      }

      const parsed =
        parsePageIntoChunks(
          pageText,
          pageNumber,
          nextChunkIndex
        );

      allStandardChunks.push(
        ...parsed.chunks
      );

      nextChunkIndex =
        parsed.nextChunkIndex;
    }

    if (
      allStandardChunks.length ===
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

      throw new Error(
        "No readable standard text was produced during page-aware ingestion."
      );
    }

    // ========================================================
    // EMBEDDINGS
    // ========================================================

    const {
      embeddings,
    } =
      await embedMany({
        model:
          google.textEmbeddingModel(
            "gemini-embedding-2"
          ),

        values:
          allStandardChunks.map(
            (chunk) =>
              chunk.content
          ),
      });

    if (
      embeddings.length !==
      allStandardChunks.length
    ) {
      throw new Error(
        `Embedding count mismatch. Expected ${allStandardChunks.length}, got ${embeddings.length}.`
      );
    }

    // ========================================================
    // STANDARD CHUNK ROWS
    // ========================================================

    const standardRows =
      allStandardChunks.map(
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

    // ========================================================
    // INSERT STANDARD CHUNKS
    // ========================================================

    const {
      error:
        chunkInsertError,
    } =
      await supabaseAdmin
        .from(
          "standard_chunks"
        )
        .insert(
          standardRows
        );

    if (
      chunkInsertError
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

      throw chunkInsertError;
    }

    // ========================================================
    // SUCCESS
    // ========================================================

    storagePathForCleanup =
      null;

    return NextResponse.json({
      success: true,

      duplicate: false,

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

      pageCount,

      chunks:
        allStandardChunks.length,

      message:
        "IS Standard added to your standards library with page-aware citation metadata.",
    });
  } catch (error: any) {
    console.error(
      "\n❌ UPLOAD CRASH:",
      error?.message ||
        error,
      "\n"
    );

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