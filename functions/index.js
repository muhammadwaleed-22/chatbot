import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import process from "node:process";

initializeApp();

const MODEL_BY_MODE = {
  Fast: "llama-3.3-70b-versatile",
  Pro: "llama-3.1-8b-instant",
  Analyze: "meta-llama/llama-4-maverick-17b-128e-instruct"
};

const streamEvent = (res, payload) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const verifyFirebaseUser = async (req) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Missing Firebase ID token.");
  }

  const idToken = authHeader.slice("Bearer ".length).trim();
  if (!idToken) {
    throw new Error("Invalid Firebase ID token.");
  }

  return getAuth().verifyIdToken(idToken);
};

export const streamChatCompletion = onRequest(
  { region: "us-central1", timeoutSeconds: 300, cors: true },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      await verifyFirebaseUser(req);
    } catch (error) {
      res.status(401).json({ error: error.message || "Unauthorized" });
      return;
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      res.status(500).json({ error: "Missing GROQ_API_KEY in Firebase Functions environment." });
      return;
    }

    const inputMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!inputMessages.length) {
      res.status(400).json({ error: "messages is required" });
      return;
    }

    const requestedModel = req.body?.model;
    const model = MODEL_BY_MODE[requestedModel] || requestedModel || MODEL_BY_MODE.Fast;
    const temperature = Number.isFinite(req.body?.temperature) ? req.body.temperature : 0.7;

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`
      },
      body: JSON.stringify({
        model,
        messages: inputMessages,
        temperature,
        stream: true
      })
    });

    if (!groqResponse.ok || !groqResponse.body) {
      const errorText = await groqResponse.text();
      res.status(groqResponse.status || 502).json({ error: errorText || "Groq request failed" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const reader = groqResponse.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const rawData = part
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");

          if (!rawData) continue;
          if (rawData === "[DONE]") {
            streamEvent(res, { done: true });
            res.end();
            return;
          }

          let payload;
          try {
            payload = JSON.parse(rawData);
          } catch {
            continue;
          }

          const token = payload?.choices?.[0]?.delta?.content;
          if (typeof token === "string" && token.length > 0) {
            streamEvent(res, { token });
          }
        }
      }

      streamEvent(res, { done: true });
      res.end();
    } catch (error) {
      streamEvent(res, { error: error.message || "Stream interrupted" });
      res.end();
    }
  }
);
