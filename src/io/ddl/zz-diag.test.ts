// TEMPORANEO: diagnostica del test di scalabilità in CI, da togliere.
import { it } from "vitest"
import { splitStatements } from "./sql-text"
const gen = (n: number): string => {
  const p: string[] = []
  for (let i = 0; i < n; i++) {
    const cols = Array.from({ length: 12 }, (_, c) => `  \`col_${c}\` varchar(255) DEFAULT NULL`).join(",\n")
    p.push(`CREATE TABLE \`tbl_${i}\` (\n\`id\` bigint unsigned NOT NULL,\n${cols},\n  PRIMARY KEY (\`id\`)\n) ENGINE=InnoDB;`)
  }
  return p.join("\n")
}
const cpu = (): number => { const u = process.cpuUsage(); return (u.user + u.system) / 1000 }
it("diagnostica", () => {
  const lines: string[] = []
  for (const order of [[800, 1600, 3200], [3200, 1600, 800]]) {
    for (const n of order) {
      const s = gen(n)
      const c: string[] = []
      const w: string[] = []
      for (let i = 0; i < 8; i++) {
        const t0 = cpu(); const w0 = performance.now()
        splitStatements(s)
        c.push((cpu() - t0).toFixed(1)); w.push((performance.now() - w0).toFixed(1))
      }
      lines.push(`n=${n} cpu=[${c.join(" ")}] wall=[${w.join(" ")}]`)
    }
  }
  throw new Error("DIAG\n" + lines.join("\n"))
})
