const dotenv = require("dotenv");

dotenv.config();

function getConfig() {
  return {
    port: Number(process.env.PORT || 3000),
    modelProvider: process.env.MODEL_PROVIDER || "openai-compatible",
    modelBaseUrl: (process.env.MODEL_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    modelName: process.env.MODEL_NAME || "gpt-4o-mini",
    modelApiKey: process.env.MODEL_API_KEY || "",
    modelTimeoutMs: Number(process.env.MODEL_TIMEOUT_MS || 5000)
  };
}

module.exports = { getConfig };
