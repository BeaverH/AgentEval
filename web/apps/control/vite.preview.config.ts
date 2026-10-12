import { fileURLToPath, URL } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

if (process.env.TALI_UI_DEMO !== "true") throw new Error("This preview requires TALI_UI_DEMO=true");
export default defineConfig({ cacheDir: ".vite-preview",
  define: { __TALI_UI_DEMO__: "true" },
  server: { host: "127.0.0.1", port: 18085, strictPort: true },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [tailwindcss(), tanstackStart({ spa: { enabled: true } }), react()],
});
