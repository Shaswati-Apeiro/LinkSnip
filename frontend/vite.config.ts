import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// API base is http://127.0.0.1:8000 (see src/api.ts). No /api proxy on purpose:
// the backend builds short_url from the request host, so calls must hit :8000 directly.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
