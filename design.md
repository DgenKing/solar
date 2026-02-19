# Customer Service Chatbot — Design Document

## What This Is

A web-based chatbot widget built with **Bun** and **TypeScript**. No frameworks, no Next.js, no bloat. A Bun server handles the backend, a single HTML page handles the frontend. The bot answers product and service questions for whichever website it's embedded on, and stays firmly in its lane — if someone asks about the weather or football scores, it politely redirects.

The entire system is three things: a **Bun HTTP server**, a **Claude API agent loop**, and a **static HTML/CSS/JS chat widget**.

---

## Core Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (chat widget)                              │
│  Single HTML file — vanilla JS, no build step       │
│  Sends user messages via fetch() to /api/chat       │
└──────────────────────┬──────────────────────────────┘
                       │ POST /api/chat
                       ▼
┌─────────────────────────────────────────────────────┐
│  Bun Server (server.ts)                             │
│  Routes:                                            │
│    GET  /              → serves chat.html            │
│    POST /api/chat      → handles conversation        │
│    GET  /api/health    → status check                │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Agent Layer (agent.ts)                             │
│  - Builds message array (system + conversation)     │
│  - Calls Claude API with tool definitions           │
│  - Runs tool loop if Claude requests tools          │
│  - Returns final text response                      │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Knowledge Layer (knowledge.ts)                     │
│  - Product catalogue (loaded from JSON/markdown)    │
│  - FAQ entries                                      │
│  - Pricing info                                     │
│  - Policies (returns, shipping, etc.)               │
│  - Contact/escalation rules                         │
└─────────────────────────────────────────────────────┘
```

No database. No Redis. No websockets. Just HTTP requests, a message array held in memory per session, and Claude doing the thinking.

---

## The Smart Part: How It Stays Focused

This is the key design decision. The bot needs to be **brilliant** at its job and **useless** at everything else. We achieve this through three layers working together:

### Layer 1 — The System Prompt (the personality and rules)

The system prompt is the single most important file in the project. It defines:

- **Identity**: Who the bot is, what company it works for, its tone of voice.
- **Scope**: Exactly what topics it can discuss (products, services, orders, policies).
- **Boundaries**: What it must refuse or redirect (anything off-topic).
- **Escalation**: When and how to hand off to a human.

This lives in a separate file (`system-prompt.md`) so it can be edited by non-developers. The prompt follows a strict structure:

```
IDENTITY
  → You are [name], the customer support assistant for [company].
  → Your job is to help customers with questions about [specific scope].

RULES
  → Only answer questions related to [company]'s products and services.
  → If a question is off-topic, acknowledge it politely and redirect.
  → Never make up information. If you don't know, say so.
  → Never discuss competitors, politics, personal opinions.
  → If a customer is angry or the issue is complex, offer human handoff.

TONE
  → Friendly, professional, concise.
  → Match the customer's energy — casual if they're casual, formal if they're formal.
  → Never use corporate waffle. Be direct and helpful.

KNOWLEDGE INSTRUCTIONS
  → You have access to a product_search tool. Use it to look up specific products.
  → You have access to a policy_lookup tool. Use it for returns, shipping, etc.
  → Always cite specific product names, prices, and policy details from tools.
  → Never guess. Always look it up.
```

### Layer 2 — The Knowledge Base (what it knows)

Rather than cramming everything into the system prompt (which wastes tokens and gets ignored in long conversations), the knowledge lives in structured files that Claude accesses through **tools**.

```
/knowledge
  /products.json        ← product catalogue with names, descriptions, prices, specs
  /faqs.json            ← common questions and their answers
  /policies.json        ← returns, shipping, warranty, terms
  /contact.json         ← escalation paths, business hours, human handoff triggers
```

**Why JSON and not a vector database?** Because for most small-to-medium businesses, your product catalogue is small enough to search with simple string matching. A vector DB is overkill. If you've got 50 products and 30 FAQs, a simple keyword search across JSON files is instant and costs nothing. If you later grow to thousands of products, you can swap in a vector search without changing anything else.

### Layer 3 — Tool-Based Retrieval (how it finds answers)

The bot doesn't get the entire knowledge base shoved into its context. Instead, it gets **tools** that let it search for specific information:

```typescript
// Tools the bot can call:

product_search(query: string)
  → Searches products.json by name, category, or keyword
  → Returns matching products with full details

policy_lookup(topic: string)
  → Looks up a specific policy (returns, shipping, warranty, etc.)
  → Returns the relevant policy text

faq_search(query: string)
  → Searches FAQs by keyword
  → Returns matching Q&A pairs

escalate_to_human(reason: string)
  → Flags the conversation for human review
  → Returns a message telling the customer a human will follow up
```

This is the same agent loop pattern you've already built — Claude decides which tools to call, your code executes them, results go back to Claude, Claude gives the final answer. The difference is these tools search your local knowledge base instead of the web.

---

## File Structure

```
chatbot/
├── server.ts              ← Bun HTTP server (routes + static file serving)
├── agent.ts               ← Agent loop (Claude API + tool execution)
├── tools.ts               ← Tool definitions and implementations
├── knowledge.ts           ← Knowledge base loader and search functions
├── system-prompt.md       ← The bot's personality and rules (editable text)
├── public/
│   └── chat.html          ← The entire frontend (HTML + CSS + JS in one file)
├── knowledge/
│   ├── products.json      ← Product catalogue
│   ├── faqs.json          ← Frequently asked questions
│   ├── policies.json      ← Business policies
│   └── contact.json       ← Escalation and contact info
├── .env                   ← API key
├── package.json
└── tsconfig.json
```

**8 TypeScript/config files. 1 HTML file. 4 JSON knowledge files. 1 markdown prompt. That's the whole thing.**

---

## Session Management

Each chat conversation needs to maintain its message history (so Claude has context for follow-up questions). Simplest approach:

- Frontend generates a random `sessionId` on page load.
- Every request to `/api/chat` includes the `sessionId`.
- Server keeps a `Map<string, Message[]>` in memory — sessionId → conversation history.
- Sessions expire after 30 minutes of inactivity (a simple cleanup interval).

No database, no cookies, no auth. If the user refreshes the page, they get a new session. That's fine for customer service — these are typically short conversations.

```typescript
// server.ts — session store
const sessions = new Map<string, { messages: Message[]; lastActive: number }>();

// Cleanup stale sessions every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000; // 30 mins
  for (const [id, session] of sessions) {
    if (session.lastActive < cutoff) sessions.delete(id);
  }
}, 5 * 60 * 1000);
```

---

## API Flow (what happens when the user sends a message)

```
1. User types "Do you have the oak kitchen worktops in stock?"

2. Frontend sends:
   POST /api/chat
   { sessionId: "abc123", message: "Do you have the oak kitchen worktops in stock?" }

3. Server retrieves (or creates) the session's message array

4. Agent appends the user message and calls Claude with:
   - System prompt (loaded from system-prompt.md)
   - Full conversation history
   - Tool definitions (product_search, policy_lookup, faq_search, escalate_to_human)

5. Claude responds with a tool call:
   tool_use: product_search({ query: "oak kitchen worktops" })

6. Agent executes the tool → searches products.json → returns matches

7. Agent sends tool result back to Claude

8. Claude responds with a natural language answer:
   "Yes! We have the Solid Oak Kitchen Worktop available in 3 sizes:
    - 2000mm x 600mm — £189.99
    - 3000mm x 600mm — £269.99
    - 4000mm x 600mm — £349.99
    All are in stock with next-day delivery. Want me to help you with anything else?"

9. Server stores the updated message array and returns the response

10. Frontend displays the message in the chat widget
```

---

## The Chat Widget (Frontend)

Single HTML file. No React, no build step. Vanilla JS. It looks professional but it's dead simple under the hood.

**Key design decisions:**

- **Floating button** in bottom-right corner (the industry standard position).
- **Chat panel** slides up when clicked — fixed position, doesn't affect page layout.
- **Streaming responses** via `fetch` with a readable stream — the bot's reply appears word-by-word, which feels much more responsive than waiting for the full response.
- **Markdown rendering** — the bot might use bold text, bullet points, or links. A tiny markdown parser (or just regex replacements for bold/links/lists) handles this.
- **Mobile responsive** — full-width on mobile, fixed-width panel on desktop.
- **Typing indicator** — shows "..." animation while waiting for a response.
- **Branding** — company logo, colours, and name configurable via a small config object at the top of the file.

```html
<!-- The entire widget config -->
<script>
  const CHATBOT_CONFIG = {
    name: "Support Assistant",
    greeting: "Hi! How can I help you today?",
    placeholder: "Ask about our products or services...",
    primaryColour: "#2563eb",
    position: "bottom-right",
    apiEndpoint: "/api/chat"
  };
</script>
```

**No npm packages on the frontend. No bundler. Just a `<script>` tag in an HTML file served by Bun.**

---

## Off-Topic Handling (The Focus Mechanism)

This is critical. The system prompt handles most of it, but we add a safety net:

### In the system prompt:
```
If a customer asks something unrelated to [company]'s products and services,
respond with something like:
"I'm specifically trained to help with [company]'s products and services.
I wouldn't want to give you bad information on other topics!
Is there anything about our products I can help you with?"
```

### In the agent layer (belt and braces):
A lightweight **topic classifier** runs before sending to Claude. This isn't a separate AI call — it's a simple keyword/pattern check that flags obviously off-topic messages and adds a note to Claude's context:

```typescript
// Simple off-topic detection (not AI — just pattern matching)
function isLikelyOffTopic(message: string): boolean {
  const offTopicPatterns = [
    /write me (a |an )?(poem|essay|story|song)/i,
    /what('s| is) the (weather|time|news|score)/i,
    /who (is|was) the president/i,
    /help me with (my )?(homework|code|resume)/i,
    /tell me a joke/i,
    /what do you think about/i,
    // ... etc
  ];
  return offTopicPatterns.some(p => p.test(message));
}
```

If flagged, the agent prepends a note: `[SYSTEM NOTE: This message may be off-topic. Stay focused on your role.]` — this nudges Claude without blocking the message entirely (in case the pattern match was wrong).

---

## Escalation to Human

The bot should know when to hand off. The `escalate_to_human` tool is available to Claude, and the system prompt tells it when to use it:

```
Use the escalate_to_human tool when:
- The customer explicitly asks to speak to a person
- The customer is visibly frustrated after 2+ exchanges
- The issue involves billing disputes, legal matters, or complaints
- You genuinely cannot find the answer in your knowledge base
- The conversation has gone back and forth 5+ times without resolution
```

When triggered, the tool:
1. Logs the conversation to a file (or sends it via webhook/email)
2. Returns a friendly handoff message to the customer
3. Optionally captures the customer's email for follow-up

---

## Security Considerations

- **Rate limiting**: Simple per-IP counter in a Map. 20 messages per minute max. Prevents abuse and runaway API costs.
- **Input sanitisation**: Strip HTML from user messages before display. Cap message length at 500 characters.
- **No secrets on the frontend**: API key only lives server-side. The frontend only talks to your Bun server, never directly to Claude.
- **Session limits**: Max 50 messages per session. After that, suggest contacting support directly.
- **Prompt injection defence**: The system prompt includes instructions to ignore attempts to override its role. Not bulletproof, but combined with the off-topic detection and tool-only knowledge access, it's solid enough for a customer service context.

---

## Configuration (Making It Reusable)

The whole thing should work for any small business by changing three things:

1. **`system-prompt.md`** — edit the company name, tone, scope, and rules.
2. **`/knowledge/*.json`** — replace with the actual products, FAQs, and policies.
3. **`CHATBOT_CONFIG` in `chat.html`** — update branding colours, name, and greeting.

That's the pitch for AutoGen Digital — you build this once, then sell the setup and customisation as a service. Each client gets their own instance with their own knowledge base.

---

## Cost Control

- **Model choice**: Claude Sonnet (not Opus) for the chatbot — fast, cheap, still very capable for structured Q&A. Roughly $3/million input tokens, $15/million output.
- **Short context**: By using tools instead of stuffing everything in the system prompt, each request is small. A typical exchange is ~1000-2000 tokens total.
- **Session limits**: 50 messages max prevents runaway conversations.
- **Estimated cost**: For a small business getting 100 chat conversations per day averaging 6 messages each — roughly **£1-2/day** in API costs.

---

## Build Order (What to Code First)

1. **`knowledge.ts`** — loader and search functions. Get this right first because everything depends on it. Test with dummy product data.
2. **`tools.ts`** — tool definitions that wrap the knowledge functions. Match the Anthropic tool_use format.
3. **`agent.ts`** — the agent loop. You've already built this before — same pattern, different tools.
4. **`system-prompt.md`** — write and iterate on the prompt. Test it with different question types.
5. **`server.ts`** — Bun HTTP server with routes and session management.
6. **`chat.html`** — the frontend widget. Start ugly, make it pretty last.

---

## What This Doesn't Include (On Purpose)

- **No database** — sessions are in memory, knowledge is in JSON files. Add a DB later if you need conversation analytics.
- **No auth** — it's a public-facing support chat. No login needed.
- **No websockets** — HTTP streaming via fetch is simpler and good enough. Websockets are overkill for a request-response chatbot.
- **No framework** — no Express, no Hono, no Elysia. Bun's built-in `Bun.serve()` does everything we need.
- **No vector DB** — simple keyword search is fine for <500 products. Upgrade path is clear if needed later.
- **No conversation analytics** — add logging to a file or webhook later if you want to review conversations.

Each of these is a deliberate "not yet" — easy to add later without restructuring anything.
