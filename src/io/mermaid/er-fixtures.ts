/**
 * Testi `erDiagram` che Mermaid accetta: li leggono i test del parser e la suite oracolo, che
 * controlla che `mermaid.parse()` li accetti davvero (spec §8). Chi aggiunge un caso valido lo
 * aggiunge qui, così l'oracolo lo vede.
 */
export const ER_VALID: Readonly<Record<string, string>> = {
  basic: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  CUSTOMER {
    string name PK
    int age
  }
`,
  words: `erDiagram
  A only one to zero or more B : "ha"
  C one or more optionally to many(0) D : x
`,
  symbols: `erDiagram
  A |o..o| B : a
  C }|--|{ D : b
  E ||.-o{ F : c
  G 1--0+ H : d
`,
  keysAndComments: `erDiagram
  "pub.utenti" {
    bigint id PK "chiave"
    bigint gruppo_id FK
    varchar(255) email UK
    int a PK, FK
  }
`,
  aliasAndStyle: `---
title: Prova
---
erDiagram
  %% un commento
  direction LR
  p[Persona] {
    string nome
  }
  p ||--o{ q : ""
  style p fill:#f9f
  classDef rosso fill:#f00
`,
  repeated: `erDiagram
  A {
    int id PK
  }
  A {
    string nome
    int id
  }
`,
}
