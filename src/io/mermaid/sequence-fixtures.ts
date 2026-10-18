import type { Participant, Sequence, Step } from "@/model/sequence/schema"

/**
 * Testi `sequenceDiagram` che Mermaid accetta: li leggono i test del parser e la suite oracolo
 * (spec §10). Chi aggiunge un caso valido lo aggiunge qui, così l'oracolo lo vede.
 */
export const SEQUENCE_VALID: Readonly<Record<string, string>> = {
  basic: `sequenceDiagram
  participant A as Alice
  actor B as Bob
  A->>B: Ciao Bob
  B-->>A: Ciao Alice
`,
  oneLine: `sequenceDiagram
  A->>B: uno; B->>A: due; Note over A,B: tre
`,
  comments: `%%{init: {'theme': 'dark'}}%%
sequenceDiagram
  %% commento a riga intera
  % anche questo
  # e questo
  A->>B: issue #12 chiusa
  A->>B: 50% fatto %% coda
`,
  names: `sequenceDiagram
  participant Mario Rossi
  participant x as "Con virgolette"
  Mario Rossi->>a-b: x
  a-b->>città: y
  città-->>Mario Rossi:
`,
  texts: `sequenceDiagram
  A->>B: ora 10:30
  A->>B: #59; e #35; e #quot;citato#quot;<br>a capo
  A->>B: wrap: lungo
`,
  arrows: `sequenceDiagram
  A->B: a
  A-->B: b
  A->>B: c
  A-->>B: d
  A-xB: e
  A--xB: f
  A-)B: g
  A--)B: h
  A<<->>B: i
  A<<-->>B: j
  A-|\\B: k
  A--//B: l
  A/|-B: m
  A\\\\--B: n
`,
  blocks: `sequenceDiagram
  loop Ogni minuto
    A->>B: ping
  end
  alt ok
    B->>A: pong
  else ko
    B-xA: errore
  else
    Note right of B: niente
  end
  opt facoltativo
    A->>B: x
  end
  par uno
    A->>B: y
  and due
    A->>C: z
  end
  critical c
    A->>B: w
  option o
    A->>B: v
  end
  break b
    A->>B: u
  end
`,
  editor: `sequenceDiagram
    autonumber
    actor Redattore
    participant Orchestrator as Redazione Orchestrator
    participant Storage as Database / Knowledge Base
    participant LLM as LLM Engine (Prompting)
    Redattore->>Orchestrator: Richiesta generazione articolo (es. Formato: Newsletter, Topic: Ultimi 3 giorni)
    Orchestrator->>Storage: Query NewsCluster (ImpactScore >= 4, Stato: Unprocessed)
    Storage-->>Orchestrator: Ritorna lista cluster con rispettivi RawItems e fonti
    Orchestrator->>Orchestrator: Compone contesto & prompt con linee guida editoriali e fonti
    Orchestrator->>LLM: Invia prompt (Sintesi, Analisi comparativa, TL#59;DR, Richiesta citazioni)
    LLM-->>Orchestrator: Ritorna testo strutturato (Headline, TL#59;DR, Sezioni, Fonti referenziate)
    Orchestrator->>Orchestrator: Valida link e integra metadati citazioni
    Orchestrator->>Storage: Salva ArticleDraft (Stato: DRAFT)
    Orchestrator-->>Redattore: Presenta bozza formattata in Markdown per revisione
    Redattore->>Orchestrator: Approva / Modifica bozza
    Orchestrator->>Storage: Aggiorna stato in APPROVED
`,
  lost: `---
title: Front-matter
---
sequenceDiagram
  title Il titolo
  autonumber
  box Aqua Gruppo
    participant A
    participant B
  end
  participant D@{ "type": "database", "alias": "Il DB" }
  rect rgb(0, 0, 255)
    A->>+B: attiva
    B-->>-A: disattiva
  end
  activate A
  deactivate A
  create participant C
  A->>C: crea
  destroy C
  C->>A: distrugge
  A->>()D: centrale
  par_over p
    A->>D: x
  end
  link A: Doc @ https://example.com
  accTitle: Titolo
  accDescr {
    lunga
  }
`,
}

const participant = (id: string, name: string, label: string | null = null): Participant => ({ id, name, label, kind: "participant" })
const send = (id: string, from: string, to: string, text: string): Step => ({ kind: "message", id, from, to, text, line: "solid", head: "filled" })

/**
 * Modelli costruiti a mano per il round-trip (spec §8.4, Review Focus 3 e 4): testi che il formato
 * deve scappare, e i due casi che l'export riscrive (nomi non validi, spazi ai bordi).
 */
export const SEQUENCE_MODELS: Readonly<Record<string, Sequence>> = {
  escapes: {
    title: "Titolo; con # e #35; letterale",
    autonumber: true,
    participants: [participant("u", "Utente", "Lei; #1\nsotto"), { id: "s", name: "Server", label: null, kind: "actor" }],
    steps: [
      send("m1", "u", "s", "a; b # c\nd"),
      send("m2", "s", "u", "#59; e #quot; letterali, TL;DR"),
      { kind: "note", id: "n1", placement: "over", participants: ["u", "s"], text: "nota; con # e\na capo" },
      {
        kind: "block", id: "b1", operator: "alt", sections: [
          { id: "c1", condition: "se; #ok", steps: [send("m3", "u", "u", "a sé")] },
          { id: "c2", condition: "", steps: [] },
        ],
      },
    ],
  },
  wrap: {
    title: "",
    autonumber: false,
    participants: [participant("a", "A", "wrap: lei"), participant("b", "B")],
    steps: [
      send("m1", "a", "b", "wrap: non è un comando"),
      send("m2", "a", "b", "nowrap: nemmeno"),
      send("m3", "a", "b", ":wrap: due punti"),
      { kind: "note", id: "n1", placement: "left", participants: ["a"], text: "wrap: anche qui" },
      { kind: "block", id: "b1", operator: "loop", sections: [{ id: "c1", condition: "nowrap: condizione", steps: [] }] },
    ],
  },
  silent: {
    title: "",
    autonumber: false,
    participants: [participant("a", "A"), participant("b", "B", "Mai chiamato"), participant("c", "C")],
    steps: [send("m1", "a", "c", "x")],
  },
  empty: { title: "", autonumber: false, participants: [participant("a", "A"), participant("b", "B")], steps: [] },
}

/** I due casi che l'export riscrive (spec §8.1, §8.4): li leggono a parte il round-trip e l'oracolo. */
export const SEQUENCE_REWRITTEN: Readonly<Record<string, Sequence>> = {
  keywordName: {
    title: "",
    autonumber: false,
    participants: [participant("a", "A"), participant("e", "end"), participant("u", "end-user", "Cliente")],
    steps: [send("m1", "a", "e", "x"), send("m2", "e", "u", "y")],
  },
  edgeSpaces: {
    title: "  titolo  ",
    autonumber: false,
    participants: [participant("a", "A", "  Alice  "), participant("b", "B")],
    steps: [
      send("m1", "a", "b", "  attorno  "),
      send("m2", "a", "b", "  wrap: x"),
      { kind: "note", id: "n1", placement: "right", participants: ["b"], text: " nota " },
      { kind: "block", id: "b1", operator: "opt", sections: [{ id: "c1", condition: "  se  ", steps: [] }] },
    ],
  },
}
