import { describe, expect, it } from "vitest"
import { chooseSavePath, detectCapabilities, FILE_EXTENSION, suggestedFileName } from "./file"

const withPickers = { showOpenFilePicker: async () => [], showSaveFilePicker: async () => ({}) } as unknown as Window
const without = {} as Window

describe("detectCapabilities", () => {
  it("rileva i picker quando entrambi esistono", () => {
    expect(detectCapabilities(withPickers, "")).toEqual({ pickers: true })
  })
  it("non li rileva se ne manca uno", () => {
    expect(detectCapabilities({ showOpenFilePicker: async () => [] } as unknown as Window, "")).toEqual({ pickers: false })
    expect(detectCapabilities(without, "")).toEqual({ pickers: false })
  })
  it("?fallback=1 forza il fallback anche con i picker", () => {
    expect(detectCapabilities(withPickers, "?fallback=1")).toEqual({ pickers: false })
    expect(detectCapabilities(withPickers, "?stress=3&fallback=1")).toEqual({ pickers: false })
    expect(detectCapabilities(withPickers, "?fallback=0")).toEqual({ pickers: true })
  })
})

describe("chooseSavePath", () => {
  it("senza picker è sempre download", () => {
    expect(chooseSavePath({ pickers: false }, true)).toBe("download")
    expect(chooseSavePath({ pickers: false }, false)).toBe("download")
    expect(chooseSavePath({ pickers: false }, true, true)).toBe("download")
  })
  it("con handle scrive sull'handle, salvo 'salva con nome'", () => {
    expect(chooseSavePath({ pickers: true }, true)).toBe("handle")
    expect(chooseSavePath({ pickers: true }, true, true)).toBe("picker")
  })
  it("senza handle apre il picker", () => {
    expect(chooseSavePath({ pickers: true }, false)).toBe("picker")
  })
})

describe("suggestedFileName", () => {
  it("normalizza il nome e aggiunge l'estensione", () => {
    expect(suggestedFileName("Ordini & Clienti")).toBe(`ordini-clienti${FILE_EXTENSION}`)
    expect(suggestedFileName("  Senza titolo ")).toBe(`senza-titolo${FILE_EXTENSION}`)
  })
  it("un nome vuoto o solo simboli diventa 'diagramma'", () => {
    expect(suggestedFileName("")).toBe(`diagramma${FILE_EXTENSION}`)
    expect(suggestedFileName("***")).toBe(`diagramma${FILE_EXTENSION}`)
  })
})
