import { useState } from "react"
import { SpikeCanvas } from "./spike/SpikeCanvas"

type PgResult = { ms: number; stmts: number } | { error: string }

function PgImport() {
  const [log, setLog] = useState("")
  const run = async (file: File) => {
    const sql = await file.text()
    const created = performance.now()
    const worker = new Worker(new URL("./spike/pgWorker.ts", import.meta.url), { type: "module" })
    worker.onmessage = (ev: MessageEvent<PgResult>) => {
      const total = Math.round(performance.now() - created)
      setLog(`${file.name}: ${JSON.stringify(ev.data)} · totale con caricamento WASM ${total} ms`)
      worker.terminate()
    }
    worker.postMessage(sql)
  }
  return (
    <label className="ml-auto">
      pg_dump
      <input type="file" accept=".sql" className="ml-1" onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
      <span className="ml-2 text-muted-foreground">{log}</span>
    </label>
  )
}

export default function App() {
  return <SpikeCanvas toolbar={<PgImport />} />
}
