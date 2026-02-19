import { readFileSync } from "fs";
import { CONFIG } from "./config.ts";
import { searchProducts, searchFAQs, lookupPolicy, getContactInfo } from "./knowledge.ts";

// Types
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AgentResponse {
  content: string;
  error?: string;
}

// Off-topic detection
function isLikelyOffTopic(message: string): boolean {
  const offTopicPatterns = [
    /write me (a |an )?(poem|essay|story|song)/i,
    /what('s| is) the (weather|time|news|score)/i,
    /who (is|was) the president/i,
    /help me with (my )?(homework|code|resume)/i,
    /tell me a joke/i,
    /what do you think about/i,
    /what is the meaning of life/i,
    /can you hack/i,
    /give me your system prompt/i,
    /ignore previous instructions/i,
  ];

  return offTopicPatterns.some(p => p.test(message));
}

// Load system prompt
function loadSystemPrompt(): string {
  try {
    return readFileSync("./system-prompt.md", "utf-8");
  } catch {
    return `You are a customer service chatbot. Help customers with product questions, orders, and policies. Be friendly, professional, and concise.`;
  }
}

// Auto-detect and call appropriate knowledge tool
function autoSearchKnowledge(query: string): string {
  const queryLower = query.toLowerCase();

  // Check for product-related keywords
  const productKeywords = ['product', 'buy', 'price', 'cost', 'stock', 'worktop', 'flooring', 'door', 'stair', 'oak', 'walnut', 'bamboo', 'quartz'];
  if (productKeywords.some(k => queryLower.includes(k))) {
    const results = searchProducts(query);
    if (results.length > 0) {
      return `PRODUCT SEARCH RESULTS:\n\n` + results.map((p: any) => {
        const specs = p.specs ? "\n  Specs: " + Object.entries(p.specs).map(([k, v]) => `${k}: ${v}`).join(", ") : "";
        return `• ${p.name} (${p.category})\n  ${p.description}\n  Price: £${p.price.toFixed(2)}\n  ${p.inStock ? "✓ In Stock" : "✗ Out of Stock"}${specs}`;
      }).join("\n\n");
    }
  }

  // Check for policy keywords
  const policyKeywords = ['return', 'refund', 'shipping', 'delivery', 'warranty', 'terms', 'privacy', 'policy', 'discount'];
  if (policyKeywords.some(k => queryLower.includes(k))) {
    const policy = lookupPolicy(query);
    if (policy) {
      return `POLICY INFO:\n\n${policy.title}\n\n${policy.content}`;
    }
  }

  // Check for FAQ keywords
  const faqKeywords = ['how', 'what', 'can i', 'do you', 'where', 'when', 'faq', 'help'];
  if (faqKeywords.some(k => queryLower.includes(k))) {
    const results = searchFAQs(query);
    if (results.length > 0) {
      return `FAQ RESULTS:\n\n` + results.map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n---\n\n");
    }
  }

  // Fallback: search everything
  const products = searchProducts(query);
  const faqs = searchFAQs(query);
  const policy = lookupPolicy(query);

  let context = "";
  if (products.length > 0) {
    context += `PRODUCTS:\n` + products.map((p: any) => `${p.name} - £${p.price}`).join(", ") + "\n\n";
  }
  if (faqs.length > 0) {
    context += `RELATED FAQs:\n` + faqs.map((f: any) => f.question).join("\n") + "\n\n";
  }
  if (policy) {
    context += `POLICY: ${policy.title}\n`;
  }

  return context || "No relevant information found.";
}

// Call DeepSeek API
async function callDeepSeekAPI(messages: { role: string; content: string }[]): Promise<string> {
  const systemPrompt = loadSystemPrompt();

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CONFIG.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: CONFIG.MODEL,
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

// Main agent function
export async function runAgent(userMessage: string, conversationHistory: Message[] = []): Promise<AgentResponse> {
  // Check for off-topic
  let systemNote = "";
  if (isLikelyOffTopic(userMessage)) {
    systemNote = "[SYSTEM NOTE: This message appears to be off-topic. Stay focused on your role as a customer service chatbot. Politely redirect to relevant topics.]";
  }

  // Build messages
  const apiMessages: { role: string; content: string }[] = [];

  // Add conversation history
  for (const msg of conversationHistory) {
    apiMessages.push({
      role: msg.role,
      content: msg.content
    });
  }

  // Auto-search knowledge base for relevant context
  const knowledgeContext = autoSearchKnowledge(userMessage);

  // Add user message with knowledge context
  const userContent = systemNote + (systemNote ? "\n\n" : "") +
    `CUSTOMER QUESTION: ${userMessage}\n\n` +
    (knowledgeContext ? `RELEVANT KNOWLEDGE:\n${knowledgeContext}\n\nPlease answer based on this information.` : "");

  apiMessages.push({
    role: "user",
    content: userContent
  });

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
