import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error("MISSING API KEY: Next.js cannot find GOOGLE_GENERATIVE_AI_API_KEY.");
    }

    const result = await streamText({
      // THE FIX: Switch to the brand new 3.6 generation
      model: google('gemini-3.6-flash'), 
      messages,
      system: "You are CivilGPT, a professional structural engineering AI assistant."
    });

    return result.toTextStreamResponse();
    
  } catch (error: any) {
    console.error("\n❌ BACKEND CRASH:", error.message, "\n");
    return new Response(error.message, { status: 500 });
  }
}