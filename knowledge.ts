import { readFileSync } from "fs";

// Types
export interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  inStock: boolean;
  specs?: Record<string, string>;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
}

export interface Policy {
  id: string;
  topic: string;
  title: string;
  content: string;
}

export interface ContactInfo {
  businessHours: string;
  email: string;
  phone: string;
  escalationTriggers: string[];
  handoffMessage: string;
}

// Knowledge base data
let products: Product[] = [];
let faqs: FAQ[] = [];
let policies: Policy[] = [];
let contactInfo: ContactInfo | null = null;

// Simple keyword matching search
function searchByKeyword<T extends { name?: string; question?: string; title?: string; keywords?: string[]; description?: string }>(
  items: T[],
  query: string
): T[] {
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

    // Check if any query word matches
    return queryWords.some(word => {
      if (word.length < 2) return false;
      return searchableText.includes(word);
    });
  });
}

// Load knowledge base from JSON files
export function loadKnowledgeBase(): void {
  try {
    const productsPath = "./knowledge/products.json";
    const faqsPath = "./knowledge/faqs.json";
    const policiesPath = "./knowledge/policies.json";
    const contactPath = "./knowledge/contact.json";

    try {
      products = JSON.parse(readFileSync(productsPath, "utf-8"));
    } catch {
      products = [];
    }

    try {
      faqs = JSON.parse(readFileSync(faqsPath, "utf-8"));
    } catch {
      faqs = [];
    }

    try {
      policies = JSON.parse(readFileSync(policiesPath, "utf-8"));
    } catch {
      policies = [];
    }

    try {
      contactInfo = JSON.parse(readFileSync(contactPath, "utf-8"));
    } catch {
      contactInfo = null;
    }

    console.log(`Loaded knowledge base: ${products.length} products, ${faqs.length} FAQs, ${policies.length} policies`);
  } catch (error) {
    console.error("Error loading knowledge base:", error);
  }
}

// Search products
export function searchProducts(query: string): Product[] {
  if (!query.trim()) return [];

  const results = searchByKeyword(products, query);
  return results.slice(0, 10); // Limit to 10 results
}

// Search FAQs
export function searchFAQs(query: string): FAQ[] {
  if (!query.trim()) return [];

  const results = searchByKeyword(faqs, query);
  return results.slice(0, 5);
}

// Lookup policy by topic
export function lookupPolicy(topic: string): Policy | null {
  if (!topic.trim()) return null;

  const topicLower = topic.toLowerCase();

  // Direct match first
  const directMatch = policies.find(
    p => p.topic.toLowerCase() === topicLower || p.title.toLowerCase().includes(topicLower)
  );

  if (directMatch) return directMatch;

  // Keyword match
  const results = searchByKeyword(policies, topic);
  return results[0] || null;
}

// Get contact info
export function getContactInfo(): ContactInfo | null {
  return contactInfo;
}

// Get all products (for debugging)
export function getAllProducts(): Product[] {
  return products;
}
