import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { streamText, embed } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; 
export const maxDuration = 60; 

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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

    const { messages } = await req.json();
    const latestMessage = messages[messages.length - 1].content;

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

    if (sessionId) {
      await supabaseAdmin.from('messages').insert([{
        session_id: sessionId,
        role: 'user',
        content: latestMessage
      }]);
    }

    // THE FIX: Using the active 2026 embedding model
    const { embedding } = await embed({
      model: google.textEmbeddingModel('gemini-embedding-2'),
      value: latestMessage,
    });

    const { data: documents, error: rpcError } = await supabaseAdmin.rpc('match_engineering_codes', {
      query_embedding: embedding.slice(0, 768),
      match_threshold: 0.5, 
      match_count: 3, 
      p_user_id: user.id
    });

    if (rpcError) console.error("Supabase Error:", rpcError);
    const contextText = documents?.map((doc: any) => doc.content).join('\n\n---\n\n') || "No documents found.";

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

    const result = await streamText({
      model: google('gemini-1.5-flash'), 
      messages,
      system: systemPrompt,
      onFinish: async ({ text }) => {
        if (sessionId) {
          await supabaseAdmin.from('messages').insert([{
            session_id: sessionId,
            role: 'assistant',
            content: text
          }]);

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
    console.error("\n❌ CHAT CRASH:", error.message, "\n");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}