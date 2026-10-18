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
