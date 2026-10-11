import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import {
  auditLogs,
  gcashPaymentDetails,
  paymentProofs,
  payments,
  roles,
  serviceAccounts,
  servicePlans,
  services,
  subscribers,
  userRoles,
  users,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { ROLE_NAMES } from "../src/lib/roles";
import { attachmentsRoot, resolveStoredPath, sanitizeOriginalName } from "../src/lib/attachments";
import { backupAttachments, restoreAttachments, verifyAttachments } from "../src/lib/backup";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const createdUserIds: number[] = [];
const tokens: Record<string, string> = {};
const tag = Date.now().toString(36);
let subscriberId: number;
let serviceId: number;
let planId: number;
let accountId: number;

// Smallest valid PNG header + some body bytes; validation checks the signature.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`png-body-${tag}`)]);
const PDF = Buffer.from(`%PDF-1.4\n% proof ${tag}\n`);

async function mkUser(key: string, roleName: string) {
  const username = `pp_${key}_${tag}`;
  const passwordHash = await hashPassword("S3cure!TestPassw0rd");
  const [u] = await db.insert(users).values({ username, email: `${username}@test.local`, fullName: username, passwordHash, status: "active" }).returning({ id: users.id });
  createdUserIds.push(u!.id);
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password: "S3cure!TestPassw0rd" } });
  tokens[key] = res.json().token;
}

function auth(key: string) {
  return { authorization: `Bearer ${tokens[key]}` };
}

function upload(key: string, fileName: string, mimeType: string, data: Buffer) {
  return app.inject({
    method: "POST",
    url: "/api/v1/payment-proofs",
    headers: auth(key),
    payload: { fileName, mimeType, dataBase64: data.toString("base64") },
  });
}

beforeAll(async () => {
  app = await buildApp();
  await mkUser("cashier", ROLE_NAMES.CASHIER);
  await mkUser("acct", ROLE_NAMES.ACCOUNTING_AUDITOR);
  await mkUser("tech", ROLE_NAMES.TECHNICIAN);
  await mkUser("viewer", ROLE_NAMES.READ_ONLY_VIEWER);
  const [sub] = await db.insert(subscribers).values({ accountNumber: `ACC-PP-${tag}`, firstName: "Proof", lastName: "Test", addressLine1: "1 St", status: "active" }).returning();
  subscriberId = sub!.id;
  const [svc] = await db.insert(services).values({ type: "internet", name: `PP ${tag}` }).returning();
  serviceId = svc!.id;
  const [plan] = await db.insert(servicePlans).values({ serviceId, name: "PP 500", price: "500.00" }).returning();
  planId = plan!.id;
  const [acc] = await db.insert(serviceAccounts).values({ subscriberId, planId, serviceNumber: `SVC-PP-${tag}`, status: "active" }).returning();
  accountId = acc!.id;
});

afterAll(async () => {
  const pays = await db.select({ id: payments.id }).from(payments).where(eq(payments.serviceAccountId, accountId));
  const payIds = pays.map((p) => p.id);
  await db.delete(paymentProofs).where(inArray(paymentProofs.uploadedByUserId, createdUserIds));
  if (payIds.length) {
    await db.delete(gcashPaymentDetails).where(inArray(gcashPaymentDetails.paymentId, payIds));
    await db.delete(payments).where(inArray(payments.id, payIds));
  }
  await db.delete(serviceAccounts).where(eq(serviceAccounts.id, accountId));
  await db.delete(servicePlans).where(eq(servicePlans.id, planId));
  await db.delete(services).where(eq(services.id, serviceId));
  await db.delete(subscribers).where(eq(subscribers.id, subscriberId));
  await db.delete(auditLogs).where(inArray(auditLogs.actorUserId, createdUserIds));
  await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
  await db.delete(users).where(inArray(users.id, createdUserIds));
  await app.close();
  await pool.end();
});

describe("proof upload validation (spec 4.4)", () => {
  it("stores a valid PNG under a server-generated name inside the attachments folder", async () => {
    const res = await upload("cashier", "gcash screenshot.png", "image/png", PNG);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.mimeType).toBe("image/png");
    expect(body.data.sizeBytes).toBe(PNG.length);
    expect(body.data).not.toHaveProperty("storedName");

    const [row] = await db.select().from(paymentProofs).where(eq(paymentProofs.id, body.data.id));
    expect(row!.storedName).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(existsSync(resolveStoredPath(row!.storedName))).toBe(true);
  });

  it("rejects a type that is not on the allow-list", async () => {
    const res = await upload("cashier", "x.gif", "image/gif", Buffer.from("GIF89a"));
    expect(res.statusCode).toBe(400);
  });

  it("rejects content that does not match the declared type", async () => {
    const res = await upload("cashier", "fake.png", "image/png", PDF);
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/does not match/);
  });

  it("rejects a file over the 5 MB limit", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await upload("cashier", "big.png", "image/png", big);
    expect(res.statusCode).toBe(400);
  });

  it("never uses the client file name as a path", async () => {
    const before = readdirSync(attachmentsRoot()).length;
    const res = await upload("cashier", "..\\..\\..\\windows\\evil.pdf", "application/pdf", PDF);
    expect(res.statusCode).toBe(201);
    expect(res.json().data.originalName).toBe("evil.pdf");
    expect(readdirSync(attachmentsRoot()).length).toBe(before + 1);
    expect(sanitizeOriginalName("../../etc/passwd")).toBe("passwd");
    expect(() => resolveStoredPath("../secret.png")).toThrow();
  });

  it("technician and read-only viewer cannot upload or view proofs (403)", async () => {
    expect((await upload("tech", "a.png", "image/png", PNG)).statusCode).toBe(403);
    const [any] = await db.select().from(paymentProofs).limit(1);
    const res = await app.inject({ method: "GET", url: `/api/v1/payment-proofs/${any!.id}/file`, headers: auth("viewer") });
    expect(res.statusCode).toBe(403);
  });
});

describe("proofs on payments and GCash review", () => {
  it("serves the exact bytes back for preview", async () => {
    const up = (await upload("cashier", "p.pdf", "application/pdf", PDF)).json().data;
    const res = await app.inject({ method: "GET", url: `/api/v1/payment-proofs/${up.id}/file`, headers: auth("acct") });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.from(res.rawPayload).equals(PDF)).toBe(true);
  });

  it("flags a re-uploaded identical image as a possible duplicate", async () => {
    const same = Buffer.concat([PNG, Buffer.from("dup")]);
    const first = await upload("cashier", "one.png", "image/png", same);
    const second = await upload("cashier", "two.png", "image/png", same);
    expect(second.json().duplicates.map((d: { proofId: number }) => d.proofId)).toContain(first.json().data.id);
  });

  it("attaches an uploaded proof to a GCash payment; it cannot be reused; uploading alone posts nothing", async () => {
    const proof = (await upload("cashier", "gcash.png", "image/png", Buffer.concat([PNG, Buffer.from("gc")]))).json().data;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments",
      headers: auth("cashier"),
      payload: { serviceAccountId: accountId, amount: "500.00", method: "gcash", gcash: { gcashReferenceNumber: `GC-${tag}`, proofId: proof.id } },
    });
    expect(res.statusCode).toBe(201);
    // Spec 3.7: a screenshot is evidence to review, not proof of payment.
    expect(res.json().data.status).toBe("pending");

    const detail = await app.inject({ method: "GET", url: `/api/v1/payments/${res.json().data.id}`, headers: auth("acct") });
    expect(detail.json().data.proofs.map((p: { id: number }) => p.id)).toEqual([proof.id]);

    const reuse = await app.inject({
      method: "POST",
      url: "/api/v1/payments",
      headers: auth("cashier"),
      payload: { serviceAccountId: accountId, amount: "100.00", method: "cash", proofId: proof.id },
    });
    expect(reuse.statusCode).toBe(400);
  });
});

describe("attachment backup / verify / restore (spec 4.5)", () => {
  it("mirrors proofs into the backup, detects tampering, and restores a lost file", async () => {

    const up = (await upload("cashier", "keep.png", "image/png", Buffer.concat([PNG, Buffer.from("bk")]))).json().data;
    const [row] = await db.select().from(paymentProofs).where(eq(paymentProofs.id, up.id));
    const backupDir = mkdtempSync(join(tmpdir(), "bcis-att-backup-"));
    try {
      const dump = "bcis-backup-test.dump";
      expect(await backupAttachments(backupDir, dump)).toBeGreaterThanOrEqual(1);
      expect(await verifyAttachments(backupDir, dump)).toBeGreaterThanOrEqual(1);

      // Lose the live file, then restore it from the backup.
      unlinkSync(resolveStoredPath(row!.storedName));
      expect(existsSync(resolveStoredPath(row!.storedName))).toBe(false);
      expect(await restoreAttachments(backupDir, dump)).toBeGreaterThanOrEqual(1);
      expect(existsSync(resolveStoredPath(row!.storedName))).toBe(true);

      // Tamper with the mirrored copy: verification must fail.
      writeFileSync(join(backupDir, "attachments", row!.storedName), "tampered");
      await expect(verifyAttachments(backupDir, dump)).rejects.toThrow(/altered/);
    } finally {
      rmSync(backupDir, { recursive: true, force: true });
    }
  });
});
