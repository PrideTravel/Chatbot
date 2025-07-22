
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, type Content, type GroundingChunk } from "@google/genai";
import { SYSTEM_INSTRUCTION } from '../src/constants';
import { type Message, Sender, type Source } from '../src/types';

// Vercel Edge Function configuration
export const config = {
    runtime: 'edge',
};

// Helper function to map sender to the role required by the Gemini API
const roleMapping = (sender: Sender) => {
    switch (sender) {
        case Sender.USER:
            return 'user';
        case Sender.BOT:
            return 'model';
        default:
            return 'user';
    }
};

// The main function handler for Vercel
export default async function handler(request: Request) {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const { history, message } = (await request.json()) as { history: Message[]; message: string; };

        // In Vercel, environment variables are accessed via process.env
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            throw new Error("API_KEY environment variable not set");
        }
        const ai = new GoogleGenAI({ apiKey });
        
        const chatHistory: Content[] = history.map(msg => ({
            role: roleMapping(msg.sender),
            parts: [{ text: msg.text }]
        }));

        const stream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: [...chatHistory, { role: 'user', parts: [{ text: message }] }],
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                tools: [{ googleSearch: {} }],
                safetySettings: [
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                ]
            }
        });

        let sources: Source[] = [];

        const readableStream = new ReadableStream({
            async start(controller) {
                for await (const chunk of stream) {
                    const text = chunk.text;
                    if (text) {
                        controller.enqueue(new TextEncoder().encode(text));
                    }
                    
                    if (chunk.candidates?.[0]?.finishReason === 'STOP' || chunk.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
                         const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
                         if (groundingChunks) {
                            sources = (groundingChunks as GroundingChunk[]).map(chunk => ({
                               uri: chunk.web?.uri || '',
                               title: chunk.web?.title || '',
                            })).filter(source => source.uri);
                         }
                    }
                }
                
                const finalPayload = JSON.stringify({ sources });
                controller.enqueue(new TextEncoder().encode(finalPayload));
                controller.close();
            }
        });
        
        return new Response(readableStream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'X-Content-Type-Options': 'nosniff',
            },
        });

    } catch (error) {
        console.error("Error in Vercel Function:", error);
        return new Response(JSON.stringify({ error: 'Failed to process chat message.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
