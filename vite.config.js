import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // vite.config.js
    proxy: {
      "/api": {
        target: "https://us-central1-chatbot-15779.cloudfunctions.net",
        changeOrigin: true,
        secure: true,
        // Try removing the rewrite if the function name is 'api'
        // Or keep it if you are calling /api/streamChatCompletion
        // and the function itself is named streamChatCompletion
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
