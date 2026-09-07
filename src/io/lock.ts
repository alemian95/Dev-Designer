/** Il sottoinsieme di `LockManager` che serve; `navigator.locks` lo soddisfa, e i test iniettano un finto. */
export interface LockRequester {
  request(name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<unknown>): Promise<unknown>
}

export interface LockDeps {
  locks: LockRequester
  openChannel: () => BroadcastChannel
}

export interface Ownership {
  readonly docId: string
  /** Rilascio volontario (cambio documento). */
  release: () => void
  /** Si risolve quando il lock non è più nostro: rilascio volontario o cessione. */
  lost: Promise<void>
}

interface LockMessage {
  type: "request"
  docId: string
}

export const CEDE_TIMEOUT_MS = 5000
const CHANNEL = "dev-designer-lock"
const lockName = (docId: string) => `doc:${docId}`

/** Senza Web Locks (browser molto vecchi) si concede sempre: non c'è protezione, ma l'app funziona. */
const alwaysGrant: LockRequester = {
  request: (name, _options, callback) => callback({ name, mode: "exclusive" }),
}

export const defaultLockDeps = (): LockDeps => ({
  locks: "locks" in navigator ? navigator.locks : alwaysGrant,
  openChannel: () => new BroadcastChannel(CHANNEL),
})

/**
 * Tiene il lock del documento finché non si rilascia o non arriva una richiesta di cessione dal canale.
 * Alla richiesta esegue `onCede` (l'ultimo autosave) e poi rilascia: l'ordine impedisce alla scheda
 * che prende il controllo di ripartire da un buffer vecchio.
 */
function own(docId: string, onCede: () => Promise<void>, deps: LockDeps, options: LockOptions): Promise<Ownership | null> {
  return new Promise((resolveOwnership) => {
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    let markLost!: () => void
    // `request` risolve solo dopo che il lock è stato rilasciato: `lost` si aggancia a quel momento,
    // non a `held`, così chi attende `lost` trova il lock già libero (per sé o per la richiedente).
    const lost = new Promise<void>((r) => (markLost = r))
    deps.locks
      .request(lockName(docId), options, async (lock) => {
        if (!lock) {
          resolveOwnership(null)
          return
        }
        const channel = deps.openChannel()
        let ceding = false
        const onMessage = (e: MessageEvent<LockMessage>) => {
          if (ceding || e.data.type !== "request" || e.data.docId !== docId) return
          ceding = true
          void onCede().finally(release)
        }
        channel.addEventListener("message", onMessage)
        resolveOwnership({ docId, release, lost })
        await held
        channel.removeEventListener("message", onMessage)
        channel.close()
      })
      // Richiesta abortita (timeout) o rifiutata: nessuna proprietà.
      .catch(() => resolveOwnership(null))
      .finally(markLost)
  })
}

/** Proprietà se il lock è libero, altrimenti null subito. */
export function tryOwn(docId: string, onCede: () => Promise<void>, deps: LockDeps): Promise<Ownership | null> {
  return own(docId, onCede, deps, { ifAvailable: true })
}

/**
 * Chiede alla proprietaria di cedere e attende il lock. null se nessuno risponde entro il timeout:
 * la proprietaria è chiusa a metà o sospesa dal sistema; il lock si libererà da solo alla sua chiusura.
 */
export function takeOver(docId: string, onCede: () => Promise<void>, deps: LockDeps, timeoutMs: number = CEDE_TIMEOUT_MS): Promise<Ownership | null> {
  const channel = deps.openChannel()
  const pending = own(docId, onCede, deps, { signal: AbortSignal.timeout(timeoutMs) })
  channel.postMessage({ type: "request", docId } satisfies LockMessage)
  channel.close()
  return pending
}
