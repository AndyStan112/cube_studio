import { env } from "node:process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
// Installed apps detect icon changes from their URLs, independently of the favicon.
// Keep the manifest URL and app ID stable, and only change this content-derived revision.
const iconFiles = ["cube.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "maskable-512.png"];
const iconHash = createHash("sha256");
for (const file of iconFiles) iconHash.update(readFileSync(new URL(`./public/icons/${file}`, import.meta.url)));
const iconRevision = iconHash.digest("hex").slice(0, 16);
const iconUrl = (file: string) => `/icons/${file}?v=${iconRevision}`;

export default defineConfig({
  plugins: [
    react(),
    {
      name: "version-install-icons",
      transformIndexHtml: {
        order: "pre",
        handler: (html) => html
          .replace('href="/icons/cube.svg"', `href="${iconUrl("cube.svg")}"`)
          .replace('href="/icons/apple-touch-icon.png"', `href="${iconUrl("apple-touch-icon.png")}"`),
      },
    },
    VitePWA({
      registerType: "prompt",
      includeAssets: ["solver-licenses.txt"],
      manifest: {
        id: "/",
        name: "Cube Studio",
        short_name: "Cube Studio",
        description: "Speedcube timer and algorithm trainer.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#130E2A",
        theme_color: "#130E2A",
        icons: [
          {
            src: iconUrl("icon-192.png"),
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: iconUrl("icon-512.png"),
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: iconUrl("maskable-512.png"),
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        // Cache the exact URLs referenced by HTML and the install manifest.
        globIgnores: ["**/icons/**"],
        additionalManifestEntries: iconFiles.map(file => ({ url: iconUrl(file), revision: null })),
        // Includes the bundled offline solver worker; tables are built locally.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname === "/api/algorithm-catalog",
            handler: "NetworkFirst",
            options: {
              cacheName: "cube-algorithm-catalog-v2",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 1 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": { target: env.API_PROXY_TARGET || "http://127.0.0.1:8000" },
    },
  },
});
