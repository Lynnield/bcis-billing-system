import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import { backupHistory, roles, userRoles, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { ROLE_NAMES } from "../src/lib/roles";
import { env } from "../src/config/env";
import { parseConnectionParams, runPgDump, runPgRestore, runPgRestoreList, sha256File } from "../src/lib/backup";
import { eq, inArray } from "drizzle-orm";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const createdUserIds: number[] = [];
const tokens: Record<string, string> = {};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function mkUser(username: string, roleName: string) {
  const passwordHash = await hashPassword("S3cure!TestPassw0rd");
  const [u] = await db
    .insert(users)
    .values({ username, email: `${username}@test.local`, fullName: username, passwordHash, status: "active" })
    .returning({ id: users.id });
  createdUserIds.push(u!.id);
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password: "S3cure!TestPassw0rd" } });
  tokens[username] = res.json().token;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  await mkUser(uid("owner"), ROLE_NAMES.OWNER);
  await mkUser(uid("cashier"), ROLE_NAMES.CASHIER);
});

afterAll(async () => {
  if (createdUserIds.length) {
    await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  await db.delete(backupHistory);
  await app.close();
  await pool.end();
});

describe("Backup authorization", () => {
  const ownerToken = () => tokens[Object.keys(tokens).find((k) => k.startsWith("owner"))!];
  const cashierToken = () => tokens[Object.keys(tokens).find((k) => k.startsWith("cashier"))!];

  it("AT-10 style: a non-Owner role is rejected by the server even though it never sees the button", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/backup",
      headers: { authorization: `Bearer ${cashierToken()}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/backup" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a restore without explicit confirmation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/backup/999999/restore",
      headers: { authorization: `Bearer ${ownerToken()}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("404s a verify/restore against a backup ID that does not exist", async () => {
    const verify = await app.inject({
      method: "POST",
      url: "/api/v1/backup/999999/verify",
      headers: { authorization: `Bearer ${ownerToken()}` },
    });
    expect(verify.statusCode).toBe(404);
  });
});

describe("Backup creation via HTTP (dump is read-only, safe against the shared test DB)", () => {
  const ownerToken = () => tokens[Object.keys(tokens).find((k) => k.startsWith("owner"))!];

  it("creates a backup record with a verifiable checksum, then verifies it", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/backup",
      headers: { authorization: `Bearer ${ownerToken()}` },
    });
    expect(create.statusCode).toBe(201);
    const record = create.json().data;
    expect(record.status).toBe("completed");
    expect(record.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Number(record.sizeBytes)).toBeGreaterThan(0);

    const verify = await app.inject({
      method: "POST",
      url: `/api/v1/backup/${record.id}/verify`,
      headers: { authorization: `Bearer ${ownerToken()}` },
    });
    expect(verify.statusCode).toBe(200);
    expect(verify.json().data.status).toBe("verified");

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/backup",
      headers: { authorization: `Bearer ${ownerToken()}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.some((b: { id: number }) => b.id === record.id)).toBe(true);
  });
});

describe("AT-12: full dump -> mutate -> restore integrity cycle", () => {
  // This exercises the exact pg_dump/pg_restore code paths the HTTP routes
  // use, but against a disposable throwaway database instead of the shared
  // bcis_billing_test — a `--clean` restore replaces every table in the
  // target database, which would corrupt state for every other test file in
  // this suite if run against the database they all share.
  const throwawayDbName = `bcis_backup_cycle_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let maintClient: Client;
  let tmpDir: string;

  beforeAll(async () => {
    const conn = parseConnectionParams(env.DATABASE_URL);
    maintClient = new Client({ host: conn.host, port: Number(conn.port), user: conn.user, password: conn.password, database: "postgres" });
    await maintClient.connect();
    await maintClient.query(`CREATE DATABASE "${throwawayDbName}"`);
    tmpDir = mkdtempSync(join(tmpdir(), "bcis-backup-test-"));
  });

  afterAll(async () => {
    rmSync(tmpDir, { recursive: true, force: true });
    await maintClient.query(`DROP DATABASE IF EXISTS "${throwawayDbName}" WITH (FORCE)`);
    await maintClient.end();
  });

  it("restores a database to its backed-up state, losing only post-backup changes", async () => {
    const conn = { ...parseConnectionParams(env.DATABASE_URL), database: throwawayDbName };
    const probeClient = new Client({ host: conn.host, port: Number(conn.port), user: conn.user, password: conn.password, database: conn.database });
    await probeClient.connect();

    await probeClient.query("CREATE TABLE probe (id serial PRIMARY KEY, value text NOT NULL)");
    await probeClient.query("INSERT INTO probe (value) VALUES ('before-backup')");

    const dumpPath = join(tmpDir, "cycle.dump");
    await runPgDump(conn, dumpPath);

    // The dump is structurally valid on its own, independent of any live DB.
    await expect(runPgRestoreList(dumpPath)).resolves.not.toThrow();
    const checksum = await sha256File(dumpPath);
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);

    // Mutate after the backup was taken — this change must not survive restore.
    await probeClient.query("INSERT INTO probe (value) VALUES ('after-backup-should-vanish')");
    const beforeRestore = await probeClient.query("SELECT value FROM probe ORDER BY id");
    expect(beforeRestore.rows.map((r) => r.value)).toEqual(["before-backup", "after-backup-should-vanish"]);
    await probeClient.end();

    await runPgRestore(conn, dumpPath);

    const afterRestoreClient = new Client({ host: conn.host, port: Number(conn.port), user: conn.user, password: conn.password, database: conn.database });
    await afterRestoreClient.connect();
    const afterRestore = await afterRestoreClient.query("SELECT value FROM probe ORDER BY id");
    expect(afterRestore.rows.map((r) => r.value)).toEqual(["before-backup"]);
    await afterRestoreClient.end();
  });
});
