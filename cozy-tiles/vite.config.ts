import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  // Vitest runs with mode "test": skip the service worker plugin entirely and
  // alias its virtual register module to a controllable test double, so tests
  // never depend on a generated worker.
  const testing = mode === "test";

  return {
    test: {
      // Rules, levels, and persistence run in Node. Component tests opt into
      // jsdom with a `@vitest-environment jsdom` docblock.
      environment: "node",
      setupFiles: ["src/test/setup.ts"],
    },

    resolve: testing
      ? {
          alias: {
            "virtual:pwa-register/react": fileURLToPath(
              new URL("src/test/pwaRegisterStub.ts", import.meta.url),
            ),
          },
        }
      : undefined,

    plugins: [
      react(),
      ...(testing
        ? []
        : [
            VitePWA({
              registerType: "prompt",
              injectRegister: "auto",

              includeAssets: ["icon.svg"],

              manifest: {
                name: "Cozy Tiles",
                short_name: "Cozy Tiles",
                description: "A calm, ad-free tile matching game.",
                start_url: "/",
                scope: "/",
                display: "standalone",
                orientation: "portrait",
                background_color: "#292944",
                theme_color: "#444473",

                icons: [
                  {
                    src: "/icon-192.png",
                    sizes: "192x192",
                    type: "image/png",
                  },
                  {
                    src: "/icon-512.png",
                    sizes: "512x512",
                    type: "image/png",
                  },
                ],
              },

              workbox: {
                globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
                navigateFallback: "/index.html",
                // Drop precaches left behind by an older build so a reload can
                // never serve a mix of old and new assets.
                cleanupOutdatedCaches: true,
              },
            }),
          ]),
    ],
  };
});
