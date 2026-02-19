import { readFileSync } from "fs";
import { loadKnowledgeBase } from "./knowledge.ts";
import { runAgent, type Message } from "./agent.ts";
import { CONFIG } from "./config.ts";

// Types
interface Session {
  messages: Message[];
  lastActive: number;
}

interface ChatRequest {
  sessionId: string;
  message: string;
}

// In-memory stores
const sessions = new Map<string, Session>();
const rateLimit = new Map<string, { count: number; resetTime: number }>();

// Rate limiting helper
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimit.get(ip);

  if (!limit || now > limit.resetTime) {
    rateLimit.set(ip, { count: 1, resetTime: now + 60000 }); // 1 minute window
    return true;
  }

  if (limit.count >= CONFIG.MAX_MESSAGES_PER_MINUTE) {
    return false;
  }

  limit.count++;
  return true;
}

// Session cleanup (run every 5 minutes)
setInterval(() => {
  const cutoff = Date.now() - CONFIG.SESSION_TIMEOUT_MS;
  for (const [id, session] of sessions) {
    if (session.lastActive < cutoff) {
      sessions.delete(id);
    }
  }
  // Clean up old rate limit entries
  const now = Date.now();
  for (const [ip, data] of rateLimit) {
    if (now > data.resetTime) {
      rateLimit.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// Simple HTML escaping for security
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Get client IP from request
function getClientIP(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

// Load knowledge base on startup
loadKnowledgeBase();

// Bun server
Bun.serve({
  port: 3001,

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const ip = getClientIP(request);

    // Health check
    if (path === "/api/health" && method === "GET") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Serve static index.html (landing page)
    if (path === "/" && method === "GET") {
      try {
        const html = readFileSync("./public/index.html", "utf-8");
        return new Response(html, {
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "no-cache, no-store, must-revalidate"
          }
        });
      } catch {
        return new Response("Not Found", { status: 404 });
      }
    }

    // Serve chat widget at /chat
    if (path === "/chat" && method === "GET") {
      try {
        const html = readFileSync("./public/chat.html", "utf-8");
        return new Response(html, {
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "no-cache, no-store, must-revalidate"
          }
        });
      } catch {
        return new Response("Not Found", { status: 404 });
      }
    }

    // Chat API
    if (path === "/api/chat" && method === "POST") {
      // Rate limiting
      if (!checkRateLimit(ip)) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        const body: ChatRequest = await request.json();

        if (!body.sessionId || !body.message) {
          return new Response(JSON.stringify({ error: "Missing sessionId or message" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Sanitize message
        const message = body.message.slice(0, CONFIG.MAX_MESSAGE_LENGTH);

        // Get or create session
        let session = sessions.get(body.sessionId);
        if (!session) {
          session = {
            messages: [],
            lastActive: Date.now()
          };
          sessions.set(body.sessionId, session);
        }

        // Check message limit
        const userMessageCount = session.messages.filter(m => m.role === "user").length;
        if (userMessageCount >= CONFIG.MAX_MESSAGES_PER_SESSION) {
          return new Response(JSON.stringify({
            error: "Conversation limit reached. Please contact support directly."
          }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Update last active
        session.lastActive = Date.now();

        // Run agent
        const response = await runAgent(message, session.messages);

        if (response.error) {
          return new Response(JSON.stringify({ error: response.error }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Store messages in session
        session.messages.push({ role: "user", content: message });
        session.messages.push({ role: "assistant", content: response.content });

        return new Response(JSON.stringify({
          content: response.content,
          sessionId: body.sessionId
        }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (error) {
        console.error("Chat error:", error);
        return new Response(JSON.stringify({
          error: error instanceof Error ? error.message : "Internal error"
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // 404 for everything else
    return new Response("Not Found", { status: 404 });
  }
});

console.log("Chatbot server running at http://localhost:3001");
