import PREFS from "../../utils/prefs.js";

const gemini = {
  name: "gemini",
  label: "Google Gemini",
  faviconUrl: "https://www.google.com/s2/favicons?sz=32&domain_url=https%3A%2F%2Fgemini.google.com",
  apiKeyUrl: "https://aistudio.google.com/app/apikey",
  AVAILABLE_MODELS: [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
  ],
  AVAILABLE_MODELS_LABELS: {
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini-2.0-flash": "Gemini 2.0 Flash",
    "gemini-2.0-flash-lite": "Gemini 2.0 Flash Lite",
    "gemini-1.5-pro": "Gemini 1.5 Pro",
    "gemini-1.5-flash": "Gemini 1.5 Flash",
    "gemini-1.5-flash-8b": "Gemini 1.5 Flash 8B",
  },
  modelPref: PREFS.GEMINI_MODEL,
  apiPref: PREFS.GEMINI_API_KEY,

  get apiKey() {
    return PREFS.geminiApiKey;
  },
  set apiKey(value) {
    if (typeof value === "string") PREFS.geminiApiKey = value;
  },

  get model() {
    return PREFS.geminiModel;
  },
  set model(value) {
    if (this.AVAILABLE_MODELS.includes(value)) PREFS.geminiModel = value;
  },

  get apiUrl() {
    const model = this.model;
    if (!model) return null;
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  },

  async sendMessage(requestBody) {
    const apiKey = this.apiKey;
    const apiUrl = this.apiUrl;
    if (!apiKey || !apiUrl) {
      throw new Error("Invalid arguments for sendMessage.");
    }
    let response;
    try {
      response = await fetch(apiUrl, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
    } catch (networkError) {
      console.error("Network error while calling Gemini API:", networkError);
      throw new Error("Network error: " + networkError.message);
    }

    if (!response.ok) {
      let errorText = null;
      try {
        const errorData = await response.json();
        errorText = JSON.stringify(errorData, null, 2);
        console.error("Gemini API error response:", errorText);
        throw new Error(`API Error: ${response.status} - ${errorData.error?.message || errorText}`);
      } catch (jsonError) {
        errorText = await response.text();
        console.error("Gemini API error (non-JSON):", errorText);
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }
    }

    let data = await response.json();
    let modelResponse = data.candidates?.[0]?.content;
    return modelResponse;
  },
};

export default gemini;
