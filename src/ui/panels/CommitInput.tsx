import { useRef, useState, type ComponentProps } from "react"
import { Input } from "@/components/ui/input"

interface Props extends Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onBlur" | "onKeyDown"> {
  value: string
  /**
   * Chiamato su Enter e su blur, solo se il testo è cambiato. Se torna `false` la modifica è stata
   * rifiutata e il campo torna al valore precedente: `key={value}` non basta a rimontarlo, perché
   * un rifiuto lascia il valore invariato, e il campo continuerebbe a mostrare il testo non salvato.
   */
  onCommit: (value: string) => boolean | void
}

/**
 * Input controllato localmente che committa un comando solo alla fine dell'editing: un comando, una voce di undo.
 * Il genitore passa `key={value}`: quando il valore cambia dall'esterno il componente si rimonta con il testo nuovo.
 */
export function CommitInput({ value, onCommit, ...rest }: Props) {
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
    <Input
      {...rest}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape") {
          cancelled.current = true
          setText(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}
