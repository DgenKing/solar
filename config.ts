// API Configuration - uses environment variables
export const CONFIG = {
  // DeepSeek API key - set via DEEPSEEK_API_KEY environment variable
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || "",

  // Model settings
  MODEL: "deepseek-chat",

  // Session settings
  SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  MAX_MESSAGES_PER_SESSION: 50,

  // Rate limiting
  MAX_MESSAGES_PER_MINUTE: 20,

  // Message settings
  MAX_MESSAGE_LENGTH: 500,
};
