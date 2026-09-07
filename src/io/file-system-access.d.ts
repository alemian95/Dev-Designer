// Tipi della File System Access API che lib.dom di TypeScript 6 non dichiara: picker e permessi.
// `FileSystemFileHandle`, `createWritable`, `LockManager` e `BroadcastChannel` ci sono già.

interface FilePickerAcceptType {
  description?: string
  accept: Record<string, string[]>
}

interface FilePickerOptions {
  types?: FilePickerAcceptType[]
  excludeAcceptAllOption?: boolean
  id?: string
}

interface OpenFilePickerOptions extends FilePickerOptions {
  multiple?: boolean
}

interface SaveFilePickerOptions extends FilePickerOptions {
  suggestedName?: string
}

interface Window {
  /** Opzionale: assente dove l'API non esiste. Il rilevamento è `typeof window.showOpenFilePicker === "function"`. */
  showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
  showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>
}

interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite"
}

interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  /** Richiede un gesto dell'utente: chiamarla fuori da un click lancia SecurityError. */
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}
