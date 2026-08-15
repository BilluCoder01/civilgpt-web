import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { embedMany } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; 
export const maxDuration = 120; 

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() }
        }
      }
    );
    
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const rawText = await extractPdfText(buffer);
    const cleanText = rawText.replace(/\u0000/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ');

    const chunks: string[] = [];
    for (let i = 0; i < cleanText.length; i += 1000) chunks.push(cleanText.substring(i, i + 1000));
    if (chunks.length === 0) return NextResponse.json({ error: "No text found" }, { status: 400 });

    const { embeddings } = await embedMany({
      model: google.textEmbeddingModel('text-embedding-004'),
      values: chunks,
    });

    const rowsToInsert = chunks.map((chunk, index) => ({
      content: chunk,
      embedding: embeddings[index].slice(0, 768),
      metadata: { filename: file.name, chunk_index: index },
      user_id: user.id
    }));

    const { error } = await supabaseAdmin.from('engineering_documents').insert(rowsToInsert);
    if (error) throw error;
    
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error("\n❌ UPLOAD CRASH:", error.message, "\n");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}