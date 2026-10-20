import { env } from "node:process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/*.png", "icons/cube.svg", "solver-licenses.txt"],
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
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        clientsClaim: true,
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
