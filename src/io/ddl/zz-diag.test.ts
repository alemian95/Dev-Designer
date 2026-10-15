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
  const small = gen(800)
  const big = gen(3200)
  for (let i = 0; i < 10; i++) splitStatements(big)
  let a = Infinity
  let b = Infinity
  for (let i = 0; i < 10; i++) {
    let t0 = cpu(); splitStatements(small); a = Math.min(a, cpu() - t0)
    t0 = cpu(); splitStatements(big); b = Math.min(b, cpu() - t0)
  }
  throw new Error(`DIAG small=${a.toFixed(1)} big=${b.toFixed(1)} ratio=${(b / a).toFixed(2)}`)
})
