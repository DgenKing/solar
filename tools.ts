import { searchProducts, searchFAQs, lookupPolicy, getContactInfo, type Product, type FAQ, type Policy } from "./knowledge.ts";

// Tool input/output types
export interface ToolInput {
  query?: string;
  topic?: string;
  reason?: string;
}

export interface ToolResult {
  success: boolean;
  result?: string;
  error?: string;
}

// Tool definitions for Claude API (Anthropic format)
export const toolDefinitions = [
  {
    name: "product_search",
    description: "Search the product catalogue for products matching a query. Use this when customers ask about specific products, prices, availability, or product details.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query - can be product name, category, or keywords"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "faq_search",
    description: "Search frequently asked questions for answers to common customer questions.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query for FAQ lookup"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "policy_lookup",
    description: "Look up business policies such as returns, shipping, warranty, terms and conditions.",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Policy topic to look up (e.g., 'returns', 'shipping', 'warranty')"
        }
      },
      required: ["topic"]
    }
  },
  {
    name: "escalate_to_human",
    description: "Flag the conversation for human review. Use this when the customer explicitly asks to speak to a person, is frustrated, has a complex issue, or you cannot find the answer.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Reason for escalation"
        }
      },
      required: ["reason"]
    }
  }
];

// Tool execution functions
export async function executeTool(toolName: string, input: ToolInput): Promise<ToolResult> {
  try {
    switch (toolName) {
      case "product_search": {
        const query = input.query || "";
        const results = searchProducts(query);

        if (results.length === 0) {
          return {
            success: true,
            result: "No products found matching that query. Try a different search term or browse our categories."
          };
        }

        const formatted = results.map((p: Product) => {
          const specs = p.specs
            ? "\n  Specs: " + Object.entries(p.specs).map(([k, v]) => `${k}: ${v}`).join(", ")
            : "";

          return `• ${p.name} (${p.category})
  ${p.description}
  Price: £${p.price.toFixed(2)}
  ${p.inStock ? "✓ In Stock" : "✗ Out of Stock"}${specs}`;
        }).join("\n\n");

        return {
          success: true,
          result: `Found ${results.length} product(s):\n\n${formatted}`
        };
      }

      case "faq_search": {
        const query = input.query || "";
        const results = searchFAQs(query);

        if (results.length === 0) {
          return {
            success: true,
            result: "No FAQs found matching that query."
          };
        }

        const formatted = results.map((f: FAQ) => {
          return `Q: ${f.question}\nA: ${f.answer}`;
        }).join("\n\n---\n\n");

        return {
          success: true,
          result: formatted
        };
      }

      case "policy_lookup": {
        const topic = input.topic || "";
        const policy = lookupPolicy(topic);

        if (!policy) {
          return {
            success: true,
            result: `No policy found for "${topic}". Try a different topic like 'returns', 'shipping', 'warranty', or 'terms'.`
          };
        }

        return {
          success: true,
          result: `${policy.title}\n\n${policy.content}`
        };
      }

      case "escalate_to_human": {
        const contact = getContactInfo();
        const reason = input.reason || "Customer requested human assistance";

        // In a real implementation, this would log to file, send webhook, etc.
        console.log(`[ESCALATION] Reason: ${reason}`);

        const handoffMessage = contact?.handoffMessage ||
          "I've flagged your conversation for our team to review. A human support agent will be with you shortly.";

        return {
          success: true,
          result: `${handoffMessage}\n\n${contact ? `Business hours: ${contact.businessHours}\nEmail: ${contact.email}\nPhone: ${contact.phone}` : ""}`
        };
      }

      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`
        };
    }
  } catch (error) {
    return {
      success: false,
      result: undefined,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

// Get tool definition by name
export function getToolDefinition(name: string) {
  return toolDefinitions.find(t => t.name === name);
}
