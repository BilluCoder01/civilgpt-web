import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { embedMany } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || '';

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey
);

// ------------------------------------------------------------
// PDF TEXT EXTRACTION
// ------------------------------------------------------------
// pdf-parse v2 requires the Node CanvasFactory to be supplied
// in environments such as Next.js/Vercel to avoid the
// "DOMMatrix is not defined" error.
// ------------------------------------------------------------

async function extractPdfText(
  buffer: Buffer
): Promise<string> {
  const {
    CanvasFactory,
  } = await import(
    'pdf-parse/worker'
  );

  const {
    PDFParse,
  } = await import(
    'pdf-parse'
  );

  const parser =
    new PDFParse({
      data: buffer,
      CanvasFactory,
    });

  try {
    const result =
      await parser.getText();

    return result.text;
  } finally {
    await parser.destroy();
  }
}

// ------------------------------------------------------------
// POST
// ------------------------------------------------------------

export async function POST(
  req: Request
) {
  try {
    // --------------------------------------------------------
    // AUTHENTICATION
    // --------------------------------------------------------

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
            'Unauthorized',
        },
        {
          status: 401,
        }
      );
    }

    // --------------------------------------------------------
    // FORM DATA
    // --------------------------------------------------------

    const formData =
      await req.formData();

    const file =
      formData.get(
        'file'
      ) as File | null;

    if (!file) {
      return NextResponse.json(
        {
          error:
            'No file uploaded',
        },
        {
          status: 400,
        }
      );
    }

    // Basic file-type validation.
    if (
      file.type !==
        'application/pdf' &&
      !file.name
        .toLowerCase()
        .endsWith('.pdf')
    ) {
      return NextResponse.json(
        {
          error:
            'Only PDF files are supported.',
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------------
    // READ FILE
    // --------------------------------------------------------

    const buffer =
      Buffer.from(
        await file.arrayBuffer()
      );

    if (
      buffer.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            'Uploaded PDF is empty.',
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------------
    // EXTRACT TEXT
    // --------------------------------------------------------

    const rawText =
      await extractPdfText(
        buffer
      );

    const cleanText =
      rawText
        .replace(
          /\u0000/g,
          ''
        )
        .replace(
          /\s+/g,
          ' '
        )
        .trim();

    if (
      cleanText.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            'No readable text was found in the PDF.',
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------------
    // CHUNK TEXT
    // --------------------------------------------------------

    const chunks: string[] = [];

    for (
      let i = 0;
      i < cleanText.length;
      i += 1000
    ) {
      const chunk =
        cleanText.substring(
          i,
          i + 1000
        );

      if (
        chunk.trim().length > 0
      ) {
        chunks.push(
          chunk.trim()
        );
      }
    }

    if (
      chunks.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            'No readable text chunks were produced from the PDF.',
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------------
    // GENERATE EMBEDDINGS
    // --------------------------------------------------------
    // Keep your existing model and 768-dimensional database
    // schema for now. We are not changing your RAG architecture
    // in this fix.
    // --------------------------------------------------------

    const {
      embeddings,
    } =
      await embedMany({
        model:
          google.textEmbeddingModel(
            'gemini-embedding-2'
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

    // --------------------------------------------------------
    // PREPARE DATABASE ROWS
    // --------------------------------------------------------

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
        })
      );

    // --------------------------------------------------------
    // SAVE TO SUPABASE
    // --------------------------------------------------------

    const {
      error:
        insertError,
    } =
      await supabaseAdmin
        .from(
          'engineering_documents'
        )
        .insert(
          rowsToInsert
        );

    if (
      insertError
    ) {
      console.error(
        'Supabase document insert error:',
        insertError
      );

      throw insertError;
    }

    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    return NextResponse.json(
      {
        success: true,
        filename:
          file.name,
        chunks:
          chunks.length,
      },
      {
        status: 200,
      }
    );
  } catch (
    error: any
  ) {
    console.error(
      '\n❌ UPLOAD CRASH:',
      error?.message ||
        error,
      '\n'
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          'Failed to process PDF.',
      },
      {
        status: 500,
      }
    );
  }
}