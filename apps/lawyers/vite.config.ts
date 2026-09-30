import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import net from "node:net";
import process from "node:process";

const DEV_PORT = 3009;

const devServerRunning = () =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect({ port: DEV_PORT, host: "127.0.0.1" });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
  });

const host = process.env.TAURI_DEV_HOST;
export default defineConfig(({ command }) => ({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    // A build writes one module per message into src/paraglide, the same folder
    // the dev server watches. Under a running dev server that can send the
    // desktop window thousands of modules at once (see apps/prisons' vite.config
    // for the incident this guards against). Listed first so it stops before
    // the messages are compiled.
    {
      name: "refuse-build-under-dev-server",
      apply: "build",
      async config() {
        if (await devServerRunning()) {
          throw new Error(`The dev server is running on port ${DEV_PORT}. Building now would rewrite src/paraglide under it and overload the app window. Stop it first.`);
        }
      },
    },
    // Compiles messages/*.json to typed functions in src/paraglide. The locale
    // comes from this machine's own localStorage, never from the URL.
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      strategy: ["localStorage", "baseLocale"],
      outputStructure: command === "serve" ? "locale-modules" : "message-modules",
    }),
    tailwindcss(),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react()
  ],
  clearScreen: false,
  server: {
    port: DEV_PORT,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 3010,
      }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"]
    }
  }
}))
