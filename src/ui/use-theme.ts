import { useCallback, useEffect, useState } from "react"

type Theme = "light" | "dark"
const KEY = "dev-designer.theme"

function initial(): Theme {
  // Dove i dati del sito sono bloccati l'accesso lancia invece di restituire null, e qui sarebbe
  // durante il primo render: pagina bianca. Lo script inline in index.html si protegge già così.
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === "light" || saved === "dark") return saved
  } catch {
    // Nessuna preferenza leggibile: vale quella di sistema.
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

/** Classe `dark` su <html>: i token shadcn e il canvas SVG leggono le stesse variabili. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(initial)
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    // Anche la scrittura lancia, nello stesso caso: la classe su <html> è già applicata sopra,
    // quindi il tema scelto vale comunque per questa sessione.
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // Non si ricorda fra un ricaricamento e l'altro.
    }
  }, [theme])
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), [])
  return { theme, toggle }
}
