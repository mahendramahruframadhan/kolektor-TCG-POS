import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@kolektapos/qr": path.resolve(__dirname, "../../packages/qr/src/index.ts"),
      "@kolektapos/types": path.resolve(__dirname, "../../packages/types/src/index.ts"),
      "@kolektapos/sync": path.resolve(__dirname, "../../packages/sync/src/index.ts"),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: true,
      },
      includeAssets: ["favicon.png", "hero.webp"],
      manifest: {
        name: "KolektaPOS",
        short_name: "KolektaPOS",
        description: "POS untuk booth TCG Sales",
        theme_color: "#1d4ed8",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/favicon.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
