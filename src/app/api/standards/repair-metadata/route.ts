import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function splitClauseNumber(fullClause: string) {
  const parts = fullClause
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    clauseNo: parts[0] || null,
    subClauseNo:
      parts.length > 1 ? parts.slice(1).join(".") : null,
  };
}

function detectClauseHeading(line: string) {
  const value = line.replace(/\s+/g, " ").trim();
  const match = value.match(/^(\d+(?:\.\d+){0,4})\s+(.+)$/);
  if (!match) return null;

  const clause = match[1].trim();
  const title = match[2].trim();
  if (!title || !/^[A-Za-z]/.test(title)) return null;

  const firstWord = title
    .split(/\s+/)[0]
    .replace(/[^A-Za-z%²³]/g, "")
    .toLowerCase();

  const rejected = new Set([
    "in", "mm", "cm", "m", "km", "kg", "g", "kn", "n",
    "pa", "kpa", "mpa", "gpa", "hz", "v", "a", "s",
    "sec", "min", "hr", "percent", "%", "i", "ii", "iii",
    "iv", "v", "vi", "vii", "viii", "ix", "x",
  ]);

  if (rejected.has(firstWord)) return null;
  if (/^\d+(?:\.\d+)?\b/.test(title)) return null;
  if (/[=×+−]/.test(title)) return null;
  if (/^(?:at|from|to|of|using|with|per|for)\b/i.test(title)) return null;

  if (
    /\b(?:kN|N|mm|cm|m|kg|MPa|kPa|Pa|m²|m³|kN\/m|kN\/m²)\b/i.test(title) &&
    /(?:at|from|to|of|supports?|units?|span|length|load|reaction|moment|deflection)/i.test(title)
  ) {
    return null;
  }

  return { clause, title };
}

function detectTable(line: string): string | null {
  const match = line.trim().match(/^table\s+([A-Za-z]?\d+(?:\.\d+)*)\b/i);
  return match ? match[1] : null;
}

function detectFigure(line: string): string | null {
  const match = line.trim().match(/^(?:figure|fig\.)\s+([A-Za-z]?\d+(?:\.\d+)*)\b/i);
  return match ? match[1] : null;
}

function detectAnnex(line: string): string | null {
  const value = line.replace(/\s+/g, " ").trim();
  const match = value.match(/^(?:annex)\s*[-:]?\s*([A-H])\b/i);
  return match ? match[1].toUpperCase() : null;
}

function detectAnnexSubheading(line: string): string | null {
  const value = line.replace(/\s+/g, " ").trim();
  const match = value.match(/^([A-H])-([0-9]+(?:\.[0-9]+)?)\s+(.+)$/i);
  return match ? `${match[1].toUpperCase()}-${match[2]}` : null;
}

function detectGenericHeading(line: string): string | null {
  const value = line.replace(/\s+/g, " ").trim();
  if (value.length < 3 || value.length > 160) return null;
  if (/^table\s+/i.test(value) || /^figure\s+/i.test(value) || /^fig\.\s+/i.test(value) || /^annex\b/i.test(value)) return null;
  if (/^(?:\d+(?:\.\d+){0,4})\s+/.test(value)) return null;
  return value === value.toUpperCase() && /[A-Z]/.test(value) ? value : null;
}

function isObviousNumericFragment(content: string): boolean {
  const text = normalizeWhitespace(content);
  if (/^\d+(?:\.\d+)?\s*(?:percent|%|kN|N|mm|cm|m|kg|MPa|kPa|Pa|m²|m³)\b/i.test(text)) return true;
  if (/^\d+(?:\.\d+)?\s+(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\b/i.test(text)) return true;
  if (/^[0-9I\s.=×+\-_/]+$/.test(text.slice(0, 120))) return true;
  return false;
}

function inferMetadata(content: string) {
  const lines = normalizeWhitespace(content)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // Prefer explicit headings inside this chunk.
  for (const line of lines) {
    const annex = detectAnnex(line);
    if (annex) {
      return {
        clauseNo: null,
        subClauseNo: null,
        tableNo: null,
        figureNo: null,
        annexNo: annex,
        sectionTitle: `ANNEX ${annex}`,
      };
    }

    const annexSub = detectAnnexSubheading(line);
    if (annexSub) {
      return {
        clauseNo: null,
        subClauseNo: null,
        tableNo: null,
        figureNo: null,
        annexNo: annexSub.split("-")[0],
        sectionTitle: annexSub,
      };
    }

    const clause = detectClauseHeading(line);
    if (clause) {
      const split = splitClauseNumber(clause.clause);
      return {
        clauseNo: split.clauseNo,
        subClauseNo: split.subClauseNo,
        tableNo: null,
        figureNo: null,
        annexNo: null,
        sectionTitle: clause.title,
      };
    }

    const table = detectTable(line);
    if (table) {
      return {
        clauseNo: null,
        subClauseNo: null,
        tableNo: table,
        figureNo: null,
        annexNo: null,
        sectionTitle: null,
      };
    }

    const figure = detectFigure(line);
    if (figure) {
      return {
        clauseNo: null,
        subClauseNo: null,
        tableNo: null,
        figureNo: figure,
        annexNo: null,
        sectionTitle: null,
      };
    }
  }

  const generic = lines.map(detectGenericHeading).find(Boolean) || null;

  return {
    clauseNo: null,
    subClauseNo: null,
    tableNo: null,
    figureNo: null,
    annexNo: null,
    sectionTitle: generic,
  };
}

export async function POST(req: Request) {
  try {
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
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const documentId = body?.documentId;
    const offset = Math.max(Number(body?.offset) || 0, 0);
    const limit = Math.min(Math.max(Number(body?.limit) || 20, 1), 25);

    if (!documentId) {
      return NextResponse.json({ error: "documentId is required." }, { status: 400 });
    }

    const { data: document, error: documentError } = await supabaseAdmin
      .from("standard_documents")
      .select("id, filename, total_chunks")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (documentError) throw documentError;

    const { count: totalCount, error: totalError } = await supabaseAdmin
      .from("standard_chunks")
      .select("id", { count: "exact", head: true })
      .eq("standard_document_id", document.id)
      .eq("user_id", user.id);

    if (totalError) throw totalError;

    const totalChunks = totalCount || document.total_chunks || 0;

    const { data: chunks, error: chunkError } = await supabaseAdmin
      .from("standard_chunks")
      .select(
        "id, content, clause_no, sub_clause_no, table_no, figure_no, annex_no, section_title, chunk_index"
      )
      .eq("standard_document_id", document.id)
      .eq("user_id", user.id)
      .order("chunk_index", { ascending: true })
      .range(offset, offset + limit - 1);

    if (chunkError) throw chunkError;

    if (!chunks?.length) {
      return NextResponse.json({
        success: true,
        documentId,
        totalChunks,
        updatedChunks: 0,
        nextOffset: offset,
        complete: true,
        embeddingsPreserved: true,
      });
    }

    let updatedChunks = 0;

    for (const chunk of chunks) {
      const inferred = inferMetadata(chunk.content);

      // For chunks that are clearly numeric fragments, clear stale metadata.
      const numericFragment = isObviousNumericFragment(chunk.content);
      const next = numericFragment
        ? {
            clauseNo: null,
            subClauseNo: null,
            tableNo: chunk.table_no?.toString().match(/^\d+$/) ? chunk.table_no : null,
            figureNo: null,
            annexNo: null,
            sectionTitle: null,
          }
        : inferred;

      const needsUpdate =
        chunk.clause_no !== next.clauseNo ||
        chunk.sub_clause_no !== next.subClauseNo ||
        chunk.table_no !== next.tableNo ||
        chunk.figure_no !== next.figureNo ||
        chunk.annex_no !== next.annexNo ||
        chunk.section_title !== next.sectionTitle;

      if (!needsUpdate) continue;

      const { error: updateError } = await supabaseAdmin
        .from("standard_chunks")
        .update({
          clause_no: next.clauseNo,
          sub_clause_no: next.subClauseNo,
          table_no: next.tableNo,
          figure_no: next.figureNo,
          annex_no: next.annexNo,
          section_title: next.sectionTitle,
        })
        .eq("id", chunk.id)
        .eq("standard_document_id", document.id)
        .eq("user_id", user.id);

      if (updateError) throw updateError;
      updatedChunks++;
    }

    const nextOffset = offset + chunks.length;
    const complete = nextOffset >= totalChunks;

    return NextResponse.json({
      success: true,
      documentId,
      filename: document.filename,
      totalChunks,
      processedThisBatch: chunks.length,
      updatedChunks,
      nextOffset,
      complete,
      embeddingsPreserved: true,
    });
  } catch (error: any) {
    console.error("STANDARD METADATA REPAIR ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to repair standard citation metadata." },
      { status: 500 }
    );
  }
}