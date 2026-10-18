# Dev Designer

Editor di diagrammi nel browser: un solo canvas raccoglie elementi di tipi diversi, che entrano anche da testo (DDL, Mermaid) e ne escono.

## Linguaggio

**Famiglia**:
Un tipo di contenuto del canvas, con il suo modello: forme, entità ER, classi, flusso, note.
_Evitare_: tipo di diagramma, kind

**Formato Mermaid**:
Un tipo di diagramma Mermaid, riconosciuto dalla parola con cui comincia il testo; ogni formato finisce in una sola famiglia, ma una famiglia può accoglierne più d'uno.
_Evitare_: tipo, kind, dialetto

**Frammento**:
Ciò che un formato ricava da un testo, nei termini della famiglia di destinazione, prima di entrare nel documento.
_Evitare_: risultato, AST
