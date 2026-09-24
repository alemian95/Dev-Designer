import type { ComponentProps, ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** Tooltip su un pulsante della barra o della sidebar. `side` serve alla sidebar, che lo vuole a destra. */
export function Hint({ label, side, children }: { label: string; side?: ComponentProps<typeof TooltipContent>["side"]; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
