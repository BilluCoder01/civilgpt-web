import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STORAGE_BUCKET = "civilgpt-pdfs";

type ParsedChunk = {
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
// TEXT HELPERS
// ============================================================

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function detectClauseHeading(
  line: string
): { clause: string; title: string } | null {
  const value = line.replace(/\s+/g, " ").trim();

  const match = value.match(
    /^(\d+(?:\.\d+){0,4})\s+(.+)$/
  );

  if (!match) return null;

  const clause = match[1].trim();
  const title = match[2].trim();

  if (!title) return null;

  // Heading should begin with a word.
  if (!/^[A-Za-z]/.test(title)) return null;

  // Reject measurement/value fragments.
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

  if (/^\d+(?:\.\d+)?\b/.test(title)) {
    return null;
  }

  if (/[=×+−]/.test(title)) {
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

  return {
    clause,
    title,
  };
}

function splitClauseNumber(fullClause: string) {
  const parts = fullClause
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    clauseNo: parts[0] || null,
    subClauseNo:
      parts.length > 1
        ? parts.slice(1).join(".")
        : null,
  };
}

function detectTable(line: string): string | null {
  const match = line
    .trim()
    .match(
      /^(?:table)\s+([A-Za-z]?\d+(?:\.\d+)*)\b/i
    );

  return match ? match[1] : null;
}

function detectFigure(line: string): string | null {
  const match = line
    .trim()
    .match(
      /^(?:figure|fig\.)\s+([A-Za-z]?\d+(?:\.\d+)*)\b/i
    );

  return match ? match[1] : null;
}

function detectAnnex(line: string): string | null {
  const match = line
    .trim()
    .match(
      /^(?:annex)\s+([A-Za-z])(?:\s*[-–—:]?\s*(.*))?$/i
    );

  return match ? match[1].trim() : null;
}

function detectSectionTitle(line: string): string | null {
  const value = line.replace(/\s+/g, " ").trim();

  if (value.length < 3 || value.length > 160) {
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

  const uppercaseHeading =
    value === value.toUpperCase() &&
    /[A-Z]/.test(value);

  return uppercaseHeading ? value : null;
}

// ============================================================
// PAGE PARSER
// ============================================================

function parsePageIntoChunks(
  pageText: string,
  pageNumber: number,
  startingChunkIndex: number
): {
  chunks: ParsedChunk[];
  nextChunkIndex: number;
} {
  const normalized = normalizeWhitespace(pageText);

  if (!normalized) {
    return {
      chunks: [],
      nextChunkIndex: startingChunkIndex,
    };
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let clauseNo: string | null = null;
  let subClauseNo: string | null = null;
  let tableNo: string | null = null;
  let figureNo: string | null = null;
  let annexNo: string | null = null;
  let sectionTitle: string | null = null;

  const annotated: Array<{
    text: string;
    clauseNo: string | null;
    subClauseNo: string | null;
    tableNo: string | null;
    figureNo: string | null;
    annexNo: string | null;
    sectionTitle: string | null;
  }> = [];

  for (const line of lines) {
    const clause = detectClauseHeading(line);

    if (clause) {
      const split = splitClauseNumber(clause.clause);

      clauseNo = split.clauseNo;
      subClauseNo = split.subClauseNo;
      sectionTitle = clause.title;
    }

    const table = detectTable(line);
    if (table) tableNo = table;

    const figure = detectFigure(line);
    if (figure) figureNo = figure;

    const annex = detectAnnex(line);
    if (annex) annexNo = annex;

    const genericSection = detectSectionTitle(line);

    if (genericSection && !clause) {
      sectionTitle = genericSection;
    }

    annotated.push({
      text: line,
      clauseNo,
      subClauseNo,
      tableNo,
      figureNo,
      annexNo,
      sectionTitle,
    });
  }

  const chunks: ParsedChunk[] = [];

  let currentLines: string[] = [];

  let currentCitation: {
    clauseNo: string | null;
    subClauseNo: string | null;
    tableNo: string | null;
    figureNo: string | null;
    annexNo: string | null;
    sectionTitle: string | null;
  } | null = null;

  const flush = () => {
    if (!currentLines.length) return;

    const content = currentLines.join("\n").trim();

    if (!content) {
      currentLines = [];
      return;
    }

    chunks.push({
      content,
      chunk_index:
        startingChunkIndex + chunks.length,
      page_number: pageNumber,
      clause_no: currentCitation?.clauseNo ?? null,
      sub_clause_no:
        currentCitation?.subClauseNo ?? null,
      table_no: currentCitation?.tableNo ?? null,
      figure_no: currentCitation?.figureNo ?? null,
      annex_no: currentCitation?.annexNo ?? null,
      section_title:
        currentCitation?.sectionTitle ?? null,
    });

    currentLines = [];
  };

  for (const item of annotated) {
    const citationChanged =
      currentCitation === null ||
      currentCitation.clauseNo !== item.clauseNo ||
      currentCitation.subClauseNo !== item.subClauseNo ||
      currentCitation.tableNo !== item.tableNo ||
      currentCitation.figureNo !== item.figureNo ||
      currentCitation.annexNo !== item.annexNo ||
      currentCitation.sectionTitle !== item.sectionTitle;

    const currentLength = currentLines.join("\n").length;

    if (citationChanged && currentLines.length > 0) {
      flush();
    }

    if (
      currentLines.length > 0 &&
      currentLength + item.text.length + 1 > 1000
    ) {
      flush();
    }

    currentLines.push(item.text);

    currentCitation = {
      clauseNo: item.clauseNo,
      subClauseNo: item.subClauseNo,
      tableNo: item.tableNo,
      figureNo: item.figureNo,
      annexNo: item.annexNo,
      sectionTitle: item.sectionTitle,
    };
  }

  flush();

  return {
    chunks,
    nextChunkIndex:
      startingChunkIndex + chunks.length,
  };
}

// ============================================================
// POST
// ============================================================

export async function POST(req: Request) {
  try {
    // --------------------------------------------------------
    // AUTH
    // --------------------------------------------------------

    const cookieStore = await cookies();

    const supabaseAuth = createServerClient(
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
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    // --------------------------------------------------------
    // INPUT
    // --------------------------------------------------------

    const body = await req.json();

    const standardId = body?.standardId;
    const storagePath = body?.storagePath;

    if (!standardId || !storagePath) {
      return NextResponse.json(
        {
          error:
            "standardId and storagePath are required.",
        },
        { status: 400 }
      );
    }

    if (!storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json(
        { error: "Invalid Storage path." },
        { status: 403 }
      );
    }

    // --------------------------------------------------------
    // STANDARD
    // --------------------------------------------------------

    const {
      data: standard,
      error: standardError,
    } = await supabaseAdmin
      .from("standards")
      .select(
        "id, is_number, title, edition_year, status"
      )
      .eq("id", standardId)
      .eq("user_id", user.id)
      .single();

    if (standardError) throw standardError;

    // --------------------------------------------------------
    // EXISTING PDF
    // --------------------------------------------------------

    const {
      data: storageFile,
      error: storageError,
    } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .download(storagePath);

    if (storageError) throw storageError;

    if (!storageFile) {
      throw new Error(
        "PDF was not found in Storage."
      );
    }

    const buffer = Buffer.from(
      await storageFile.arrayBuffer()
    );

    if (!buffer.length) {
      throw new Error("PDF is empty.");
    }

    // --------------------------------------------------------
    // PDF PARSER
    // --------------------------------------------------------

    const { CanvasFactory } =
      await import("pdf-parse/worker");

    const { PDFParse } =
      await import("pdf-parse");

    const parser = new PDFParse({
      data: buffer,
      CanvasFactory,
    });

    let pageCount = 0;

    try {
      const info = await parser.getInfo({
        parsePageInfo: true,
      });

      pageCount = Number(info.total || 0);

      if (!pageCount) {
        throw new Error(
          "Could not determine the PDF page count."
        );
      }

      // ------------------------------------------------------
      // PARSE PAGES
      // ------------------------------------------------------

      const allChunks: ParsedChunk[] = [];

      let nextChunkIndex = 0;

      for (
        let pageNumber = 1;
        pageNumber <= pageCount;
        pageNumber++
      ) {
        const pageResult = await parser.getText({
          partial: [pageNumber],
        });

        const pageText =
          pageResult.text || "";

        if (!normalizeWhitespace(pageText)) {
          continue;
        }

        const parsed = parsePageIntoChunks(
          pageText,
          pageNumber,
          nextChunkIndex
        );

        allChunks.push(...parsed.chunks);

        nextChunkIndex =
          parsed.nextChunkIndex;
      }

      if (!allChunks.length) {
        throw new Error(
          "No readable citation-aware chunks were produced."
        );
      }

      // ------------------------------------------------------
      // CREATE DOCUMENT
      // ------------------------------------------------------

      const {
        data: document,
        error: documentError,
      } = await supabaseAdmin
        .from("standard_documents")
        .insert({
          standard_id: standard.id,
          filename:
            storagePath.split("/").pop() ||
            "standard.pdf",
          storage_path: storagePath,
          page_count: pageCount,
          ingestion_status: "processing",
          total_chunks: allChunks.length,
          processed_chunks: 0,
          error_message: null,
          user_id: user.id,
        })
        .select("id")
        .single();

      if (documentError) {
        throw documentError;
      }

      // ------------------------------------------------------
      // SAVE CHUNKS WITHOUT EMBEDDINGS
      // ------------------------------------------------------

      const rows = allChunks.map((chunk) => ({
        standard_id: standard.id,
        standard_document_id: document.id,
        content: chunk.content,
        embedding: null,
        page_number: chunk.page_number,
        clause_no: chunk.clause_no,
        sub_clause_no: chunk.sub_clause_no,
        table_no: chunk.table_no,
        figure_no: chunk.figure_no,
        annex_no: chunk.annex_no,
        section_title: chunk.section_title,
        chunk_index: chunk.chunk_index,
        user_id: user.id,
      }));

      const {
        error: chunkError,
      } = await supabaseAdmin
        .from("standard_chunks")
        .insert(rows);

      if (chunkError) {
        await supabaseAdmin
          .from("standard_documents")
          .delete()
          .eq("id", document.id)
          .eq("user_id", user.id);

        throw chunkError;
      }

      return NextResponse.json({
        success: true,
        documentId: document.id,
        standardId: standard.id,
        pageCount,
        totalChunks: allChunks.length,
        processedChunks: 0,
        remaining: allChunks.length,
        status: "processing",
        message:
          "Existing IS Standard prepared for batch embedding.",
      });
    } finally {
      await parser.destroy();
    }
  } catch (error: any) {
    console.error(
      "PREPARE EXISTING STANDARD ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Failed to prepare existing standard.",
      },
      { status: 500 }
    );
  }
}