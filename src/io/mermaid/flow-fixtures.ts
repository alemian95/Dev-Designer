/**
 * Testi `flowchart`/`graph` che Mermaid accetta: li leggono i test del parser e la suite oracolo, che
 * controlla che `mermaid.parse()` li accetti davvero e che il suo db abbia gli stessi nodi, archi e
 * subgraph del nostro AST (spec §8). Chi aggiunge un caso valido lo aggiunge qui, così l'oracolo lo vede.
 */
export const FLOW_VALID: Readonly<Record<string, string>> = {
  basic: `flowchart LR
  A[Inizio] --> B{Va bene?}
  B -->|sì| C([Fine])
  B -- no --> D[[Rifai]]
  D --> A
`,
  shapes: `graph TD
  a1(Arrotondato)
  a2((Cerchio))
  a3(((Doppio)))
  a4[/Dato/]
  a5[\\Dato\\]
  a6[(Database)]
  a7{{Esagono}}
  a8>Bandiera]
  a9[/Trapezio\\]
  a10[\\Rovescio/]
  a11(-Ellisse-)
  a12@{ shape: lean-r, label: "Ingresso" }
  a13@{ shape: cyl }
  a14["Testo #quot;citato#quot;<br>a capo"]
`,
  links: `flowchart LR
  A --> B & C --> D
  E ---> F
  G -.-> H
  I ==> J
  K --- L
  M <--> N
  O --o P
  Q --x R
  S ~~~ T
  U -. tratteggiata .-> V
  W == spessa ==> X
  Y e1@--> Z
  e1@{ animate: true }
`,
  subgraphs: `flowchart LR
  inizio --> a
  subgraph p1 [Ufficio]
    a --> b
    subgraph c1 [Contabilità]
      c
    end
    subgraph c2
      d --> e
      subgraph troppo
        f
      end
    end
  end
  subgraph Pool con spazi
    g
  end
  subgraph vuoto
  end
  b --> c1
`,
  styled: `flowchart LR
  A:::rosso --> B
  classDef rosso fill:#f00
  class B rosso
  style A fill:#0f0
  linkStyle 0 stroke:#00f
  click A "https://example.com"
  accTitle: Titolo
  accDescr: Descrizione
`,
  ampersand: `flowchart LR
  A&B --> C
  D & E --> F
`,
  repeatedSubgraph: `flowchart LR
  A --> B
  subgraph s
    A
  end
  subgraph s
    B
  end
`,
  selfNested: `flowchart LR
  subgraph A
    subgraph A
      x
    end
  end
`,
  cycleNested: `flowchart LR
  subgraph A
    subgraph B
      subgraph A
        x
      end
    end
  end
`,
  text: `flowchart LR
  A["\`**grassetto**\`"] --> B["fa:fa-car Auto"]
  B -->|"a | b"| C["x; y"]; C --> D
`,
}
