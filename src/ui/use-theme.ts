import { useCallback, useEffect, useState } from "react"

type Theme = "light" | "dark"
const KEY = "dev-designer.theme"

function initial(): Theme {
  const saved = localStorage.getItem(KEY)
  if (saved === "light" || saved === "dark") return saved
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

/** Classe `dark` su <html>: i token shadcn e il canvas SVG leggono le stesse variabili. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(initial)
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    localStorage.setItem(KEY, theme)
  }, [theme])
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), [])
  return { theme, toggle }
}
