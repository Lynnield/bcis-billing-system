// Generates docs/erd.mmd (Mermaid ER diagram) from the Drizzle schema, so
// the documented data model can never drift from the real one.
// Run: `npm run erd`; `cd docs/build && npm run build` renders erd.png and the PDFs.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { getTableName, is } from "drizzle-orm";
import * as schema from "../src/db/schema";

const tables = Object.values(schema).filter((v): v is PgTable => is(v, PgTable));
const entity = (t: PgTable) => getTableName(t).toUpperCase();

function sqlType(raw: string): string {
  if (raw.startsWith("timestamp")) return raw.includes("with time zone") ? "timestamptz" : "timestamp";
  return raw.replace(/\(.*\)/, "").replace(/\W+/g, "_");
}

const relations: string[] = [];
const entities: string[] = [];

for (const table of tables) {
  const cfg = getTableConfig(table);
  const singleUnique = new Set<string>();
  for (const c of cfg.columns) if (c.isUnique) singleUnique.add(c.name);
  for (const u of cfg.uniqueConstraints) if (u.columns.length === 1) singleUnique.add(u.columns[0]!.name);
  for (const i of cfg.indexes) {
    const cols = i.config.columns as { name?: string }[];
    if (i.config.unique && cols.length === 1 && cols[0]?.name) singleUnique.add(cols[0].name);
  }
  const pk = new Set(cfg.columns.filter((c) => c.primary).map((c) => c.name));
  for (const p of cfg.primaryKeys) for (const c of p.columns) pk.add(c.name);

  const fkCols = new Set<string>();
  for (const fk of cfg.foreignKeys) {
    const ref = fk.reference();
    const col = ref.columns[0]!.name;
    fkCols.add(col);
    const card = singleUnique.has(col) || (pk.has(col) && pk.size === 1) ? "||--o|" : "||--o{";
    relations.push(`    ${entity(ref.foreignTable)} ${card} ${entity(table)} : ${col.replace(/_id$/, "")}`);
  }

  const lines = cfg.columns.map((c) => {
    const keys = [pk.has(c.name) && "PK", fkCols.has(c.name) && "FK", singleUnique.has(c.name) && !pk.has(c.name) && "UK"].filter(Boolean);
    return `        ${sqlType(c.getSQLType())} ${c.name}${keys.length ? " " + keys.join(", ") : ""}`;
  });
  entities.push(`    ${entity(table)} {\n${lines.join("\n")}\n    }`);
}

const out = ["erDiagram", ...relations.sort(), "", ...entities, ""].join("\n");
const target = join(import.meta.dirname, "..", "..", "docs", "erd.mmd");
writeFileSync(target, out);
console.log(`Wrote ${target}: ${tables.length} tables, ${relations.length} relationships.`);
