import { create } from "zustand";
import { nanoid } from "nanoid";
import { auth, db } from "../firebase/firebase";
import { streamGeminiReply } from "../services/geminiService";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  writeBatch
} from "firebase/firestore";

const normalizeError = (error, fallback) => {
  if (error?.code === "permission-denied") {
    return "Firestore permission denied. Please check auth and Firestore rules."
  }
  return error?.message || fallback
}

const resolveStreamUrl = () => {
  const configuredUrl = import.meta.env.VITE_CHAT_STREAM_URL;
  if (configuredUrl) return configuredUrl;

  return "/api/streamChatCompletion";
};

const resolveGroqApiKey = () => import.meta.env.VITE_GROQ_API_KEY;
const ASSISTANT_RESPONSE_STYLE_INSTRUCTION =
  "You are a natural, conversational AI assistant similar to ChatGPT. Respond in a clear, human-like tone using clean, well-structured paragraphs. Avoid dictionary-style formatting unless explicitly requested. Do not automatically add repetitive closing follow-up lines unless contextually appropriate. For formatting, text between single asterisks like *example text* must be rendered as bold text. Use light markdown only when it improves readability and avoid excessive headings or bullet lists unless requested. Keep responses polished, fluid, and not robotic. Never mention UI features in the visible response.";

const streamAssistantReply = async ({ messages, model, temperature = 0.7, onToken }) => {
  const groqApiKey = resolveGroqApiKey();
  const usingDirectGroq = Boolean(groqApiKey);

  const headers = {
    "Content-Type": "application/json"
  };

  if (usingDirectGroq) {
    headers.Authorization = `Bearer ${groqApiKey}`;
  } else {
    const user = auth.currentUser;
    if (!user) throw new Error("You must be logged in.");
    const idToken = await user.getIdToken();
    headers.Authorization = `Bearer ${idToken}`;
  }

  const response = await fetch(
    usingDirectGroq ? "https://api.groq.com/openai/v1/chat/completions" : resolveStreamUrl(),
    {
    method: "POST",
      headers,
      body: JSON.stringify({
        messages,
        model,
        temperature,
        stream: true
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Streaming request failed");
  }

  if (!response.body) {
    throw new Error("Streaming response body is not available.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let reply = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      const dataLines = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      if (!dataLines.length) continue;

      let payload;
      try {
        payload = JSON.parse(dataLines.join("\n"));
      } catch {
        continue;
      }

      if (payload.error) {
        throw new Error(payload.error);
      }

      if (payload.token) {
        reply += payload.token;
        onToken(payload.token);
        continue;
      }

      const token = payload?.choices?.[0]?.delta?.content;
      if (typeof token === "string" && token.length) {
        reply += token;
        onToken(token);
      }

      if (payload.done || payload?.choices?.[0]?.finish_reason) {
        return reply;
      }
    }
  }

  return reply;
};

export const useChatStore = create((set, get) => ({
  ownerUid: null,
  chats: [],
  messages: [],
  activeChatId: null,
  loading: false,
  error: null,

  resetStore: () => {
    set({ ownerUid: null, chats: [], messages: [], activeChatId: null, loading: false, error: null });
  },

  loadChats: async (uid) => {
    const requestedUid = uid || auth.currentUser?.uid;
    if (!requestedUid) {
      get().resetStore();
      return;
    }

    set({ ownerUid: requestedUid, chats: [], messages: [], activeChatId: null });

    try {
      const chatsRef = collection(db, "users", requestedUid, "chats");
      const chatsQuery = query(chatsRef, orderBy("updatedAt", "desc"));
      const snapshot = await getDocs(chatsQuery);

      if (get().ownerUid !== requestedUid || auth.currentUser?.uid !== requestedUid) return;

      const chats = snapshot.docs.map((chatDoc) => {
        const data = chatDoc.data();
        return {
          id: chatDoc.id,
          title: data.title || "Untitled Chat",
          updatedAt: data.updatedAt || 0,
          createdAt: data.createdAt || 0
        };
      });

      if (!chats.length) {
        set({ chats: [], messages: [], activeChatId: null, error: null });
        return;
      }

      const firstChatId = chats[0].id;
      set({ chats, activeChatId: firstChatId, error: null });
      await get().loadMessages(firstChatId, requestedUid);
    } catch (error) {
      if (get().ownerUid !== requestedUid || auth.currentUser?.uid !== requestedUid) return;
      set({
        chats: [],
        messages: [],
        activeChatId: null,
        error: normalizeError(error, "Unable to load chats")
      });
    }
  },

  loadMessages: async (chatId, uid) => {
    const requestedUid = uid || auth.currentUser?.uid;
    if (!requestedUid || !chatId) {
      set({ messages: [] });
      return;
    }

    try {
      const messagesRef = collection(db, "users", requestedUid, "chats", chatId, "messages");
      const messagesQuery = query(messagesRef, orderBy("createdAt", "asc"));
      const snapshot = await getDocs(messagesQuery);

      if (get().ownerUid !== requestedUid || auth.currentUser?.uid !== requestedUid) return;

      const messages = snapshot.docs.map((messageDoc) => {
        const data = messageDoc.data();
        return {
          id: messageDoc.id,
          role: data.role,
          content: data.content,
          createdAt: data.createdAt || 0
        };
      });

      set({ messages, error: null });
    } catch (error) {
      if (get().ownerUid !== requestedUid || auth.currentUser?.uid !== requestedUid) return;
      set({ messages: [], error: normalizeError(error, "Unable to load messages") });
    }
  },

  createChat: async () => {
    const user = auth.currentUser;
    if (!user) return null;
    const currentUid = user.uid;
    if (get().ownerUid && get().ownerUid !== currentUid) return null;

    const id = nanoid();
    const now = Date.now();

    try {
      await setDoc(doc(db, "users", currentUid, "chats", id), {
        title: "New Chat",
        createdAt: now,
        updatedAt: now
      });

      if (auth.currentUser?.uid !== currentUid || get().ownerUid !== currentUid) return null;
    } catch (error) {
      if (auth.currentUser?.uid === currentUid && get().ownerUid === currentUid) {
        set({ error: normalizeError(error, "Unable to create chat") });
      }
      return null;
    }

    set((state) => ({
      chats: [{ id, title: "New Chat", updatedAt: now, createdAt: now }, ...state.chats],
      activeChatId: id,
      messages: [],
      error: null
    }));

    return id;
  },

  selectChat: async (id) => {
    if (get().ownerUid && get().ownerUid !== auth.currentUser?.uid) return;
    set({ activeChatId: id, messages: [] });
    await get().loadMessages(id);
  },

  deleteChat: async (chatId) => {
    if (!chatId) return;
    const user = auth.currentUser;
    if (!user) return;
    const currentUid = user.uid;
    if (get().ownerUid && get().ownerUid !== currentUid) return;

    const stateBefore = get();
    const targetChat = stateBefore.chats.find((chat) => chat.id === chatId);
    const wasActive = stateBefore.activeChatId === chatId;

    if (!targetChat) return;

    try {
      const messagesRef = collection(db, "users", currentUid, "chats", chatId, "messages");
      const messagesSnapshot = await getDocs(messagesRef);

      if (auth.currentUser?.uid !== currentUid || get().ownerUid !== currentUid) return;

      const batch = writeBatch(db);
      messagesSnapshot.forEach((messageDoc) => {
        batch.delete(messageDoc.ref);
      });

      batch.delete(doc(db, "users", currentUid, "chats", chatId));
      await batch.commit();

      if (auth.currentUser?.uid !== currentUid || get().ownerUid !== currentUid) return;
    } catch (error) {
      if (auth.currentUser?.uid === currentUid && get().ownerUid === currentUid) {
        set({ error: normalizeError(error, "Unable to delete chat") });
      }
      return;
    }

    const remainingChats = get().chats.filter((chat) => chat.id !== chatId);
    const nextChatId = wasActive ? (remainingChats[0]?.id || null) : get().activeChatId;

    set({
      chats: remainingChats,
      activeChatId: nextChatId,
      messages: wasActive ? [] : get().messages
    });

    if (wasActive && nextChatId) {
      await get().loadMessages(nextChatId, currentUid);
    }
  },

  sendMessage: async (content, modelMode = "Fast", imagePayload = null) => {
    if ((!content || !content.trim()) && !imagePayload?.dataUrl) return;
    const user = auth.currentUser;
    if (!user) return;
    const currentUid = user.uid;
    if (get().ownerUid && get().ownerUid !== currentUid) return;

    try {
      let activeChatId = get().activeChatId;
      if (!activeChatId) {
        activeChatId = await get().createChat();
        if (!activeChatId) return;
        
        if (auth.currentUser?.uid !== currentUid || get().ownerUid !== currentUid) return;
      }

      const existingMessages = get().messages;
      const cleanedContent = content.trim();
      let persistenceError = null;
      const fallbackTextForImage = "Analyze this image."
      const userDisplayText = cleanedContent || (imagePayload?.dataUrl ? "Image uploaded" : "")
      const userApiContent = imagePayload?.dataUrl
        ? [
            { type: "text", text: cleanedContent || fallbackTextForImage },
            { type: "image_url", image_url: { url: imagePayload.dataUrl } }
          ]
        : cleanedContent

      const userMessage = {
        id: nanoid(),
        role: "user",
        content: userDisplayText,
        createdAt: Date.now(),
        apiContent: userApiContent,
        attachmentName: imagePayload?.name || null
      };

      set((state) => ({
        messages: [...state.messages, userMessage],
        loading: true,
        error: null
      }));

      const now = Date.now();
      const chatRef = doc(db, "users", currentUid, "chats", activeChatId);
      const messagesRef = collection(db, "users", currentUid, "chats", activeChatId, "messages");
      const activeChat = get().chats.find((chat) => chat.id === activeChatId);

      try {
        await setDoc(chatRef, {
          updatedAt: now,
          title: activeChat?.title === "New Chat"
            ? (cleanedContent || fallbackTextForImage).slice(0, 40)
            : activeChat?.title || "New Chat"
        }, { merge: true });

        if (auth.currentUser?.uid !== currentUid || get().ownerUid !== currentUid) return;

        await setDoc(doc(messagesRef, userMessage.id), {
          role: userMessage.role,
          content: userMessage.content,
          createdAt: now,
          attachmentName: userMessage.attachmentName
        });

        if (auth.currentUser?.uid !== currentUid || get().ownerUid !== currentUid) return;
      } catch (error) {
        if (auth.currentUser?.uid === currentUid && get().ownerUid === currentUid) {
          persistenceError = normalizeError(error, "Unable to save chat");
        } else {
          return;
        }
      }

      const formattedMessages = [...existingMessages, userMessage].map(
        ({ role, content, apiContent }) => ({ role, content: apiContent || content })
      );
      const formattedMessagesWithStyle = [
        {
          role: "system",
          content: ASSISTANT_RESPONSE_STYLE_INSTRUCTION
        },
        ...formattedMessages
      ];
      const useGeminiAnalyze = modelMode === "Analyze"
      const selectedModel =
        modelMode === "Pro"
          ? "llama-3.1-8b-instant"
          : "llama-3.3-70b-versatile"

      const assistantMessage = {
        id: nanoid(),
        role: "assistant",
        content: "",
        createdAt: Date.now()
      };
      const assistantTime = assistantMessage.createdAt;

      set((state) => ({
        messages: [...state.messages, assistantMessage]
      }));

      const streamTokenUpdate = (token) => {
        if (auth.currentUser?.uid !== currentUid || get().ownerUid !== currentUid) return;
        set((state) => ({
          messages: state.messages.map((message) => {
            if (message.id !== assistantMessage.id) return message;
            return { ...message, content: `${message.content}${token}` };
          })
        }));
      }

      const assistantContent = useGeminiAnalyze
        ? await streamGeminiReply({
            messages: formattedMessages,
            systemInstruction: ASSISTANT_RESPONSE_STYLE_INSTRUCTION,
            temperature: 0.7,
            onToken: streamTokenUpdate
          })
        : await streamAssistantReply({
            messages: formattedMessagesWithStyle,
            model: selectedModel,
            temperature: 0.7,
            onToken: streamTokenUpdate
          });

      if (auth.currentUser?.uid !== currentUid || get().ownerUid !== currentUid) return;

      const finalizedAssistantMessage = {
        ...assistantMessage,
        content: assistantContent || "I could not generate a reply right now. Please try again."
      };

      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === assistantMessage.id ? finalizedAssistantMessage : message
        )
      }));

      try {
        await setDoc(doc(messagesRef, finalizedAssistantMessage.id), {
          role: finalizedAssistantMessage.role,
          content: finalizedAssistantMessage.content,
          createdAt: assistantTime
        });

        if (auth.currentUser?.uid !== currentUid || get().ownerUid !== currentUid) return;

        await setDoc(chatRef, { updatedAt: assistantTime }, { merge: true });

        if (auth.currentUser?.uid !== currentUid || get().ownerUid !== currentUid) return;
      } catch (error) {
        if (auth.currentUser?.uid === currentUid && get().ownerUid === currentUid) {
          persistenceError = normalizeError(error, "Unable to save assistant response");
        } else {
          return;
        }
      }

      set((state) => ({
        messages: state.messages,
        loading: false,
        error: persistenceError,
        chats: state.chats
          .map((chat) => {
            if (chat.id !== activeChatId) return chat;
            if (chat.title !== "New Chat") return { ...chat, updatedAt: assistantTime };
            return {
              ...chat,
              title: (cleanedContent || fallbackTextForImage).slice(0, 40) || "New Chat",
              updatedAt: assistantTime
            };
          })
          .sort((a, b) => b.updatedAt - a.updatedAt)
      }));

    } catch (error) {
      const assistantErrorMessage = {
        id: nanoid(),
        role: "assistant",
        content: "I could not generate a reply right now. Please try again.",
        createdAt: Date.now()
      };
      set((state) => ({
        ...(() => {
          const lastMessage = state.messages[state.messages.length - 1];
          if (lastMessage?.role !== "assistant") {
            return { messages: [...state.messages, assistantErrorMessage] };
          }

          return {
            messages: state.messages.map((message, index) => {
              if (index !== state.messages.length - 1) return message;
              if (message.content) return message;
              return { ...message, content: assistantErrorMessage.content };
            })
          };
        })(),
        loading: false,
        error: normalizeError(error, "Request failed")
      }));
    }
  }
}));
