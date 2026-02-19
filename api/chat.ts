import { runAgent, type Message } from "../agent.ts";
import { CONFIG } from "../config.ts";
import { loadKnowledgeBase } from "../knowledge.ts";

// Load knowledge base on cold start
loadKnowledgeBase();

interface ChatRequest {
  sessionId: string;
  message: string;
}

const sessions = new Map<string, { messages: Message[]; lastActive: number }>();

export default async function handler(req: Request) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }

  if (!CONFIG.DEEPSEEK_API_KEY) {
    return new Response(
      JSON.stringify({ error: "API key not configured" }),
      { status: 500, headers }
    );
  }

  try {
    const { sessionId, message } = await req.json();

    if (!sessionId || !message) {
      return new Response(
        JSON.stringify({ error: "Missing sessionId or message" }),
        { status: 400, headers }
      );
    }

    let session = sessions.get(sessionId);
    if (!session) {
      session = { messages: [], lastActive: Date.now() };
      sessions.set(sessionId, session);
    }

    session.lastActive = Date.now();

    const response = await runAgent(message.slice(0, 500), session.messages);

    if (response.error) {
      return new Response(JSON.stringify({ error: response.error }), {
        status: 500,
        headers,
      });
    }

    session.messages.push({ role: "user", content: message });
    session.messages.push({ role: "assistant", content: response.content });

    return new Response(
      JSON.stringify({ content: response.content, sessionId }),
      { headers }
    );
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal error",
      }),
      { status: 500, headers }
    );
  }
}
