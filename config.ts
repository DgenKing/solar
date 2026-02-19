// API Configuration - hardcoded directly (NOT using dotenv - it loads wrong file)
export const CONFIG = {
  // DeepSeek API key
  DEEPSEEK_API_KEY: "sk-244095dff8304953b4a69ddca64d2a37",

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
