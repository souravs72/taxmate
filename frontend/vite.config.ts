import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Builds into the Frappe app so the bench serves it:
 *   JS/CSS  -> taxmate/public/frontend/   (served at /assets/taxmate/frontend/)
 *   HTML    -> taxmate/www/taxmate.html   (Jinja-rendered, gets csrf_token + site_name)
 *
 * Frappe's static serving refuses .js/.css from www/, which is why the bundle
 * must live under public/. See frappe/website/page_renderers/static_page.py.
 */
const APP = resolve(__dirname, "../taxmate");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-html-to-www",
      closeBundle() {
        const from = resolve(APP, "public/frontend/index.html");
        const to = resolve(APP, "www/taxmate.html");
        try {
          mkdirSync(resolve(APP, "www"), { recursive: true });
          copyFileSync(from, to);
          console.log("\n  → copied index.html to taxmate/www/taxmate.html");
        } catch (e) {
          console.warn("\n  ! could not copy index.html:", (e as Error).message);
        }
      },
    },
  ],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  base: "/assets/taxmate/frontend/",
  build: {
    outDir: resolve(APP, "public/frontend"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    // `npm run dev` proxies to the local bench so the session cookie works.
    proxy: {
      "^/(api|assets|files|private)": {
        target: "http://localhost:8000",
        changeOrigin: false,
      },
    },
  },
});
