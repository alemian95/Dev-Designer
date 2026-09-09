import { startAutosave } from "./autosave"
import { createDocumentDb } from "./db"
import { createDocumentIo } from "./document-io"
import { detectCapabilities, download, ensureWritePermission, pickOpen, pickSave, writeHandle } from "./file"
import { createLayoutEngine } from "./layout/client"
import { spawnLayoutWorker } from "./layout/spawn"
import { defaultLockDeps } from "./lock"

/** Le istanze reali. È l'unico modulo di `io` che decide "con cosa" invece di "come". */
export const documentDb = createDocumentDb()
export const fileCapabilities = detectCapabilities()
export const autosave = startAutosave({ db: documentDb })
export const documentIo = createDocumentIo({
  db: documentDb,
  files: { pickOpen, pickSave, ensureWritePermission, writeHandle, download },
  caps: fileCapabilities,
  autosave,
  lock: defaultLockDeps(),
  confirm: (m) => window.confirm(m),
})
/** Il worker nasce al primo layout, non all'avvio: elkjs pesa 465 kB gzip. */
export const layoutEngine = createLayoutEngine(spawnLayoutWorker)
