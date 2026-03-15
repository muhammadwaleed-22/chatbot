import { GoogleGenerativeAI } from "@google/generative-ai";

export const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_FALLBACK_MODELS = [
  GEMINI_MODEL,
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-pro-latest"
];
const RETRYABLE_STATUS_SNIPPETS = ["429", "RESOURCE_EXHAUSTED", "rate limit", "quota"];

const resolveGeminiApiKey = () => import.meta.env.VITE_GEMINI_API_KEY?.trim();

const mapRoleToGemini = (role) => {
  if (role === "assistant") return "model";
  return "user";
};

const parseBase64DataUrl = (url) => {
  if (typeof url !== "string") return null;
  const match = url.match(/^data:(.*?);base64,(.*)$/);
  if (!match) return null;
  return {
    mimeType: match[1] || "application/octet-stream",
    data: match[2]
  };
};

const mapPartToGemini = (part) => {
  if (typeof part === "string") {
    return { text: part };
  }

  if (!part || typeof part !== "object") return null;

  if (part.type === "text") {
    return { text: part.text || "" };
  }

  if (part.type === "image_url") {
    const inlineImage = parseBase64DataUrl(part.image_url?.url);
    if (!inlineImage) return null;
    return { inlineData: inlineImage };
  }

  return null;
};

const mapMessageContentToParts = (content) => {
  if (Array.isArray(content)) {
    const parts = content.map(mapPartToGemini).filter(Boolean);
    return parts.length ? parts : [{ text: "" }];
  }

  if (typeof content === "string") {
    return [{ text: content }];
  }

  return [{ text: "" }];
};

const toGeminiContents = (messages) =>
  messages.map((message) => ({
    role: mapRoleToGemini(message.role),
    parts: mapMessageContentToParts(message.content)
  }));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const streamGeminiReply = async ({
  messages,
  temperature = 0.7,
  onToken,
  systemInstruction = ""
}) => {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new Error("Missing VITE_GEMINI_API_KEY for Gemini Analyze mode.");
  }

  const contents = toGeminiContents(messages);
  if (!contents.length) {
    throw new Error("No messages provided for Gemini request.");
  }

  const client = new GoogleGenerativeAI(apiKey);
  let lastError = null;

  for (const modelName of GEMINI_FALLBACK_MODELS) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const model = client.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature
          },
          ...(systemInstruction ? { systemInstruction } : {})
        });

        const response = await model.generateContentStream({ contents });
        let reply = "";

        for await (const chunk of response.stream) {
          const token = chunk.text();
          if (!token) continue;
          reply += token;
          if (onToken) onToken(token);
        }

        return reply;
      } catch (error) {
        lastError = error;
        const message = String(error?.message || "");
        const normalized = message.toLowerCase();
        const isNotFound =
          normalized.includes("404") ||
          normalized.includes("not_found") ||
          normalized.includes("not found for api version");
        const isRetryable = RETRYABLE_STATUS_SNIPPETS.some((snippet) =>
          normalized.includes(snippet.toLowerCase())
        );

        if (isNotFound) {
          break;
        }

        if (isRetryable && attempt < 1) {
          await wait(900 * (attempt + 1));
          continue;
        }

        if (isRetryable) {
          break;
        }

        throw new Error(message || "Gemini request failed.");
      }
    }
  }

  throw new Error(
    `No compatible Gemini model was found for this API key. Last error: ${lastError?.message || "unknown error"}`
  );
};
