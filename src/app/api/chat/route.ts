import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { streamText, embed } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || '';

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey
);

export async function POST(req: Request) {
  try {
    // --------------------------------------------------
    // AUTHENTICATED SERVER CLIENT
    // --------------------------------------------------
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
        {
          error: 'Unauthorized',
        },
        {
          status: 401,
        }
      );
    }

    // --------------------------------------------------
    // REQUEST BODY
    // --------------------------------------------------
    const body = await req.json();

    const {
      messages,
      sessionId,
    } = body;

    // --------------------------------------------------
    // VALIDATE SESSION ID
    // --------------------------------------------------
    // Do NOT fall back to the latest chat.
    //
    // If the frontend does not provide a session ID,
    // reject the request instead of accidentally writing
    // the message into another conversation.
    // --------------------------------------------------
    if (
      !sessionId ||
      typeof sessionId !== 'string'
    ) {
      return NextResponse.json(
        {
          error:
            'A valid sessionId is required.',
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------
    // VALIDATE MESSAGES
    // --------------------------------------------------
    if (
      !Array.isArray(messages) ||
      messages.length === 0
    ) {
      return NextResponse.json(
        {
          error: 'Messages are required.',
        },
        {
          status: 400,
        }
      );
    }

    const latestMessage =
      messages[messages.length - 1]?.content;

    if (
      typeof latestMessage !== 'string' ||
      latestMessage.trim().length === 0
    ) {
      return NextResponse.json(
        {
          error:
            'Latest message is empty.',
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------
    // VERIFY SESSION OWNERSHIP
    // --------------------------------------------------
    // Because supabaseAdmin uses the service-role key,
    // explicitly verify that this session belongs to
    // the authenticated user before writing to it.
    // --------------------------------------------------
    const {
      data: session,
      error: sessionError,
    } = await supabaseAdmin
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (
      sessionError ||
      !session
    ) {
      console.error(
        'Invalid session:',
        sessionError
      );

      return NextResponse.json(
        {
          error:
            'Invalid chat session.',
        },
        {
          status: 403,
        }
      );
    }

    // --------------------------------------------------
    // SAVE USER MESSAGE
    // --------------------------------------------------
    // The exact session ID supplied by the client is used.
    // There is no fallback to another session.
    // --------------------------------------------------
    const {
      error: userMessageError,
    } = await supabaseAdmin
      .from('messages')
      .insert([
        {
          session_id: sessionId,
          role: 'user',
          content: latestMessage,
        },
      ]);

    if (userMessageError) {
      console.error(
        'Failed to save user message:',
        userMessageError
      );

      return NextResponse.json(
        {
          error:
            'Failed to save message.',
        },
        {
          status: 500,
        }
      );
    }

    // --------------------------------------------------
    // GENERATE EMBEDDING
    // --------------------------------------------------
    const { embedding } = await embed({
      model:
        google.textEmbeddingModel(
          'gemini-embedding-2'
        ),
      value: latestMessage,
    });

    // --------------------------------------------------
    // RAG SEARCH
    // --------------------------------------------------
    const {
      data: documents,
      error: rpcError,
    } = await supabaseAdmin.rpc(
      'match_engineering_codes',
      {
        query_embedding:
          embedding.slice(0, 768),

        match_threshold: 0.5,

        match_count: 3,

        p_user_id: user.id,
      }
    );

    if (rpcError) {
      console.error(
        'Supabase Error:',
        rpcError
      );
    }

    const contextText =
      documents
        ?.map(
          (doc: any) =>
            doc.content
        )
        .join('\n\n---\n\n') ||
      'No documents found.';

    // --------------------------------------------------
    // SYSTEM PROMPT
    // --------------------------------------------------
    const systemPrompt = `
You are CivilGPT, a professional structural engineering AI assistant.

CRITICAL BEHAVIORAL INSTRUCTIONS:
Analyze the conversation history. Adapt your tone, terminology, and complexity to match the user's expertise level.

- If they ask basic questions or sound like a student, provide step-by-step educational explanations.
- If they ask highly technical questions or sound like a senior engineer, provide concise, direct, code-compliant answers without fluff.
- Actively refer back to their past projects or preferences mentioned earlier in this conversation thread.

Base your answer heavily on the following retrieved code clauses from their project files when relevant:

<retrieved_context>
${contextText}
</retrieved_context>`;

    // --------------------------------------------------
    // STREAM AI RESPONSE
    // --------------------------------------------------
    const result = await streamText({
      model:
        google(
          'gemini-3.6-flash'
        ),

      messages,

      system:
        systemPrompt,

      onFinish: async ({
        text,
      }) => {
        // ------------------------------------------------
        // SAVE ASSISTANT RESPONSE
        // ------------------------------------------------
        const {
          error:
            assistantMessageError,
        } = await supabaseAdmin
          .from('messages')
          .insert([
            {
              session_id:
                sessionId,
              role: 'assistant',
              content: text,
            },
          ]);

        if (
          assistantMessageError
        ) {
          console.error(
            'Failed to save assistant message:',
            assistantMessageError
          );
        }

        // ------------------------------------------------
        // COUNT MESSAGES
        // ------------------------------------------------
        const {
          count: msgCount,
        } = await supabaseAdmin
          .from('messages')
          .select('*', {
            count: 'exact',
            head: true,
          })
          .eq(
            'session_id',
            sessionId
          );

        // ------------------------------------------------
        // UPDATE TITLE AFTER FIRST EXCHANGE
        // ------------------------------------------------
        if (msgCount === 2) {
          const shortTitle =
            latestMessage.length > 25
              ? `${latestMessage.substring(
                  0,
                  25
                )}...`
              : latestMessage;

          await supabaseAdmin
            .from('chat_sessions')
            .update({
              title:
                shortTitle,
            })
            .eq(
              'id',
              sessionId
            )
            .eq(
              'user_id',
              user.id
            );
        }
      },
    });

    // --------------------------------------------------
    // RETURN TEXT STREAM
    // --------------------------------------------------
    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error(
      '\n❌ CHAT CRASH:',
      error?.message ||
        error,
      '\n'
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          'Internal server error.',
      },
      {
        status: 500,
      }
    );
  }
}