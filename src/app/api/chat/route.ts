import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { streamText, embed, embedMany } from 'ai';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; 
export const maxDuration = 120; 

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ==========================================
// CORRECTED V2 PDF EXTRACTOR
// Using the new PDFParse class API
// ==========================================
async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = require('pdf-parse');
  
  // Initialize the new parser class with the buffer data
  const parser = new PDFParse({ data: buffer });
  
  // Extract the text
  const result = await parser.getText();
  
  // Free up the server memory
  await parser.destroy();
  
  return result.text;
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';

    // ==========================================
    // MODE 1: PDF UPLOAD HANDLING
    // ==========================================
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      
      if (!file) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      
      const rawText = await extractPdfText(buffer);
      
      // THE FIX: PostgreSQL crashes if text contains "null bytes" (\u0000). 
      // We must strip them out entirely before chunking and saving.
      const cleanText = rawText
        .replace(/\u0000/g, '') // Removes Supabase-crashing null bytes
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ');

      const chunks: string[] = [];
      for (let i = 0; i < cleanText.length; i += 1000) {
        chunks.push(cleanText.substring(i, i + 1000));
      }

      if (chunks.length === 0) {
        return NextResponse.json({ error: "No text found in PDF" }, { status: 400 });
      }

      const { embeddings } = await embedMany({
        // @ts-ignore
        model: google.textEmbeddingModel('gemini-embedding-001', { outputDimensionality: 768 }),
        values: chunks,
      });

      const rowsToInsert = chunks.map((chunk, index) => ({
        content: chunk,
        embedding: embeddings[index].slice(0, 768),
        metadata: { filename: file.name, chunk_index: index }
      }));

      const { error } = await supabase.from('engineering_documents').insert(rowsToInsert);
      if (error) throw error;

      return NextResponse.json({ success: true }, { status: 200 });
    }

    // ==========================================
    // MODE 2: CHAT HANDLING
    // ==========================================
    const { messages } = await req.json();
    const latestMessage = messages[messages.length - 1].content;

    const { embedding } = await embed({
      // @ts-ignore
      model: google.textEmbeddingModel('gemini-embedding-001', { outputDimensionality: 768 }),
      value: latestMessage,
    });

    const { data: documents, error: rpcError } = await supabase.rpc('match_engineering_codes', {
      query_embedding: embedding.slice(0, 768),
      match_threshold: 0.5, 
      match_count: 5,        
    });

    if (rpcError) {
      console.error("Supabase Error:", rpcError);
    }

    const contextText = documents?.map((doc: any) => doc.content).join('\n\n---\n\n') || "No documents found.";

    const systemPrompt = `You are CivilGPT, a professional structural engineering AI assistant.
    Base your answer heavily on the following retrieved code clauses from the project files when relevant:
    <retrieved_context>
    ${contextText}
    </retrieved_context>`;

    const result = await streamText({
      model: google('gemini-3.6-flash'), 
      messages,
      system: systemPrompt
    });

    return result.toTextStreamResponse();

  } catch (error: any) {
    console.error("\n❌ BACKEND CRASH:", error.message, "\n");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}