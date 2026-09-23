import { useRef, useState, type ComponentProps } from "react"

interface Props extends Omit<ComponentProps<"textarea">, "value" | "onChange" | "onBlur" | "onKeyDown"> {
  value: string
  /** Stessa firma di `CommitInput.onCommit` (vedi lì per la ragione del valore di ritorno). */
  onCommit: (value: string) => boolean | void
}

/**
 * Gemella di `CommitInput` per un campo multiriga (I2 della correzione finale): stessa logica di
 * commit-al-blur-solo-se-cambiato e annulla-con-escape, un `<textarea>` invece di un `<input>` —
 * qui non c'è un componente di sistema da cui partire (`components/ui` non ha ancora un
 * `Textarea`), quindi si scrive l'elemento nativo direttamente, con lo stesso pattern.
 *
 * Estratta dalla textarea salvata sul blur di `NoteProperties` (`ClassProperties.tsx`) e
 * `FlowNodeProperties` (`FlowProperties.tsx`): stesso markup, stessa soglia di due ripetizioni.
 */
export function CommitTextarea({ value, onCommit, ...rest }: Props) {
  const [text, setText] = useState(value)
  /** Escape sfoca dopo aver ripristinato il testo: quel blur non deve committare. */
  const cancelled = useRef(false)
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (text !== value && onCommit(text) === false) setText(value)
  }
  return (
    <textarea
      {...rest}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          cancelled.current = true
          setText(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}
