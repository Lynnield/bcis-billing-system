import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { API_DIR, Client, E2E_API_URL, E2E_DB, E2E_PORT, STATE_FILE, databaseUrl } from "./env";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

async function recreateDatabase(): Promise<void> {
  const admin = new Client({ connectionString: databaseUrl("postgres") });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${E2E_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${E2E_DB}`);
  await admin.end();
}

function run(args: string[], env: NodeJS.ProcessEnv): void {
  const res = spawnSync(npx, args, { cwd: API_DIR, env, stdio: "inherit", shell: process.platform === "win32" });
  if (res.status !== 0) throw new Error(`${args.join(" ")} failed (exit ${res.status})`);
}

async function waitForHealth(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${E2E_API_URL}/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`API did not become healthy at ${E2E_API_URL}`);
}

export default async function globalSetup(): Promise<void> {
  const dbUrl = databaseUrl(E2E_DB);
  const scratch = join(tmpdir(), "bcis-e2e");
  mkdirSync(scratch, { recursive: true });
  const env = {
    ...process.env,
    DATABASE_URL: dbUrl,
    PORT: String(E2E_PORT),
    HOST: "127.0.0.1",
    LOG_LEVEL: "warn",
    ATTACHMENTS_DIR: join(scratch, "attachments"),
    BACKUP_DIR: join(scratch, "backups"),
  };

  await recreateDatabase();
  run(["drizzle-kit", "migrate"], env);
  run(["tsx", "--env-file-if-exists=.env", "src/db/seed.ts"], env);

  const api = spawn(npx, ["tsx", "--env-file-if-exists=.env", "src/index.ts"], {
    cwd: API_DIR,
    env,
    stdio: "ignore",
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
  });
  writeFileSync(STATE_FILE, JSON.stringify({ apiPid: api.pid }));
  await waitForHealth(60_000);
}
