import PREFS from "../../utils/prefs.js";

const perplexity = {
  name: "perplexity",
  label: "Perplexity AI",
  faviconUrl: "https://www.perplexity.ai/favicon.ico",
  apiKeyUrl: "https://www.perplexity.ai/settings/api",
  AVAILABLE_MODELS: [
    "pplx-7b-chat",
    "pplx-70b-chat",
    "pplx-llama-3-8b-instruct",
    "pplx-llama-3-70b-instruct"
  ],
  AVAILABLE_MODELS_LABELS: {
    "pplx-7b-chat": "PPLX 7B Chat",
    "pplx-70b-chat": "PPLX 70B Chat",
    "pplx-llama-3-8b-instruct": "Llama 3 8B Instruct",
    "pplx-llama-3-70b-instruct": "Llama 3 70B Instruct"
  },
  modelPref: PREFS.PERPLEXITY_MODEL,
  apiPref: PREFS.PERPLEXITY_API_KEY,

  get apiKey() {
    return PREFS.perplexityApiKey;
  },
  set apiKey(value) {
    if (typeof value === "string") PREFS.perplexityApiKey = value;
  },

  get model() {
    return PREFS.perplexityModel;
  },
  set model(value) {
    if (this.AVAILABLE_MODELS.includes(value)) PREFS.perplexityModel = value;
  },

  get apiUrl() {
    return "https://api.perplexity.ai/v1/chat/completions";
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
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
    } catch (networkError) {
      console.error("Network error while calling Perplexity API:", networkError);
      throw new Error("Network error: " + networkError.message);
    }

    if (!response.ok) {
      let errorText = null;
      try {
        const errorData = await response.json();
        errorText = JSON.stringify(errorData, null, 2);
        console.error("Perplexity API error response:", errorText);
        throw new Error("API Error: " + response.status + " - " + (errorData.error?.message || errorText));
      } catch (jsonError) {
        errorText = await response.text();
        console.error("Perplexity API error (non-JSON):", errorText);
        throw new Error("API Error: " + response.status + " - " + errorText);
      }
    }

    let data = await response.json();
    // Adapt response to expected format if needed
    return data;
  }
};

export default perplexity;
