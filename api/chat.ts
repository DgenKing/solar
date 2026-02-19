// Types
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface AgentResponse {
  content: string;
  error?: string;
}

interface ChatRequest {
  sessionId: string;
  message: string;
}

// Knowledge base data
let products: any[] = [];
let faqs: any[] = [];
let policies: any[] = [];

// Simple keyword matching search
function searchByKeyword(items: any[], query: string): any[] {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/);

  return items.filter(item => {
    const searchableText = [
      item.name,
      item.question,
      item.title,
      item.description,
      item.keywords?.join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return queryWords.some(word => {
      if (word.length < 2) return false;
      return searchableText.includes(word);
    });
  });
}

// Load knowledge base from JSON files (inline for Vercel)
function loadKnowledgeBase(): void {
  // Inline data for Vercel deployment
  products = [
    { id: "p1", name: "Premium Oak Worktop", category: "Worktops", description: "High-quality solid oak worktop", price: 149.99, inStock: true, specs: { thickness: "40mm", length: "3m" } },
    { id: "p2", name: "Walnut Flooring", category: "Flooring", description: "Engineered walnut flooring", price: 45.99, inStock: true, specs: { thickness: "14mm", width: "150mm" } },
    { id: "p3", name: "Bamboo Stair Nosing", category: "Stairs", description: "Bamboo stair nosing strip", price: 24.99, inStock: true },
    { id: "p4", name: "Quartz Worktop", category: "Worktops", description: "Engineered quartz surface", price: 299.99, inStock: false },
    { id: "p5", name: "Composite Decking", category: "Flooring", description: "Weather-resistant composite boards", price: 39.99, inStock: true },
  ];

  faqs = [
    { id: "f1", question: "How do I measure for flooring?", answer: "Measure the room length and width, multiply for square meters. Add 10% for wastage.", keywords: ["measure", "flooring", "size"] },
    { id: "f2", question: "What's your delivery time?", answer: "Standard delivery is 3-5 working days. Express delivery available for next day.", keywords: ["delivery", "time", "shipping"] },
    { id: "f3", question: "Do you offer installation?", answer: "Yes, we can recommend certified installers in your area. Contact us for a quote.", keywords: ["install", "fitting", "service"] },
    { id: "f4", question: "How do I care for oak worktops?", answer: "Oil your oak worktop every 3-6 months with danish oil. Wipe clean with damp cloth, avoid harsh chemicals.", keywords: ["care", "oil", "maintenance", "oak"] },
  ];

  policies = [
    { id: "pol1", topic: "returns", title: "Returns Policy", content: "You can return any unused item within 30 days for a full refund. Item must be in original packaging." },
    { id: "pol2", topic: "shipping", title: "Shipping Information", content: "Free delivery on orders over £100. Standard delivery £9.99. Next day delivery £19.99." },
    { id: "pol3", topic: "warranty", title: "Warranty", content: "All products come with minimum 1 year manufacturer warranty. Extended warranty available on request." },
  ];

  console.log(`Loaded: ${products.length} products, ${faqs.length} FAQs, ${policies.length} policies`);
}

function searchProducts(query: string): any[] {
  if (!query.trim()) return [];
  const results = searchByKeyword(products, query);
  return results.slice(0, 10);
}

function searchFAQs(query: string): any[] {
  if (!query.trim()) return [];
  const results = searchByKeyword(faqs, query);
  return results.slice(0, 5);
}

function lookupPolicy(topic: string): any | null {
  if (!topic.trim()) return null;
  const topicLower = topic.toLowerCase();
  const directMatch = policies.find(
    p => p.topic.toLowerCase() === topicLower || p.title.toLowerCase().includes(topicLower)
  );
  if (directMatch) return directMatch;
  const results = searchByKeyword(policies, topic);
  return results[0] || null;
}

// Auto-detect and call appropriate knowledge tool
function autoSearchKnowledge(query: string): string {
  const queryLower = query.toLowerCase();

  const productKeywords = ['product', 'buy', 'price', 'cost', 'stock', 'worktop', 'flooring', 'door', 'stair', 'oak', 'walnut', 'bamboo', 'quartz'];
  if (productKeywords.some(k => queryLower.includes(k))) {
    const results = searchProducts(query);
    if (results.length > 0) {
      return `PRODUCT SEARCH RESULTS:\n\n` + results.map((p: any) => {
        const specs = p.specs ? "\n  Specs: " + Object.entries(p.specs).map(([k, v]: [string, any]) => `${k}: ${v}`).join(", ") : "";
        return `• ${p.name} (${p.category})\n  ${p.description}\n  Price: £${p.price.toFixed(2)}\n  ${p.inStock ? "✓ In Stock" : "✗ Out of Stock"}${specs}`;
      }).join("\n\n");
    }
  }

  const policyKeywords = ['return', 'refund', 'shipping', 'delivery', 'warranty', 'terms', 'privacy', 'policy', 'discount'];
  if (policyKeywords.some(k => queryLower.includes(k))) {
    const policy = lookupPolicy(query);
    if (policy) {
      return `POLICY INFO:\n\n${policy.title}\n\n${policy.content}`;
    }
  }

  const faqKeywords = ['how', 'what', 'can i', 'do you', 'where', 'when', 'faq', 'help'];
  if (faqKeywords.some(k => queryLower.includes(k))) {
    const results = searchFAQs(query);
    if (results.length > 0) {
      return `FAQ RESULTS:\n\n` + results.map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n---\n\n");
    }
  }

  return "";
}

// DeepSeek API call
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const MODEL = "deepseek-chat";

async function callDeepSeekAPI(messages: { role: string; content: string }[]): Promise<string> {
  const systemPrompt = `You are a friendly customer service chatbot for a UK home improvement store. You help customers with:
- Product recommendations and pricing
- Flooring, worktops, stairs, and doors
- Delivery and shipping questions
- Returns and warranty information

Be helpful, concise, and professional. Use UK English spelling.`;

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 1024
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as { choices?: { message: { content: string } }[] };
  const message = data.choices?.[0]?.message;

  if (!message) {
    throw new Error("No response from DeepSeek API");
  }

  return message.content || "";
}

async function runAgent(userMessage: string, conversationHistory: Message[] = []): Promise<AgentResponse> {
  const apiMessages: { role: string; content: string }[] = [];

  for (const msg of conversationHistory) {
    apiMessages.push({ role: msg.role, content: msg.content });
  }

  const knowledgeContext = autoSearchKnowledge(userMessage);

  const userContent = `CUSTOMER QUESTION: ${userMessage}\n\n` +
    (knowledgeContext ? `RELEVANT KNOWLEDGE:\n${knowledgeContext}\n\nPlease answer based on this information.` : "");

  apiMessages.push({ role: "user", content: userContent });

  try {
    const response = await callDeepSeekAPI(apiMessages);
    return { content: response };
  } catch (error) {
    return {
      content: "",
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

// Sessions store
const sessions = new Map<string, { messages: Message[]; lastActive: number }>();

// Load knowledge base on cold start
loadKnowledgeBase();

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

  if (!DEEPSEEK_API_KEY) {
    return new Response(
      JSON.stringify({ error: "API key not configured" }),
      { status: 500, headers }
    );
  }

  try {
    const body = await req.json() as ChatRequest;
    const { sessionId, message } = body;

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
