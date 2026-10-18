/**
 * Testi `stateDiagram`/`stateDiagram-v2` che Mermaid accetta: li leggono i test del parser e la suite
 * oracolo (spec §8). Chi aggiunge un caso valido lo aggiunge qui, così l'oracolo lo vede. Niente `;`
 * nelle etichette: lì il nostro risultato diverge di proposito da quello di Mermaid.
 */
export const STATE_VALID: Readonly<Record<string, string>> = {
  basic: `stateDiagram-v2
  [*] --> Bozza
  Bozza --> Revisione : invia
  Revisione --> Bozza : rifiuta
  Revisione --> Pubblicato : approva
  Pubblicato --> [*]
`,
  oneLine: `stateDiagram-v2 A --> B C --> D`,
  comments: `%%{init: {'theme': 'dark'}}%%
stateDiagram
  %% commento a riga intera
  A --> B %% coda
  # anche questo
  B%%x --> C
  C --> D : resta %% testo
`,
  ids: `stateDiagram-v2
  a.b --> Città
  Città --> B;
  x_1 --> é
`,
  labels: `stateDiagram-v2
  A --> B : a # b
  B --> C : uno:due
  C --> D : #quot;citato#quot;<br>a capo
  A : prima
  A : seconda
  state "Nome lungo" as L
  state "Altro" as M : descrizione
`,
  kinds: `stateDiagram-v2
  state f <<fork>>
  state j [[join]]
  state c <<choice>>
  [*] --> f
  f --> A
  f --> B
  A --> j
  B --> j
  j --> c
  c --> [*]
`,
  styled: `---
title: Stili
---
stateDiagram-v2
  direction LR
  hide empty description
  scale 350 width
  A:::rosso --> B
  classDef rosso fill:#f00,color:white
  class B rosso
  style A fill:#0f0
  click A "https://example.com" "tip"
  accTitle: Titolo
  accDescr: Descrizione
  accDescr {
    lunga
  }
`,
  composite: `stateDiagram-v2
  [*] --> Attivo
  state "In lavorazione" as Attivo {
    [*] --> Bozza
    Bozza --> Revisione
    Revisione --> [*]
  }
  Attivo --> [*]
`,
  nested: `stateDiagram-v2
  state Ufficio {
    A --> B
    state Reparto {
      C --> D
      state Squadra { E --> F }
    }
  }
`,
  regions: `stateDiagram-v2
  state Attivo {
    [*] --> Lettura
    Lettura --> Scrittura
    --
    Rete --> Disco
    state Cache {
      Calda --> Fredda
    }
  }
`,
  compositeEdges: `stateDiagram-v2
  A --> C
  state C {
    [*] --> X
    X --> [*]
  }
  C --> B
  B --> D
  state D {
    Y
  }
`,
  crossReference: `stateDiagram-v2
  A --> X
  state P {
    X --> Y
  }
  Y --> Z
`,
}
