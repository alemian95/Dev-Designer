import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

/**
 * Emscripten cerca `libpg-query.wasm` accanto allo script che lo carica (`scriptDirectory`), e
 * `loadModule()` non espone `locateFile`: il percorso non si può indicare dal codice applicativo.
 * Quindi in dev lo serviamo noi e in build lo emettiamo. L'emissione resterebbe da fare solo se un
 * modulo importa davvero `libpg-query` (è un megabyte) — ma in questo Vite (build su rolldown)
 * l'hook `resolveId` dei plugin JS non viene mai invocato per gli specifier risolti nativamente:
 * verificato strumentando il plugin, zero chiamate su 2097 moduli trasformati, anche nella build in
 * cui il worker importa davvero la libreria. Senza un segnale affidabile su cui condizionare,
 * l'emissione resta incondizionata: è un costo noto e accettato, non un difetto di questa build.
 */
function libpgQueryWasm(): Plugin {
  const wasmPath = () => createRequire(import.meta.url).resolve("libpg-query/wasm/libpg-query.wasm")
  let assetsDir = "assets"
  return {
    name: "libpg-query-wasm",
    configResolved(config) {
      assetsDir = config.build.assetsDir
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.split("?")[0].endsWith("/libpg-query.wasm")) return next()
        res.setHeader("Content-Type", "application/wasm")
        res.end(readFileSync(wasmPath()))
      })
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: `${assetsDir}/libpg-query.wasm`, source: readFileSync(wasmPath()) })
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
