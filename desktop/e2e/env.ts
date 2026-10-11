import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const API_DIR = join(here, "..", "..", "api");
export const E2E_PORT = 3199;
export const E2E_API_URL = `http://localhost:${E2E_PORT}`;
export const E2E_DB = "bcis_billing_e2e";
export const STATE_FILE = join(here, ".e2e-state.json");

/** DATABASE_URL from api/.env (or the environment), pointed at another database. */
export function databaseUrl(dbName: string): string {
  let base = process.env.DATABASE_URL;
  if (!base) {
    const env = readFileSync(join(API_DIR, ".env"), "utf8");
    base = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.trim();
  }
  if (!base) throw new Error("DATABASE_URL not found in the environment or api/.env");
  const url = new URL(base);
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("E2E only runs against a local PostgreSQL server");
  }
  url.pathname = `/${dbName}`;
  return url.toString();
}

/** pg is a dependency of the API package; reuse it rather than add it here. */
const requireFromApi = createRequire(join(API_DIR, "package.json"));
export const { Client } = requireFromApi("pg") as typeof import("pg");
