import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

/**
 * Emscripten cerca `libpg-query.wasm` accanto allo script che lo carica (`scriptDirectory`), e
 * `loadModule()` non espone `locateFile`: il percorso non si può indicare dal codice applicativo.
 * Quindi in dev lo serviamo noi e in build lo emettiamo, ma solo se il binario (~1,1 MB) è davvero
 * raggiungibile: oggi lo è solo dal worker che fa il parsing SQL (`src/io/ddl/parse.worker.ts`), mai
 * dal bundle principale.
 *
 * L'hook `resolveId` dei plugin non basta a rilevarlo: sotto Vite 8 (motore rolldown) non viene mai
 * invocato per gli specifier risolti nativamente — verificato strumentando il plugin. Il segnale
 * affidabile è `transform`, filtrato sull'id: rolldown lo chiama comunque per ogni modulo che passa dal
 * container dei plugin, `libpg-query` incluso. Vite compila i worker in una build a parte, con la
 * propria lista di plugin (`worker.plugins`): ogni istanza vede quindi solo i moduli della propria
 * build, e ciascuna emette il binario nella propria `generateBundle` solo se l'ha visto passare.
 * Verificato che l'asset emesso dall'istanza del worker atterra comunque nel `dist/` finale, sotto
 * `assetsDir`: non serve condividere lo stato fra le due istanze.
 */
function libpgQueryWasm(): Plugin {
  const wasmPath = () => createRequire(import.meta.url).resolve("libpg-query/wasm/libpg-query.wasm")
  let assetsDir = "assets"
  let used = false
  return {
    name: "libpg-query-wasm",
    configResolved(config) {
      assetsDir = config.build.assetsDir
    },
    transform: {
      filter: { id: /libpg-query/ },
      handler() {
        used = true
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.split("?")[0].endsWith("/libpg-query.wasm")) return next()
        res.setHeader("Content-Type", "application/wasm")
        res.end(readFileSync(wasmPath()))
      })
    },
    generateBundle() {
      if (!used) return
      this.emitFile({ type: "asset", fileName: `${assetsDir}/libpg-query.wasm`, source: readFileSync(wasmPath()) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), libpgQueryWasm()],
  worker: {
    plugins: () => [libpgQueryWasm()],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
