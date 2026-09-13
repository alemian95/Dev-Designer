import { Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const REPO = "https://github.com/alemian95/Dev-Designer"
const AUTHOR = "https://github.com/alemian95"

/** Un link esterno: sempre in una scheda nuova, e senza passare il referrer. */
function Link({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
      {children}
    </a>
  )
}

/**
 * Pulsante e dialogo insieme, aperti da `DialogTrigger`: nessuno stato da tenere. Il tooltip sta
 * qui e non nella toolbar perché `TooltipTrigger asChild` vuole un solo elemento figlio, e questo
 * componente ne rende due.
 */
export function About() {
  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Informazioni"><Info /></Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Informazioni</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dev Designer</DialogTitle>
          <DialogDescription>
            Editor di diagrammi ER e UML class. Nessun backend e nessun account: il documento vive nel
            browser e si apre e si salva come file.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Autore</dt>
          <dd><Link href={AUTHOR}>Alessandro Mian</Link></dd>
          <dt className="text-muted-foreground">Codice</dt>
          <dd><Link href={REPO}>alemian95/Dev-Designer</Link></dd>
        </dl>
        <p className="text-sm text-muted-foreground">
          Progettato e scritto in coppia con Claude (Anthropic). Le specifiche, i piani di
          implementazione, le decisioni di architettura e il registro del debito tecnico sono
          versionati nel repository, sotto <code className="font-mono text-xs">docs/</code>.
        </p>
      </DialogContent>
    </Dialog>
  )
}
