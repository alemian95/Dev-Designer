import { registerOverlay } from "./dom-registry"

/** Layer overlay: marquee, anteprima connessione e guida del ridimensionamento, aggiornati dal DOM durante l'interazione. */
export function Overlay() {
  return (
    <g
      data-layer="overlay"
      pointerEvents="none"
      ref={(el) => {
        registerOverlay(el)
        return () => registerOverlay(null)
      }}
    >
      <rect data-marquee visibility="hidden" fill="var(--primary)" fillOpacity={0.1} stroke="var(--primary)" strokeDasharray="4 2" vectorEffect="non-scaling-stroke" />
      <path data-connect visibility="hidden" fill="none" stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
      <rect data-guide visibility="hidden" fill="none" stroke="var(--primary)" strokeDasharray="4 2" vectorEffect="non-scaling-stroke" />
    </g>
  )
}
