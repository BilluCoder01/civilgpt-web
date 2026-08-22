import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    // ------------------------------------------------------------
    // AUTH
    // ------------------------------------------------------------

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
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    // ------------------------------------------------------------
    // REQUEST
    // ------------------------------------------------------------

    const body = await req.json();

    const documentId =
      typeof body?.documentId === "string"
        ? body.documentId
        : "";

    const page =
      Number.isInteger(body?.page)
        ? Number(body.page)
        : Number(body?.page);

    if (!documentId) {
      return NextResponse.json(
        { error: "documentId is required." },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(page) ||
      page < 1
    ) {
      return NextResponse.json(
        { error: "A valid page number is required." },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------
    // DOCUMENT OWNERSHIP
    // ------------------------------------------------------------

    const {
      data: document,
      error: documentError,
    } = await supabaseAdmin
      .from("standard_documents")
      .select(
        "id, filename, storage_path, page_count, user_id"
      )
      .eq("id", documentId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (documentError) {
      console.error(
        "Source document lookup failed:",
        documentError
      );

      return NextResponse.json(
        { error: "Failed to find source document." },
        { status: 500 }
      );
    }

    if (!document) {
      return NextResponse.json(
        { error: "Source document not found." },
        { status: 404 }
      );
    }

    if (!document.storage_path) {
      return NextResponse.json(
        {
          error:
            "This document does not have a Storage path.",
        },
        { status: 404 }
      );
    }

    // ------------------------------------------------------------
    // PAGE VALIDATION
    // ------------------------------------------------------------

    if (
      document.page_count !== null &&
      page > document.page_count
    ) {
      return NextResponse.json(
        {
          error:
            `Requested page ${page} is outside the document's ${document.page_count} pages.`,
        },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------
    // SIGNED STORAGE URL
    // ------------------------------------------------------------

    const { data: signedUrlData, error: signedUrlError } =
      await supabaseAdmin.storage
        .from("civilgpt-pdfs")
        .createSignedUrl(
          document.storage_path,
          60 * 10 // 10 minutes
        );

    if (signedUrlError) {
      console.error(
        "Failed to create signed source URL:",
        signedUrlError
      );

      return NextResponse.json(
        {
          error:
            "Failed to create secure source URL.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      filename: document.filename,
      url: signedUrlData.signedUrl,
      page,
      pageCount: document.page_count,
    });
  } catch (error) {
    console.error(
      "STANDARD SOURCE ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to open source document.",
      },
      { status: 500 }
    );
  }
}