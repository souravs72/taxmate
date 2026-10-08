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

/**
 * `npm run build:mobile` (vite --mode mobile) builds the Capacitor bundle
 * instead: assets from the root "/", output in frontend/dist-mobile (capacitor
 * webDir), no copy into www/, and the Jinja boot script stripped from
 * index.html (there is no server render inside the app).
 * `__TAXMATE_MOBILE__` is false in the web build, so every native branch
 * (src/mobile/platform.ts isNative()) is dead code there.
 */
export default defineConfig(({ mode }) => {
  const mobile = mode === "mobile";
  return {
  plugins: [
    react(),
    mobile ? {
      name: "strip-jinja-boot",
      transformIndexHtml(html: string) {
        return html.replace(/\s*<!--[\s\S]*?-->\s*<script>[\s\S]*?window\.csrf_token[\s\S]*?<\/script>/, "\n");
      },
    } : {
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
  define: { __TAXMATE_MOBILE__: JSON.stringify(mobile) },
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  // Capacitor serves dist-mobile from the root (https://localhost/, capacitor://localhost/),
  // so absolute "/" keeps assets loading after a reload on a deep route like /orders/123.
  base: mobile ? "/" : "/assets/taxmate/frontend/",
  build: mobile ? {
    outDir: resolve(__dirname, "dist-mobile"),
    emptyOutDir: true,
    sourcemap: false,
  } : {
    outDir: resolve(APP, "public/frontend"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    // `npm run dev` proxies to the local bench so the session cookie works.
    proxy: {
      "^/(api|assets|files|private|login)": {
        target: "http://localhost:8001",
        changeOrigin: false,
      },
    },
  },
  };
});
