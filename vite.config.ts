import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { glassStudioServer } from './scripts/glass-studio-server';
import { scrollbarOverflowPatch } from './scripts/scrollbar-overflow-patch';

export default defineConfig({
  plugins: [react(), glassStudioServer(), scrollbarOverflowPatch()],
  resolve: { alias: { "liquid-gl": fileURLToPath(new URL("./vendor/liquid-gl/liquidGL.js", import.meta.url)) } },
  // Keep the local upstream patch live instead of serving a stale prebundled copy.
  optimizeDeps: { exclude: ["liquid-glass-react", "liquid-gl", "overlayscrollbars"] },
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
