import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

/**
 * Emscripten cerca `libpg-query.wasm` accanto allo script che lo carica (`scriptDirectory`), che nel
 * worker è la sua URL: `/src/spike/` in dev, `/assets/` nella build. Vite non emette quel binario da
 * solo e `loadModule()` non espone `locateFile`, quindi lo serviamo noi in dev e lo emettiamo in build.
 */
function libpgQueryWasm(): Plugin {
  const file = createRequire(import.meta.url).resolve("libpg-query/wasm/libpg-query.wasm")
  return {
    name: "libpg-query-wasm",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.split("?")[0].endsWith("/libpg-query.wasm")) return next()
        res.setHeader("Content-Type", "application/wasm")
        res.end(readFileSync(file))
      })
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "assets/libpg-query.wasm", source: readFileSync(file) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), libpgQueryWasm()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
