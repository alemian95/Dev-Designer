import { describe, expect, it } from "vitest"
import { MermaidSyntaxError } from "./common"
import { SEQUENCE_VALID } from "./sequence-fixtures"
import { parseSequence, type SequenceAstStep } from "./sequence-parse"

const sequence = (body: string) => parseSequence(`sequenceDiagram\n  ${body}\n`)
/** I passi senza gli offset, per confrontarli comodamente. */
const strip = (steps: SequenceAstStep[]): unknown[] =>
  steps.map((s) => {
    if (s.kind === "message") return { from: s.from, to: s.to, text: s.text, arrow: s.arrow }
    if (s.kind === "note") return { note: s.placement, participants: s.participants, text: s.text }
    return { block: s.operator, sections: s.sections.map((x) => ({ condition: x.condition, steps: strip(x.steps) })) }
  })
const steps = (body: string) => strip(sequence(body).ast.steps)
const texts = (body: string) => sequence(body).ast.steps.map((s) => (s.kind === "block" ? s.operator : s.text))
const participants = (body: string) => sequence(body).ast.participants.map(({ name, label, kind }) => ({ name, label, kind }))
const messages = (text: string) => parseSequence(text).warnings.map((w) => w.message)
const syntaxError = (text: string): { message: string; at: number } => {
  try {
    parseSequence(text)
  } catch (e) {
    if (e instanceof MermaidSyntaxError) return { message: e.message, at: e.at }
    throw e
  }
  throw new Error("nessun errore")
}

describe("parseSequence: intestazione", () => {
  it("vuole sequenceDiagram in testa, dopo il front-matter e i commenti", () => {
    expect(parseSequence("---\ntitle: x\n---\n%% c\nsequenceDiagram\n  A->>B: x\n").ast.steps).toHaveLength(1)
    expect(syntaxError("flowchart LR\n  A --> B").message).toBe("Il testo non comincia con sequenceDiagram")
    expect(syntaxError("").message).toBe("Il testo non comincia con sequenceDiagram")
  })
})

describe("parseSequence: separatori, commenti e testo", () => {
  it("separa le istruzioni con ; anche dopo un alias, una nota, un titolo o una condizione", () => {
    expect(texts("A->>B: uno; B->>A: due")).toEqual(["uno", "due"])
    const { ast } = sequence("participant A as Nome; title T; loop ogni; A->>B: x; end; Note over A: n; B->>A: y")
    expect(ast.participants[0]!.label).toBe("Nome")
    expect(ast.title).toBe("T")
    expect(strip(ast.steps)).toEqual([
      { block: "loop", sections: [{ condition: "ogni", steps: [{ from: "A", to: "B", text: "x", arrow: "->>" }] }] },
      { note: "over", participants: ["A"], text: "n" },
      { from: "B", to: "A", text: "y", arrow: "->>" },
    ])
  })

  it("tronca il testo a # e salta il resto della riga come commento", () => {
    expect(texts("A->>B: issue #12 chiusa\n  B->>A: dopo")).toEqual(["issue", "dopo"])
    expect(sequence("title Uno #2").ast.title).toBe("Uno")
    expect(participants("participant A as Nome #1")).toEqual([{ name: "A", label: "Nome", kind: "participant" }])
  })

  it("salta i commenti che cominciano con % o %%, anche %%{init}%%", () => {
    const text = "%%{init: {'theme': 'dark'}}%%\nsequenceDiagram\n  % un commento\n  %% un altro\n  A->>B: x\n"
    expect(parseSequence(text).ast.steps).toHaveLength(1)
    expect(parseSequence(text).warnings).toEqual([])
  })

  it("lascia nel testo :, % e %%", () => {
    expect(texts("A->>B: ora 10:30, 50% fatto %% coda")).toEqual(["ora 10:30, 50% fatto %% coda"])
  })

  it("accetta un testo vuoto e ripulisce gli spazi attorno a frecce, nomi e testo", () => {
    expect(steps("A ->> B :   x  \n  A->>B:")).toEqual([
      { from: "A", to: "B", text: "x", arrow: "->>" },
      { from: "A", to: "B", text: "", arrow: "->>" },
    ])
  })

  it("rifiuta un messaggio senza :", () => {
    const text = "sequenceDiagram\n  A->>B\n"
    expect(syntaxError(text)).toEqual({ message: "Messaggio senza «:»", at: text.indexOf("A->>") })
  })

  it("rifiuta una freccia illeggibile", () => {
    const text = "sequenceDiagram\n  A=>B: x\n"
    expect(syntaxError(text)).toEqual({ message: "Freccia attesa dopo «A=»", at: text.indexOf(">B") })
    expect(syntaxError("sequenceDiagram\n  Alice\n").message).toBe("Freccia attesa dopo «Alice»")
  })

  it("decodifica le entità e <br>, anche #59; e #35; che non spezzano il testo", () => {
    expect(texts("A->>B: a#59; b #35;1 #quot;c#quot;<br>d<br/>e")).toEqual(['a; b #1 "c"\nd\ne'])
    expect(participants("participant A as x#59;y")[0]!.label).toBe("x;y")
  })
})

describe("parseSequence: partecipanti", () => {
  it("ammette nei nomi spazi interni, - e Unicode", () => {
    expect(steps("Mario Rossi->>a-b: x\n  città->>Bob: y")).toEqual([
      { from: "Mario Rossi", to: "a-b", text: "x", arrow: "->>" },
      { from: "città", to: "Bob", text: "y", arrow: "->>" },
    ])
    expect(participants("participant Mario Rossi").map((p) => p.name)).toEqual(["Mario Rossi"])
  })

  it("tiene le virgolette di un alias, come Mermaid", () => {
    expect(participants('participant A as "Bob B"\n  actor C as M as N')).toEqual([
      { name: "A", label: '"Bob B"', kind: "participant" },
      { name: "C", label: "M as N", kind: "actor" },
    ])
  })

  it("alla ridichiarazione vince l'ultima con alias, e la posizione resta la prima", () => {
    expect(participants("participant A as Uno\n  participant B\n  actor A as Due")).toEqual([
      { name: "A", label: "Due", kind: "actor" },
      { name: "B", label: null, kind: "participant" },
    ])
    // Senza alias Mermaid non tocca un partecipante che c'è già.
    expect(participants("participant A as Uno\n  actor A")).toEqual([{ name: "A", label: "Uno", kind: "participant" }])
  })

  it("crea un partecipante non dichiarato dove compare la prima volta, anche in una nota", () => {
    const { ast } = sequence("participant B\n  A->>B: x\n  Note over C,D: n")
    expect(ast.participants.map(({ name, label, kind }) => ({ name, label, kind }))).toEqual([
      { name: "B", label: null, kind: "participant" },
      { name: "A", label: null, kind: "participant" },
      { name: "C", label: null, kind: "participant" },
      { name: "D", label: null, kind: "participant" },
    ])
    expect(ast.participants[1]!.at).toBe(`sequenceDiagram\n  participant B\n  `.length)
  })

  it("rifiuta un nome con < o : in una dichiarazione", () => {
    const text = "sequenceDiagram\n  participant A<B\n"
    expect(syntaxError(text)).toEqual({ message: "Nome di partecipante non valido", at: text.indexOf("A<B") })
    expect(syntaxError("sequenceDiagram\n  participant A: x\n").message).toBe("Nome di partecipante non valido")
  })

  it("legge alias e genere dalla configurazione @{…}, con avviso", () => {
    const text = 'sequenceDiagram\n  participant D@{ "type": "database", "alias": "Il DB" }\n  actor E@{ "type": "actor" } as Ee\n  participant F@{ "alias": "x" } as Effe\n'
    const { ast, warnings } = parseSequence(text)
    expect(ast.participants.map(({ name, label, kind }) => ({ name, label, kind }))).toEqual([
      { name: "D", label: "Il DB", kind: "participant" },
      { name: "E", label: "Ee", kind: "actor" },
      { name: "F", label: "Effe", kind: "participant" },
    ])
    expect(warnings.map((w) => w.message)).toEqual(["Configurazione dei partecipanti (@{…}) scartata, restano nome ed etichetta (righe 2, 3, 4)"])
  })
})

describe("parseSequence: parole chiave", () => {
  it("non distingue maiuscole e minuscole", () => {
    const { ast } = sequence("PARTICIPANT A AS Uno\n  ACTOR B\n  NOTE RIGHT OF A: x\n  LOOP l\n  A->>B: y\n  END\n  Title T\n  AUTONUMBER")
    expect(ast.participants.map(({ name, label, kind }) => ({ name, label, kind }))).toEqual([
      { name: "A", label: "Uno", kind: "participant" },
      { name: "B", label: null, kind: "actor" },
    ])
    expect(strip(ast.steps)).toEqual([
      { note: "right", participants: ["A"], text: "x" },
      { block: "loop", sections: [{ condition: "l", steps: [{ from: "A", to: "B", text: "y", arrow: "->>" }] }] },
    ])
    expect(ast.title).toBe("T")
    expect(ast.autonumber).toBe(true)
  })

  it("legge le note a sinistra, a destra e sopra uno o due partecipanti", () => {
    expect(steps("Note left of A: l\n  note right of B : r\n  Note over A , B: o")).toEqual([
      { note: "left", participants: ["A"], text: "l" },
      { note: "right", participants: ["B"], text: "r" },
      { note: "over", participants: ["A", "B"], text: "o" },
    ])
    expect(syntaxError("sequenceDiagram\n  Note over A\n").message).toBe("Nota senza «:»")
  })
})

describe("parseSequence: frecce", () => {
  const classic = ["->>", "<<->>", "-->>", "<<-->>", "->", "-->", "-x", "--x", "-)", "--)"]
  const half = ["-|\\", "-|/", "-\\\\", "-//", "/|-", "\\|-", "//-", "\\\\-", "--|\\", "--|/", "--\\\\", "--//", "/|--", "\\|--", "//--", "\\\\--"]

  it.each([...classic, ...half])("legge la freccia %s così come è scritta", (arrow) => {
    expect(steps(`A${arrow}B: x`)).toEqual([{ from: "A", to: "B", text: "x", arrow }])
  })

  it("non mangia il trattino di una freccia nel nome", () => {
    expect(steps("a-b-->>c-d: x")).toEqual([{ from: "a-b", to: "c-d", text: "x", arrow: "-->>" }])
  })
})

describe("parseSequence: blocchi", () => {
  it("annida i blocchi e apre le sezioni con else, and, option, anche a condizione vuota", () => {
    expect(steps("alt\n  loop l\n  A->>B: x\n  end\n  else ko\n  par uno\n  and\n  end\n  end\n  critical c\n  option o\n  end\n  break b\n  end\n  opt\n  end")).toEqual([
      {
        block: "alt",
        sections: [
          { condition: "", steps: [{ block: "loop", sections: [{ condition: "l", steps: [{ from: "A", to: "B", text: "x", arrow: "->>" }] }] }] },
          { condition: "ko", steps: [{ block: "par", sections: [{ condition: "uno", steps: [] }, { condition: "", steps: [] }] }] },
        ],
      },
      { block: "critical", sections: [{ condition: "c", steps: [] }, { condition: "o", steps: [] }] },
      { block: "break", sections: [{ condition: "b", steps: [] }] },
      { block: "opt", sections: [{ condition: "", steps: [] }] },
    ])
  })

  it("lascia i passi di un rect dove sta il rect, con avviso", () => {
    const text = "sequenceDiagram\n  alt a\n  rect rgb(0,0,0)\n  A->>B: x\n  end\n  else b\n  end\n"
    const { ast, warnings } = parseSequence(text)
    expect(strip(ast.steps)).toEqual([
      { block: "alt", sections: [{ condition: "a", steps: [{ from: "A", to: "B", text: "x", arrow: "->>" }] }, { condition: "b", steps: [] }] },
    ])
    expect(warnings.map((w) => w.message)).toEqual(["Riquadri colorati (rect) scartati, i passi restano (riga 3)"])
  })

  it("legge par_over come par, con avviso", () => {
    const text = "sequenceDiagram\n  par_over p\n  and q\n  end\n"
    expect(strip(parseSequence(text).ast.steps)).toEqual([{ block: "par", sections: [{ condition: "p", steps: [] }, { condition: "q", steps: [] }] }])
    expect(messages(text)).toEqual(["Blocchi par_over letti come par (riga 2)"])
  })

  it("rifiuta un end mancante, un end in più e una sezione sotto l'operatore sbagliato", () => {
    const missing = "sequenceDiagram\n  alt a\n  loop l\n  end\n"
    expect(syntaxError(missing)).toEqual({ message: "Blocco «alt» senza «end»", at: missing.indexOf("alt") })
    const extra = "sequenceDiagram\n  A->>B: x\n  end\n"
    expect(syntaxError(extra)).toEqual({ message: "«end» senza un blocco aperto", at: extra.indexOf("end\n") })
    const wrong = "sequenceDiagram\n  loop l\n  else x\n  end\n"
    expect(syntaxError(wrong)).toEqual({ message: "«else» fuori da un blocco «alt»", at: wrong.indexOf("else") })
    expect(syntaxError("sequenceDiagram\n  alt a\n  and b\n  end\n").message).toBe("«and» fuori da un blocco «par»")
    expect(syntaxError("sequenceDiagram\n  par a\n  option b\n  end\n").message).toBe("«option» fuori da un blocco «critical»")
    expect(syntaxError("sequenceDiagram\n  alt a\n  loop l\n  else b\n  end\n  end\n").message).toBe("«else» fuori da un blocco «alt»")
  })
})

describe("parseSequence: costrutti persi", () => {
  it("scarta le attivazioni e tiene i messaggi", () => {
    const text = "sequenceDiagram\n  A->>+B: x\n  B-->>-A: y\n  activate A\n  deactivate A\n"
    expect(texts("A->>+B: x\n  B-->>-A: y")).toEqual(["x", "y"])
    expect(messages(text)).toEqual(["Attivazioni scartate (activate, deactivate, +/-), i messaggi restano (righe 2, 3, 4, 5)"])
  })

  it("rifiuta deactivate di un partecipante non attivo", () => {
    const text = "sequenceDiagram\n  A->>+B: x\n  deactivate B\n  deactivate B\n"
    expect(syntaxError(text)).toEqual({ message: "«deactivate» di B, che non è attivo", at: text.lastIndexOf("deactivate") })
    expect(syntaxError("sequenceDiagram\n  A->>-B: x\n").message).toBe("«deactivate» di A, che non è attivo")
  })

  it("scarta create e destroy, e tiene il partecipante", () => {
    const text = "sequenceDiagram\n  A->>B: x\n  create participant C as Ci\n  Note over C: n\n  A->>C: y\n  destroy C\n  C->>A: z\n"
    const { ast, warnings } = parseSequence(text)
    expect(ast.participants.map((p) => [p.name, p.label])).toEqual([["A", null], ["B", null], ["C", "Ci"]])
    expect(warnings.map((w) => w.message)).toEqual(["Creazione e distruzione (create, destroy) scartate, il partecipante c'è per tutta la sequenza (righe 3, 6)"])
  })

  it("rifiuta create se il messaggio dopo non va al partecipante creato", () => {
    const text = "sequenceDiagram\n  create participant C\n  A->>B: x\n"
    expect(syntaxError(text)).toEqual({ message: "Dopo «create C» il messaggio successivo deve andare a C", at: text.indexOf("create") })
    expect(() => parseSequence("sequenceDiagram\n  A->>B: x\n  create participant C\n")).not.toThrow()
  })

  it("scarta i box e tiene i partecipanti, ma rifiuta lo stesso partecipante in due box", () => {
    const ok = "sequenceDiagram\n  participant A\n  box Aqua Gruppo\n  participant A\n  participant B\n  end\n  participant A as Fuori\n"
    const { ast, warnings } = parseSequence(ok)
    expect(ast.participants.map((p) => [p.name, p.label])).toEqual([["A", "Fuori"], ["B", null]])
    expect(warnings.map((w) => w.message)).toEqual(["Gruppi di partecipanti (box) scartati, i partecipanti restano (riga 3)"])
    const twice = "sequenceDiagram\n  box G\n  participant A\n  end\n  box H\n  participant A\n  end\n"
    expect(syntaxError(twice)).toEqual({ message: "A sta già in un altro box", at: twice.lastIndexOf("participant A") })
  })

  it("scarta link, proprietà, dettagli e accessibilità, e tiene il partecipante del link", () => {
    const text = "sequenceDiagram\n  link A: Doc @ https://x.y\n  links A: {\"R\": \"u\"}\n  properties A: {\"k\": \"v\"}\n  details A: id\n  accTitle: T\n  accDescr: D\n  accDescr {\n  riga\n  }\n"
    const { ast, warnings } = parseSequence(text)
    expect(ast.participants.map((p) => p.name)).toEqual(["A"])
    expect(warnings.map((w) => w.message)).toEqual([
      "Link e proprietà dei partecipanti scartati (link, links, properties, details) (righe 2, 3, 4, 5)",
      "Titolo e descrizione di accessibilità scartati (righe 6, 7, 8)",
    ])
    expect(syntaxError("sequenceDiagram\n  accDescr {\n  x\n").message).toBe("«accDescr {» senza «}»")
  })

  it("toglie wrap: e nowrap: dal testo, con avviso", () => {
    const text = "sequenceDiagram\n  A->>B: wrap: uno\n  A->>B:nowrap:due\n  loop wrap: l\n  end\n"
    expect(texts("A->>B: wrap: uno\n  A->>B:nowrap:due")).toEqual(["uno", "due"])
    expect(messages(text)).toEqual(["A capo automatico (wrap:, nowrap:) scartato, il testo resta (righe 2, 3, 4)"])
  })

  it("toglie la connessione centrale () e tiene il messaggio", () => {
    const text = "sequenceDiagram\n  A->>()B: x\n  A()->>B: y\n  A()->>()B: z\n"
    expect(strip(parseSequence(text).ast.steps)).toEqual([
      { from: "A", to: "B", text: "x", arrow: "->>" },
      { from: "A", to: "B", text: "y", arrow: "->>" },
      { from: "A", to: "B", text: "z", arrow: "->>" },
    ])
    expect(messages(text)).toEqual(["Connessioni centrali (()) scartate, i messaggi restano (righe 2, 3, 4)"])
  })

  it("vale il primo autonumber; inizio, passo e off danno un avviso", () => {
    expect(parseSequence("sequenceDiagram\n  A->>B: x\n").ast.autonumber).toBe(false)
    expect(parseSequence("sequenceDiagram\n  autonumber\n  A->>B: x\n").warnings).toEqual([])
    const text = "sequenceDiagram\n  autonumber 10 5\n  A->>B: x\n  autonumber off\n"
    expect(parseSequence(text).ast.autonumber).toBe(true)
    expect(messages(text)).toEqual(["Numerazione semplificata (autonumber con inizio, passo o off): si numera da 1 a passo 1 (righe 2, 4)"])
    expect(parseSequence("sequenceDiagram\n  autonumber off\n  autonumber\n").ast.autonumber).toBe(false)
  })
})

describe("parseSequence: fixture valide", () => {
  it.each(Object.entries(SEQUENCE_VALID))("analizza %s senza errori", (_, text) => {
    expect(() => parseSequence(text)).not.toThrow()
  })
})

describe("parseSequence: linearità", () => {
  it("resta lineare su un testo grande", () => {
    const lines = ["sequenceDiagram", "  loop Ogni passo"]
    for (let i = 0; i < 5000; i++) lines.push(`    Utente ${i % 50}->>Servizio ${(i + 1) % 50}: Passo ${i}#59; con #35; e testo`)
    lines.push("  end")
    const started = performance.now()
    const { ast } = parseSequence(lines.join("\n"))
    expect(ast.steps[0]).toMatchObject({ kind: "block" })
    expect(ast.steps[0]!.kind === "block" && ast.steps[0]!.sections[0]!.steps).toHaveLength(5000)
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
