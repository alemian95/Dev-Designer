// Genera uno schema in stile `mysqldump --no-data`: tutto dentro CREATE TABLE, con i commenti condizionali di MySQL.
import { writeFileSync, mkdirSync } from "node:fs"

const N = Number(process.argv[2] ?? 200)
const out = ["/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;", "SET NAMES utf8mb4;", ""]
for (let i = 0; i < N; i++) {
  out.push(`DROP TABLE IF EXISTS \`table_${i}\`;`)
  out.push(`/*!40101 SET @saved_cs_client     = @@character_set_client */;`)
  out.push(`CREATE TABLE \`table_${i}\` (`)
  out.push(`  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,`)
  for (let j = 0; j < 10; j++) out.push(`  \`col_${j}\` varchar(255) COLLATE utf8mb4_unicode_ci ${j % 3 ? "DEFAULT NULL" : "NOT NULL"},`)
  if (i > 0) out.push(`  \`table_${i - 1}_id\` bigint unsigned DEFAULT NULL,`)
  out.push(`  \`created_at\` timestamp NULL DEFAULT NULL,`)
  out.push(`  PRIMARY KEY (\`id\`),`)
  out.push(`  UNIQUE KEY \`table_${i}_col_0_unique\` (\`col_0\`)${i > 0 ? "," : ""}`)
  if (i > 0) {
    out.push(`  KEY \`table_${i}_parent_foreign\` (\`table_${i - 1}_id\`),`)
    out.push(
      `  CONSTRAINT \`table_${i}_parent_foreign\` FOREIGN KEY (\`table_${i - 1}_id\`) REFERENCES \`table_${i - 1}\` (\`id\`) ON DELETE CASCADE`,
    )
  }
  out.push(`) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`)
  out.push(`/*!40101 SET character_set_client = @saved_cs_client */;`, "")
}
mkdirSync("spike/fixtures", { recursive: true })
writeFileSync("spike/fixtures/mysql.synthetic.sql", out.join("\n") + "\n")
console.log(`scritto spike/fixtures/mysql.synthetic.sql con ${N} tabelle`)
