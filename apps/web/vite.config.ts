import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@shapes/game-engine": fileURLToPath(new URL("../../packages/game-engine/src/index.ts", import.meta.url))
    }
  }
});
