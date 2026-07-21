import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Habilita source maps en el build de produccion para poder diagnosticar
  // errores reportados por usuarios reales (stack traces con nombres reales
  // de componentes/archivos en vez de identificadores minificados).
  build: {
    sourcemap: true,
  },
})