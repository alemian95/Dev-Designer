/**
 * Testi `classDiagram` che Mermaid accetta: li leggono i test del parser e la suite oracolo, che
 * controlla che `mermaid.parse()` li accetti davvero (spec §8). Chi aggiunge un caso valido lo
 * aggiunge qui, così l'oracolo lo vede.
 */
export const CLASS_VALID: Readonly<Record<string, string>> = {
  basic: `classDiagram
  Animal <|-- Duck
  Animal : +int age
  Animal : +isMammal() bool
  class Duck {
    +String beakColor
    +swim()
  }
`,
  relations: `classDiagram
  A <|-- B
  C ..|> D
  E *-- F
  G --o H
  I --> J
  K ..> L
  M -- N
  O .. P
  Q <|--|> R
  S ()-- T
  U <-- V
`,
  multiplicities: `classDiagram
  Cliente "1" --> "0..*" Ordine : effettua
  Ordine"1"*--"1..*"Riga
`,
  members: `classDiagram
  class Ordine {
    <<Abstract>>
    -int id
    +totale: double
    #List~Riga~ righe$
    ~stato
    +Ordine(int id)
    +aggiungi(Riga r, quantita: int) bool
    +conta()$ int
    +calcola(Map~string, List~int~~ pesi) double*
  }
`,
  annotations: `classDiagram
  class Forma {
    <<interface>>
  }
  class Colore {
    <<enumeration>>
    ROSSO
    VERDE
  }
  class Servizio <<Service>>
  <<abstract>> Servizio
`,
  notes: `classDiagram
  class A
  note "libera"
  note for A "uno<br>due #lt;tre#gt; #amp; #quot;quattro#quot;"
  note for Fantasma "pendente"
`,
  namespaceAndStyle: `---
title: Prova
---
classDiagram
  %% un commento
  direction LR
  namespace Dominio {
    class Cliente
    class \`Ordine Web\`
  }
  class Square~Shape~["Quadrato"]:::evidenza
  Cliente --> \`Ordine Web\`
  style Cliente fill:#f9f
  classDef evidenza fill:#ff0
  cssClass "Cliente" evidenza
  click Cliente href "https://example.com"
  accTitle: titolo
  accDescr: descrizione
`,
}
