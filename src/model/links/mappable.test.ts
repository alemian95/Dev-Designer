import { describe, expect, it } from "vitest"
import { unmappableNotice } from "./mappable"

describe("unmappableNotice", () => {
  it("un'interfaccia non si mappa su una tabella", () => {
    expect(unmappableNotice("interface")).toBe("Un'interfaccia non si mappa su una tabella.")
  })

  it("un enum non si mappa su una tabella", () => {
    expect(unmappableNotice("enum")).toBe("Un enum non si mappa su una tabella.")
  })

  it("class e abstract si mappano: null", () => {
    expect(unmappableNotice("class")).toBeNull()
    expect(unmappableNotice("abstract")).toBeNull()
  })
})
