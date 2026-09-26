import { useStore } from "zustand"
import { Label } from "@/components/ui/label"
import { sessionStore } from "@/editor/session-store"
import { CommitTextarea } from "./CommitTextarea"

/**
 * Il campo «Testo» di una nota o di una forma: una `textarea` commessa sul blur, l'alternativa al
 * doppio clic sul canvas. **Alternativa, non secondo editor:** finché l'editor sul canvas è aperto su
 * *questo* elemento il campo è in sola lettura e lo dice, perché due campi modificabili per lo stesso
 * dato divergerebbero. `id` è la chiave con prefisso dell'elemento, quella che l'editing in corso
 * porta; `fieldId` è l'id HTML del campo, diverso per nota e forma.
 */
export function BodyTextField({ id, text, onCommit, fieldId = "note-text" }: { id: string; text: string; onCommit: (text: string) => void; fieldId?: string }) {
  const editingHere = useStore(sessionStore, (s) => s.editing?.key === id && s.editing.target === "body")
  return (
    <div className="grid gap-1">
      <Label htmlFor={fieldId}>Testo</Label>
      <CommitTextarea
        id={fieldId}
        key={text}
        value={text}
        readOnly={editingHere}
        onCommit={onCommit}
        className="min-h-24 resize-none rounded-md border bg-background p-2 text-sm read-only:opacity-50"
      />
      {editingHere && <p className="text-xs text-muted-foreground">Modifica in corso sul canvas.</p>}
    </div>
  )
}
