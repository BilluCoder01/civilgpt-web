import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseAdmin =
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

type CitationState = {
  clauseNo: string | null;
  subClauseNo: string | null;
  tableNo: string | null;
  figureNo: string | null;
  annexNo: string | null;
  sectionTitle: string | null;
};

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

function splitClauseNumber(
  fullClause: string
) {
  const parts =
    fullClause
      .split(".")
      .map((part) =>
        part.trim()
      )
      .filter(Boolean);

  return {
    clauseNo:
      parts[0] || null,
    subClauseNo:
      parts.length > 1
        ? parts.slice(1).join(".")
        : null,
  };
}

/**
 * Conservative clause detection.
 *
 * The first token after the clause number is rejected when it
 * looks like OCR/unit/calculation content. This is deliberately
 * conservative: uncertain text receives no clause metadata.
 */
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
    !/^[A-Za-z]/.test(title)
  ) {
    return null;
  }

  const firstWord =
    title
      .split(/\s+/)[0]
      .replace(
        /[^A-Za-z%²³]/g,
        ""
      )
      .toLowerCase();

  const rejectedFirstWords =
    new Set([
      "in",
      "mm",
      "cm",
      "m",
      "km",
      "kg",
      "g",
      "kn",
      "n",
      "pa",
      "kpa",
      "mpa",
      "gpa",
      "hz",
      "v",
      "a",
      "s",
      "sec",
      "min",
      "hr",
      "percent",
      "%",
      "i",
      "ii",
      "iii",
      "iv",
      "v",
      "vi",
      "vii",
      "viii",
      "ix",
      "x",
    ]);

  if (
    rejectedFirstWords.has(
      firstWord
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
    /^\s*(?:at|from|to|of|using|with|per|for)\b/i.test(
      title
    )
  ) {
    return null;
  }

  if (
    /^\d+(?:\.\d+)?\s*(?:kN|N|mm|cm|m|kg|MPa|kPa|Pa|m²|m³|kN\/m|kN\/m²|%)/i.test(
      `${clause} ${title}`
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

  return {
    clause,
    title,
  };
}

function detectTableHeading(
  line: string
): string | null {
  const match =
    line
      .trim()
      .match(
        /^table\s+([A-Za-z]?\d+(?:\.\d+)*)\b/i
      );

  return match
    ? match[1]
    : null;
}

function detectFigureHeading(
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

function detectAnnexHeading(
  line: string
): string | null {
  const value =
    line
      .replace(/\s+/g, " ")
      .trim();

  const match =
    value.match(
      /^(?:annex)\s*[-:]?\s*([A-H])\b/i
    );

  return match
    ? match[1].toUpperCase()
    : null;
}

function detectAnnexSubheading(
  line: string
): string | null {
  const value =
    line
      .replace(/\s+/g, " ")
      .trim();

  const match =
    value.match(
      /^([A-H])-(\d+(?:\.\d+)?)\s+(.+)$/i
    );

  if (!match) {
    return null;
  }

  return `${match[1].toUpperCase()}-${match[2]}`;
}

function detectGenericHeading(
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
    /^annex\b/i.test(value)
  ) {
    return null;
  }

  if (
    /^(?:\d+(?:\.\d+){0,4})\s+/.test(
      value
    )
  ) {
    return null;
  }

  return value ===
      value.toUpperCase() &&
    /[A-Z]/.test(value)
    ? value
    : null;
}

/**
 * Rebuild metadata only from the already-stored chunk text.
 *
 * IMPORTANT:
 * - content is never changed
 * - embedding is never changed
 * - no Gemini API is called
 */
function inferCitationForChunk(
  content: string,
  previous: CitationState
): CitationState {
  const lines =
    normalizeWhitespace(
      content
    )
      .split("\n")
      .map((line) =>
        line.trim()
      )
      .filter(Boolean);

  let state: CitationState = {
    ...previous,
  };

  for (
    const line of lines
  ) {
    const annex =
      detectAnnexHeading(
        line
      );

    if (annex) {
      // Annexes are independent citation regions.
      state = {
        clauseNo: null,
        subClauseNo: null,
        tableNo: null,
        figureNo: null,
        annexNo: annex,
        sectionTitle: `ANNEX ${annex}`,
      };

      continue;
    }

    const annexSubheading =
      detectAnnexSubheading(
        line
      );

    if (
      annexSubheading &&
      state.annexNo
    ) {
      state.sectionTitle =
        annexSubheading;
      continue;
    }

    const clause =
      detectClauseHeading(
        line
      );

    if (clause) {
      const split =
        splitClauseNumber(
          clause.clause
        );

      state.clauseNo =
        split.clauseNo;

      state.subClauseNo =
        split.subClauseNo;

      state.tableNo = null;
      state.figureNo = null;

      state.sectionTitle =
        clause.title;

      continue;
    }

    const table =
      detectTableHeading(
        line
      );

    if (table) {
      state.tableNo =
        table;
      state.figureNo =
        null;
      continue;
    }

    const figure =
      detectFigureHeading(
        line
      );

    if (figure) {
      state.figureNo =
        figure;
      state.tableNo =
        null;
      continue;
    }

    const genericHeading =
      detectGenericHeading(
        line
      );

    if (
      genericHeading
    ) {
      state.sectionTitle =
        genericHeading;
    }
  }

  return state;
}

export async function POST(
  req: Request
) {
  try {
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

    const {
      data: document,
      error: documentError,
    } =
      await supabaseAdmin
        .from(
          "standard_documents"
        )
        .select(
          "id, standard_id, filename, total_chunks"
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

    if (documentError) {
      throw documentError;
    }

    const {
      data: chunks,
      error: chunkError,
    } =
      await supabaseAdmin
        .from(
          "standard_chunks"
        )
        .select(
          `
          id,
          content,
          clause_no,
          sub_clause_no,
          table_no,
          figure_no,
          annex_no,
          section_title,
          chunk_index
          `
        )
        .eq(
          "standard_document_id",
          document.id
        )
        .eq(
          "user_id",
          user.id
        )
        .order(
          "chunk_index",
          {
            ascending: true,
          }
        );

    if (chunkError) {
      throw chunkError;
    }

    if (!chunks?.length) {
      return NextResponse.json({
        success: true,
        documentId,
        updatedChunks: 0,
        message:
          "No chunks found to repair.",
      });
    }

    let state: CitationState = {
      clauseNo: null,
      subClauseNo: null,
      tableNo: null,
      figureNo: null,
      annexNo: null,
      sectionTitle: null,
    };

    let updatedChunks = 0;

    for (
      const chunk of chunks
    ) {
      const inferred =
        inferCitationForChunk(
          chunk.content,
          state
        );

      // A new clause clears any old table/figure context.
      // A new annex clears main-clause context.
      state = {
        ...inferred,
      };

      const needsUpdate =
        chunk.clause_no !==
          inferred.clauseNo ||
        chunk.sub_clause_no !==
          inferred.subClauseNo ||
        chunk.table_no !==
          inferred.tableNo ||
        chunk.figure_no !==
          inferred.figureNo ||
        chunk.annex_no !==
          inferred.annexNo ||
        chunk.section_title !==
          inferred.sectionTitle;

      if (!needsUpdate) {
        continue;
      }

      const {
        error: updateError,
      } =
        await supabaseAdmin
          .from(
            "standard_chunks"
          )
          .update({
            clause_no:
              inferred.clauseNo,
            sub_clause_no:
              inferred.subClauseNo,
            table_no:
              inferred.tableNo,
            figure_no:
              inferred.figureNo,
            annex_no:
              inferred.annexNo,
            section_title:
              inferred.sectionTitle,
          })
          .eq(
            "id",
            chunk.id
          )
          .eq(
            "standard_document_id",
            document.id
          )
          .eq(
            "user_id",
            user.id
          );

      if (updateError) {
        throw updateError;
      }

      updatedChunks++;
    }

    return NextResponse.json({
      success: true,
      documentId: document.id,
      filename:
        document.filename,
      totalChunks:
        chunks.length,
      updatedChunks,
      embeddingsPreserved:
        true,
      message:
        "Citation metadata repaired without changing chunk content or embeddings.",
    });
  } catch (error: any) {
    console.error(
      "STANDARD METADATA REPAIR ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Failed to repair standard citation metadata.",
      },
      {
        status: 500,
      }
    );
  }
}