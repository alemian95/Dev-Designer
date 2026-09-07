import { documentIo, fileCapabilities } from "@/io/app-io"

export const UPLOAD_INPUT_ID = "upload-input"

/** Apri: picker dove c'è, altrimenti l'input file nascosto del menu. Usato dal menu e da ⌘O. */
export function requestOpen(): void {
  if (fileCapabilities.pickers) void documentIo.openWithPicker()
  else document.getElementById(UPLOAD_INPUT_ID)?.click()
}
