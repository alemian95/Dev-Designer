# 0008. Formato Mermaid e famiglia in due registri

Date: 2026-10-18

## Status

Accepted

## Context

L'import Mermaid sceglie la famiglia in punti scritti a mano: `detect` e
`MermaidKind` in `src/io/mermaid/common.ts`, la catena di `if` in `analyse.ts`
e i ternari su `ready.kind` in `ImportMermaidDialog.tsx`, dove una famiglia
nuova finirebbe senza errori nel ramo delle classi. In arrivo ci sono due casi
diversi. `stateDiagram-v2` entra nel **flusso** come il `flowchart`, quindi è un
formato nuovo per una famiglia esistente. `sequenceDiagram` porta invece una
famiglia nuova. La regola del committente vuole che aggiungere l'uno o l'altro
voglia dire aggiungere voci che tsc controlla, non rami sparsi.

## Decision

Due registri, perché formato e famiglia sono due assi diversi (vedi
`GLOSSARY.md`):

- **Registro dei formati** (`src/io/mermaid/formats.ts`), indicizzato per
  `MermaidFormat` (id = parola Mermaid canonica: `erDiagram`, `classDiagram`,
  `flowchart`; gli alias come `graph` stanno in `keywords`). Ogni voce porta le
  parole d'apertura, il nome nel selettore dei blocchi, la `family` di
  destinazione e `analyse(text)`, che torna il frammento di quella famiglia.
- **Registro dell'import per famiglia** (`src/ui/import/mermaid-families.ts`),
  indicizzato per `ImportFamily`. Ogni voce porta esiti, elementi importabili,
  `prepare` (selezione, disposizione e Recipe), riepilogo, sostantivo, conteggi
  e frase finale. Compone le funzioni di `editor/commands/import-mermaid.ts`.

La sola fonte dei tipi è `FragmentByFamily`. Entrambi i registri sono tipi
mappati sulle sue chiavi o sui formati, quindi una voce mancante o un frammento
della famiglia sbagliata sono errori di compilazione.

## Considered Options

- **Un registro unico per formato**, con dentro anche l'innesto nel documento.
  È più semplice finché formato e famiglia coincidono, ma state e flowchart
  dovrebbero duplicare o condividere a mano esiti, disposizione e Recipe del
  flusso.
- **Import dentro `DiagramOps` (`familyOps`)**. Scartato: l'import non è
  un'operazione del canvas, e note e forme dovrebbero implementarlo, o
  dichiararlo opzionale e perdere la totalità.

## Consequences

L'export testo resta fuori da entrambi i registri: l'emettitore dipende dalla
famiglia e non dal formato d'ingresso (lo state esce come `flowchart`), e
`TextExportDialog` è già totale per tsc grazie ai suoi `Record`. I testi del
dialog che elencano i formati si ricavano dal registro dei formati.
