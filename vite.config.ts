import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Use root path for Lovable deployment, only use /cyprusevstations/ for GitHub Pages
  const base = "/";

  return {
    base,
    server: {
      host: "::",
      port: 8080
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.ico", "robots.txt", "pwa-192x192.png", "pwa-512x512.png"],
        manifest: {
          name: "ChargeCyprus - EV Charging Stations",
          short_name: "ChargeCyprus",
          description:
            "Discover electric vehicle charging stations across Cyprus. Find fast chargers, connector types, and plan your next EV trip.",
          theme_color: "#0ea5e9",
          background_color: "#f8fafc",
          display: "standalone",
          orientation: "portrait",
          scope: base,
          start_url: base,
          icons: [
            {
              src: `${base}pwa-192x192.png`,
              sizes: "192x192",
              type: "image/png"
            },
            {
              src: `${base}pwa-512x512.png`,
              sizes: "512x512",
              type: "image/png"
            },
            {
              src: `${base}pwa-512x512.png`,
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable"
            }
          ]
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"]
        }
      })
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src")
      }
    }
  };
});
