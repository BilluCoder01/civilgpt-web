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

const supabaseAdmin =
  createClient(
    supabaseUrl,
    supabaseServiceKey
  );

const STORAGE_BUCKET =
  "civilgpt-pdfs";

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
// PDF
// ============================================================

async function createPdfParser(
  buffer: Buffer
) {
  const { CanvasFactory } =
    await import(
      "pdf-parse/worker"
    );

  const { PDFParse } =
    await import(
      "pdf-parse"
    );

  return {
    PDFParse,
    CanvasFactory,
    buffer,
  };
}

async function getPdfPageCount(
  buffer: Buffer
): Promise<number> {
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
      await parser.getInfo({
        parsePageInfo: true,
      });

    return Number(
      result.total || 0
    );
  } finally {
    await parser.destroy();
  }
}

async function extractSinglePageText(
  parser: any,
  pageNumber: number
): Promise<string> {
  const result =
    await parser.getText({
      partial: [
        pageNumber,
      ],
    });

  return result.text || "";
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
// TEXT
// ============================================================

function normalizeWhitespace(
  text: string
): string {
  return text
    .replace(
      /\u0000/g,
      ""
    )
    .replace(
      /\r\n/g,
      "\n"
    )
    .replace(
      /\r/g,
      "\n"
    )
    .replace(
      /[ \t]+/g,
      " "
    )
    .trim();
}

// ============================================================
// ENGINEERING CHUNKING
// ============================================================

function chunkText(
  text: string,
  maxCharacters = 1000
): string[] {
  const normalized =
    normalizeWhitespace(
      text
    );

  if (!normalized) {
    return [];
  }

  const lines =
    normalized
      .split("\n")
      .map(
        (line) =>
          line.trim()
      )
      .filter(Boolean);

  const chunks: string[] = [];

  let current = "";

  for (
    const line of lines
  ) {
    const candidate =
      current.length === 0
        ? line
        : `${current}\n${line}`;

    if (
      candidate.length <=
      maxCharacters
    ) {
      current =
        candidate;

      continue;
    }

    if (
      current.length > 0
    ) {
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
            i +
              maxCharacters
          )
        );
      }

      current = "";
    } else {
      current = line;
    }
  }

  if (
    current.length > 0
  ) {
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
      .replace(
        /\s+/g,
        " "
      )
      .trim();

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

  if (
    !/^[A-Za-z]/.test(
      title
    )
  ) {
    return null;
  }

  if (
    /^(?:in|mm|cm|m|km|kg|g|kN|N|Pa|kPa|MPa|GPa|Hz|V|A|s|sec|min|hr)\b/i.test(
      title
    )
  ) {
    return null;
  }

  if (
    /^(?:at|from|to|of|using|with|per|for)\b/i.test(
      title
    )
  ) {
    return null;
  }

  if (
    /^\d+(?:\.\d+)?\b/.test(
      title
    )
  ) {
    return null;
  }

  if (
    /[=×+−]/.test(
      title
    )
  ) {
    return null;
  }

  if (
    /\b(?:kN|N|mm|cm|m|kg|MPa|kPa|Pa|m²|m³|kN\/m|kN\/m²)\b/i.test(
      title
    ) &&
    /(?:at|from|to|of|supports?|units?|span|length|load|reaction|moment|deflection)/i.test(
      title
    )
  ) {
    return null;
  }

  if (
    /^[a-zA-Z]{1,4}\s*[\)\],:]/.test(
      title
    )
  ) {
    return null;
  }

  const depth =
    clause.split(".")
      .length;

  if (depth > 5) {
    return null;
  }

  return {
    clause,
    title,
  };
}

// ============================================================
// TABLE
// ============================================================

function detectTable(
  line: string
): string | null {
  const match =
    line
      .trim()
      .match(
        /^(?:table)\s+([A-Za-z]?\d+(?:\.\d+)*)\b/i
      );

  return match
    ? match[1]
    : null;
}

// ============================================================
// FIGURE
// ============================================================

function detectFigure(
  line: string
): string | null {
  const match =
    line
      .trim()
      .match(
        /^(?:figure|fig\.)\s+([A-Za-z]?\d+(?:\.\d+)*)\b/i
      );

  return match
    ? match[1]
    : null;
}

// ============================================================
// ANNEX
// ============================================================

function detectAnnex(
  line: string
): string | null {
  const match =
    line
      .trim()
      .match(
        /^(?:annex)\s+([A-Za-z])(?:\s*[-–—:]?\s*(.*))?$/i
      );

  return match
    ? match[1].trim()
    : null;
}

// ============================================================
// SECTION TITLE
// ============================================================

function detectSectionTitle(
  line: string
): string | null {
  const value =
    line
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  if (
    value.length < 3 ||
    value.length > 160
  ) {
    return null;
  }

  if (
    /^table\s+/i.test(
      value
    ) ||
    /^figure\s+/i.test(
      value
    ) ||
    /^fig\.\s+/i.test(
      value
    ) ||
    /^annex\s+/i.test(
      value
    )
  ) {
    return null;
  }

  const uppercaseHeading =
    value ===
      value.toUpperCase() &&
    /[A-Z]/.test(
      value
    );

  return uppercaseHeading
    ? value
    : null;
}

// ============================================================
// CLAUSE SPLITTER
// ============================================================

function splitClauseNumber(
  fullClause: string
) {
  const parts =
    fullClause
      .split(".")
      .map(
        (part) =>
          part.trim()
      )
      .filter(Boolean);

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
) {
  const normalized =
    normalizeWhitespace(
      pageText
    );

  if (!normalized) {
    return {
      chunks:
        [] as ParsedStandardChunk[],
      nextChunkIndex:
        startingChunkIndex,
    };
  }

  const rawLines =
    normalized
      .split("\n")
      .map(
        (line) =>
          line.trim()
      )
      .filter(Boolean);

  let clauseNo:
    string | null =
    null;

  let subClauseNo:
    string | null =
    null;

  let tableNo:
    string | null =
    null;

  let figureNo:
    string | null =
    null;

  let annexNo:
    string | null =
    null;

  let sectionTitle:
    string | null =
    null;

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

  for (
    const line of rawLines
  ) {
    const clause =
      detectClauseHeading(
        line
      );

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
      tableNo =
        table;
    }

    const figure =
      detectFigure(line);

    if (figure) {
      figureNo =
        figure;
    }

    const annex =
      detectAnnex(line);

    if (annex) {
      annexNo =
        annex;
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

  for (
    const annotated of annotatedLines
  ) {
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
// STORAGE
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
    await supabaseAdmin.storage
      .from(
        STORAGE_BUCKET
      )
      .remove([
        storagePath,
      ]);
  } catch (error) {
    console.error(
      "Storage cleanup failed:",
      error
    );
  }
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
    // JSON
    // ========================================================

    const body =
      (await req.json()) as UploadRequest;

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
      return NextResponse.json(
        {
          error:
            "Storage path is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !isUserStoragePath(
        storagePath,
        user.id
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid Storage path.",
        },
        {
          status: 403,
        }
      );
    }

    storagePathForCleanup =
      storagePath;

    if (!filename) {
      return NextResponse.json(
        {
          error:
            "Filename is required.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // DOWNLOAD FROM STORAGE
    // ========================================================

    const {
      data: storageFile,
      error:
        storageError,
    } =
      await supabaseAdmin.storage
        .from(
          STORAGE_BUCKET
        )
        .download(
          storagePath
        );

    if (storageError) {
      throw new Error(
        `Failed to access uploaded PDF: ${storageError.message}`
      );
    }

    if (!storageFile) {
      throw new Error(
        "Uploaded PDF could not be found."
      );
    }

    const buffer =
      Buffer.from(
        await storageFile.arrayBuffer()
      );

    if (!buffer.length) {
      throw new Error(
        "Uploaded PDF is empty."
      );
    }

    const documentHash =
      getDocumentHash(
        buffer
      );

    // ========================================================
    // ENGINEERING
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

        const chunks =
          chunkText(
            cleanFullText,
            1000
          );

        if (!chunks.length) {
          throw new Error(
            "No readable text found."
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

        const rows =
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
              rows
            );

        if (
          insertError
        ) {
          throw insertError;
        }

        storagePathForCleanup =
          null;

        return NextResponse.json({
          success: true,
          uploadType:
            "engineering",
          filename,
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
    // STANDARD METADATA
    // ========================================================

    const normalizedIsNumber =
      isNumber.trim();

    const normalizedTitle =
      title.trim();

    const editionYear =
      Number(
        editionYearRaw
      );

    if (
      !normalizedIsNumber ||
      !normalizedTitle ||
      !Number.isInteger(
        editionYear
      )
    ) {
      throw new Error(
        "IS Number, title and edition year are required."
      );
    }

    // ========================================================
    // DUPLICATE STANDARD DOCUMENT
    // ========================================================

    const {
      data:
        existingDocument,
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
        .maybeSingle();

    if (
      existingDocument
    ) {
      await deleteStorageFile(
        storagePath
      );

      storagePathForCleanup =
        null;

      return NextResponse.json({
        success: true,
        duplicate:
          true,
        uploadType:
          "standard",
        filename:
          existingDocument.filename,
        message:
          "This IS Standard PDF is already in your standards library.",
      });
    }

    // ========================================================
    // FIND / CREATE STANDARD
    // ========================================================

    let standardId:
      | string
      | null = null;

    const {
      data:
        existingStandard,
    } =
      await supabaseAdmin
        .from(
          "standards"
        )
        .select(
          "id, status"
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
      existingStandard
    ) {
      if (
        existingStandard.status !==
        "active"
      ) {
        throw new Error(
          `This standard has status "${existingStandard.status}".`
        );
      }

      standardId =
        existingStandard.id;
    } else {
      const {
        data:
          createdStandard,
        error:
          standardError,
      } =
        await supabaseAdmin
          .from(
            "standards"
          )
          .insert({
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

            user_id:
              user.id,
          })
          .select(
            "id"
          )
          .single();

      if (
        standardError
      ) {
        throw standardError;
      }

      standardId =
        createdStandard.id;
    }

    // ========================================================
    // PAGE COUNT
    // ========================================================

    const pageCount =
      await getPdfPageCount(
        buffer
      );

    // ========================================================
    // CREATE DOCUMENT
    // ========================================================

    const {
      data:
        standardDocument,
      error:
        documentError,
    } =
      await supabaseAdmin
        .from(
          "standard_documents"
        )
        .insert({
          standard_id:
            standardId,

          filename,

          document_hash:
            documentHash,

          storage_path:
            storagePath,

          page_count:
            pageCount,

          ingestion_status:
            "processing",

          total_chunks:
            null,

          processed_chunks:
            0,

          error_message:
            null,

          user_id:
            user.id,
        })
        .select(
          "id"
        )
        .single();

    if (
      documentError
    ) {
      throw documentError;
    }

    // ========================================================
    // CREATE CITATION-AWARE CHUNKS
    // ========================================================

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

    const allChunks:
      ParsedStandardChunk[] =
      [];

    try {
      let nextChunkIndex =
        0;

      for (
        let pageNumber = 1;
        pageNumber <= pageCount;
        pageNumber++
      ) {
        const pageText =
          await extractSinglePageText(
            parser,
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

        allChunks.push(
          ...parsed.chunks
        );

        nextChunkIndex =
          parsed.nextChunkIndex;
      }
    } finally {
      await parser.destroy();
    }

    if (!allChunks.length) {
      throw new Error(
        "No readable standard chunks were produced."
      );
    }

    // ========================================================
    // INSERT CHUNKS WITHOUT EMBEDDINGS
    // ========================================================

    const rows =
      allChunks.map(
        (chunk) => ({
          standard_id:
            standardId,

          standard_document_id:
            standardDocument.id,

          content:
            chunk.content,

          embedding:
            null,

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
        chunkError,
    } =
      await supabaseAdmin
        .from(
          "standard_chunks"
        )
        .insert(
          rows
        );

    if (
      chunkError
    ) {
      throw chunkError;
    }

    await supabaseAdmin
      .from(
        "standard_documents"
      )
      .update({
        total_chunks:
          allChunks.length,

        processed_chunks:
          0,

        ingestion_status:
          "processing",

        error_message:
          null,
      })
      .eq(
        "id",
        standardDocument.id
      )
      .eq(
        "user_id",
        user.id
      );

    storagePathForCleanup =
      null;

    return NextResponse.json({
      success: true,

      duplicate:
        false,

      uploadType:
        "standard",

      filename,

      storagePath,

      standardDocumentId:
        standardDocument.id,

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

      totalChunks:
        allChunks.length,

      ingestionStatus:
        "processing",

      message:
        "IS Standard prepared. Embedding processing can now continue in batches.",
    });
  } catch (
    error: any
  ) {
    console.error(
      "UPLOAD ERROR:",
      error
    );

    if (
      storagePathForCleanup
    ) {
      await deleteStorageFile(
        storagePathForCleanup
      );
    }

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