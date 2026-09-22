import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;
export default defineConfig(() => ({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react()
  ],
  clearScreen: false,
  server: {
    port: 3007,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 3008,
      }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"]
    }
  }
}))
