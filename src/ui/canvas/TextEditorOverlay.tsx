import { FONT_SIZE } from "@/editor/geometry"
import { worldToScreen, type Viewport } from "@/editor/viewport"

interface Props {
  ariaLabel: string
  /** Angolo in alto a sinistra e dimensione, in coordinate mondo: lo stesso rettangolo che il
   *  nodo/nota disegna sul canvas — il chiamante lo ricava dalla propria geometria (`noteSize`
   *  o `flowNodeSize`), questo componente lo proietta solo a schermo. */
  x: number
  y: number
  w: number
  h: number
  viewport: Viewport
  defaultValue: string
  onCommit: (value: string) => void
  onCancel: () => void
}

/**
 * Textarea sovrapposta a un nodo o una nota in editing (I2 della correzione finale): il markup era
 * identico fra `NoteEditor.tsx` (class diagram) e `FlowNodeEditor.tsx` (flowchart) — stesso
 * posizionamento (`worldToScreen`), stesso `autoFocus`/`select()` all'apertura, stesso commit sul
 * blur, stesso Escape che annulla, stesso stile — due copie della stessa soglia di due ripetizioni
 * che l'utente fissa per estrarre. Resta puramente presentazionale: dato e commit arrivano dai due
 * wrapper, che sono l'unica parte che cambia fra i due diagrammi (`setNoteText`/`noteSize` contro
 * `setNodeLabel`/`flowNodeSize`).
 *
 * **Nessun parser, quindi nessun rifiuto sul blur**: si commette sempre, Escape scarta senza
 * ripristinare il testo sul posto — la chiude e basta, perché il nodo smonta col resto
 * dell'overlay e non c'è un secondo blur da intercettare.
 */
export function TextEditorOverlay({ ariaLabel, x, y, w, h, viewport, defaultValue, onCommit, onCancel }: Props) {
  const tl = worldToScreen(viewport, { x, y })
  return (
    <textarea
      aria-label={ariaLabel}
      autoFocus
      defaultValue={defaultValue}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => onCommit(e.currentTarget.value)}
      onKeyDown={(e) => {
        // Escape scarta; Enter no — nodo e nota sono multiriga per natura, a differenza di un nome.
        if (e.key === "Escape") {
          e.preventDefault()
          onCancel()
        }
      }}
      style={{
        position: "absolute",
        left: tl.x,
        top: tl.y,
        width: w * viewport.scale,
        height: h * viewport.scale,
        fontSize: FONT_SIZE * viewport.scale,
      }}
      className="resize-none rounded border bg-card p-1 font-mono text-foreground outline-none ring-2 ring-primary"
    />
  )
}
