import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { stat } from "node:fs/promises";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, backupHistory } from "../db/schema";
import { authenticate } from "../lib/auth";
import { requirePermission } from "../lib/permissions";
import { env } from "../config/env";
import {
  backupFilePath,
  ensureBackupDir,
  parseConnectionParams,
  runPgDump,
  runPgRestore,
  runPgRestoreList,
  sha256File,
  backupAttachments,
  restoreAttachments,
  verifyAttachments,
} from "../lib/backup";


const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const restoreSchema = z.object({ confirm: z.literal(true) }).strict();

class BackupNotFoundError extends Error {}
class BackupStateError extends Error {}

export default async function backupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/backup", { preHandler: [authenticate, requirePermission("backup.manage")] }, async (_request, reply) => {
    const data = await db.select().from(backupHistory).orderBy(desc(backupHistory.id));
    return reply.send({ data });
  });

  app.post("/api/v1/backup", { preHandler: [authenticate, requirePermission("backup.manage")] }, async (request, reply) => {
    const dir = await ensureBackupDir();
    const conn = parseConnectionParams(env.DATABASE_URL);
    const filename = `bcis-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`;
    const filePath = backupFilePath(dir, filename);

    try {
      await runPgDump(conn, filePath);
      const { size } = await stat(filePath);
      const checksum = await sha256File(filePath);
      const attachmentCount = await backupAttachments(dir, filename);

      const [record] = await db
        .insert(backupHistory)
        .values({
          filename,
          sizeBytes: size,
          checksumSha256: checksum,
          status: "completed",
          createdByUserId: request.currentUser!.id,
        })
        .returning();

      await db.insert(auditLogs).values({
        actorUserId: request.currentUser!.id,
        action: "backup.create",
        entityType: "backup_history",
        entityId: record!.id,
        metadata: { filename, sizeBytes: size, checksumSha256: checksum, attachmentCount },
      });

      return reply.code(201).send({ data: record, attachmentCount });
    } catch (err) {
      request.log.error({ err }, "pg_dump failed");
      return reply.code(500).send({ message: "Backup failed. Check server logs for details." });
    }
  });

  app.post("/api/v1/backup/:id/verify", { preHandler: [authenticate, requirePermission("backup.manage")] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid backup ID" });

    try {
      const [record] = await db.select().from(backupHistory).where(eq(backupHistory.id, params.data.id)).limit(1);
      if (!record) throw new BackupNotFoundError();

      const dir = await ensureBackupDir();
      const filePath = backupFilePath(dir, record.filename);

      const actualChecksum = await sha256File(filePath);
      if (actualChecksum !== record.checksumSha256) {
        await db.update(backupHistory).set({ status: "failed" }).where(eq(backupHistory.id, record.id));
        return reply.code(409).send({ message: "Checksum mismatch — backup file has been altered or corrupted" });
      }

      // Confirms the dump's internal structure is readable without touching
      // any live database.
      await runPgRestoreList(filePath);
      const attachmentCount = await verifyAttachments(dir, record.filename);

      const [updated] = await db
        .update(backupHistory)
        .set({ status: "verified", verifiedAt: new Date() })
        .where(eq(backupHistory.id, record.id))
        .returning();

      await db.insert(auditLogs).values({
        actorUserId: request.currentUser!.id,
        action: "backup.verify",
        entityType: "backup_history",
        entityId: record.id,
        metadata: { filename: record.filename, attachmentCount },
      });

      return reply.send({ data: updated, attachmentCount });
    } catch (err) {
      if (err instanceof BackupNotFoundError) return reply.code(404).send({ message: "Backup not found" });
      request.log.error({ err }, "Backup verification failed");
      return reply.code(500).send({ message: "Verification failed. The backup file may be missing or invalid." });
    }
  });

  app.post("/api/v1/backup/:id/restore", { preHandler: [authenticate, requirePermission("backup.restore")] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid backup ID" });
    const parsed = restoreSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Restore requires explicit confirmation: { "confirm": true }' });
    }

    try {
      const [record] = await db.select().from(backupHistory).where(eq(backupHistory.id, params.data.id)).limit(1);
      if (!record) throw new BackupNotFoundError();
      if (record.status === "failed") {
        throw new BackupStateError("This backup failed its last verification and cannot be restored");
      }

      const dir = await ensureBackupDir();
      const filePath = backupFilePath(dir, record.filename);
      const actualChecksum = await sha256File(filePath);
      if (actualChecksum !== record.checksumSha256) {
        throw new BackupStateError("Checksum mismatch — refusing to restore a modified or corrupted backup file");
      }

      const conn = parseConnectionParams(env.DATABASE_URL);
      await runPgRestore(conn, filePath);
      const attachmentsRestored = await restoreAttachments(dir, record.filename);

      const [updated] = await db
        .update(backupHistory)
        .set({ status: "restored", restoredAt: new Date(), restoredByUserId: request.currentUser!.id })
        .where(eq(backupHistory.id, record.id))
        .returning();

      await db.insert(auditLogs).values({
        actorUserId: request.currentUser!.id,
        action: "backup.restore",
        entityType: "backup_history",
        entityId: record.id,
        metadata: { filename: record.filename, attachmentsRestored },
      });

      return reply.send({ data: updated, attachmentsRestored });
    } catch (err) {
      if (err instanceof BackupNotFoundError) return reply.code(404).send({ message: "Backup not found" });
      if (err instanceof BackupStateError) return reply.code(409).send({ message: err.message });
      request.log.error({ err }, "pg_restore failed");
      return reply.code(500).send({ message: "Restore failed. Check server logs for details." });
    }
  });
}
