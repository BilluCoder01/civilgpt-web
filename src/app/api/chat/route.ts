import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { streamText, embed, embedMany } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; 
export const maxDuration = 120; 

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// ==========================================
// PDF EXTRACTOR
// ==========================================
async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

export async function POST(req: Request) {
  try {
    // 1. SECURE THE ROUTE: Find out exactly which user is making this request
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

    const contentType = req.headers.get('content-type') || '';

    // ==========================================
    // MODE 1: PDF UPLOAD HANDLING
    // ==========================================
    if (contentType.includes('multipart/form-data')) {
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
        // @ts-ignore
        model: google.textEmbeddingModel('gemini-embedding-001', { outputDimensionality: 768 }),
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
    }

    // ==========================================
    // MODE 2: CHAT & MEMORY HANDLING
    // ==========================================
    const { messages } = await req.json();
    const latestMessage = messages[messages.length - 1].content;

    // 2. MEMORY MANAGEMENT: Check for an active session or create one
    let sessionId;
    const { data: existingSessions } = await supabaseAdmin
      .from('chat_sessions')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingSessions && existingSessions.length > 0) {
      sessionId = existingSessions[0].id;
    } else {
      const { data: newSession } = await supabaseAdmin
        .from('chat_sessions')
        .insert([{ user_id: user.id, title: 'Engineering Workspace' }])
        .select()
        .single();
      sessionId = newSession?.id;
    }

    // Save the User's message to the database
    if (sessionId) {
      await supabaseAdmin.from('messages').insert([{
        session_id: sessionId,
        role: 'user',
        content: latestMessage
      }]);
    }

    // 3. VECTOR SEARCH
    const { embedding } = await embed({
      // @ts-ignore
      model: google.textEmbeddingModel('gemini-embedding-001', { outputDimensionality: 768 }),
      value: latestMessage,
    });

    const { data: documents, error: rpcError } = await supabaseAdmin.rpc('match_engineering_codes', {
      query_embedding: embedding.slice(0, 768),
      match_threshold: 0.5, 
      match_count: 3, // Reduced from 5 to improve latency
      p_user_id: user.id
    });

    if (rpcError) console.error("Supabase Error:", rpcError);
    const contextText = documents?.map((doc: any) => doc.content).join('\n\n---\n\n') || "No documents found.";

    // 4. BEHAVIORAL PERSONALIZATION PROMPT
    const systemPrompt = `You are CivilGPT, a professional structural engineering AI assistant.
    
    CRITICAL BEHAVIORAL INSTRUCTIONS:
    Analyze the conversation history. Adapt your tone, terminology, and complexity to match the user's expertise level. 
    - If they ask basic questions or sound like a student, provide step-by-step educational explanations.
    - If they ask highly technical questions or sound like a senior engineer, provide concise, direct, code-compliant answers without fluff.
    - Actively refer back to their past projects or preferences mentioned earlier in this conversation thread.

    Base your answer heavily on the following retrieved code clauses from their project files when relevant:
    <retrieved_context>
    ${contextText}
    </retrieved_context>`;

    // 5. STREAM & SAVE AI RESPONSE
    const result = await streamText({
      model: google('gemini-1.5-flash'), // Model updated to prevent 404
      messages,
      system: systemPrompt,
      onFinish: async ({ text }) => {
        // Once the AI finishes streaming, save it to memory
        if (sessionId) {
          await supabaseAdmin.from('messages').insert([{
            session_id: sessionId,
            role: 'assistant',
            content: text
          }]);

          // Auto-generate title using the correct 'count' destructing
          const { count: msgCount } = await supabaseAdmin
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', sessionId);

          if (msgCount !== null && msgCount < 3) {
            const shortTitle = latestMessage.substring(0, 25) + "...";
            await supabaseAdmin
              .from('chat_sessions')
              .update({ title: shortTitle })
              .eq('id', sessionId);
          }
        }
      }
    });

    return result.toTextStreamResponse();

  } catch (error: any) {
    console.error("\n❌ BACKEND CRASH:", error.message, "\n");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}