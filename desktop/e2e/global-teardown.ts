import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { Client, E2E_DB, STATE_FILE, databaseUrl } from "./env";

export default async function globalTeardown(): Promise<void> {
  if (existsSync(STATE_FILE)) {
    const { apiPid } = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { apiPid?: number };
    if (apiPid) {
      if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(apiPid), "/T", "/F"], { stdio: "ignore" });
      else {
        try {
          process.kill(-apiPid);
        } catch {
          // already gone
        }
      }
    }
    rmSync(STATE_FILE, { force: true });
  }
  const admin = new Client({ connectionString: databaseUrl("postgres") });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${E2E_DB} WITH (FORCE)`);
  await admin.end();
}
