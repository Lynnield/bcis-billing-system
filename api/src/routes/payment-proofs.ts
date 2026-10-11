import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, paymentProofs } from "../db/schema";
import { authenticate } from "../lib/auth";
import { requirePermission } from "../lib/permissions";
import {
  ALLOWED_PROOF_TYPES,
  AttachmentValidationError,
  MAX_PROOF_BYTES,
  readProof,
  sanitizeOriginalName,
  storeProof,
  validateProof,
} from "../lib/attachments";


const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const uploadSchema = z.object({
  fileName: z.string().trim().min(1).max(500),
  mimeType: z.enum(ALLOWED_PROOF_TYPES as [string, ...string[]]),
  // base64 of at most MAX_PROOF_BYTES (4 chars per 3 bytes, plus padding).
  dataBase64: z.string().min(1).max(Math.ceil(MAX_PROOF_BYTES / 3) * 4 + 4),
}).strict();

export default async function paymentProofRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/payment-proofs",
    { preHandler: [authenticate, requirePermission("payment.create")], bodyLimit: 8 * 1024 * 1024 },
    async (request, reply) => {
      const parsed = uploadSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: `Upload a PNG, JPEG, WEBP or PDF file of at most ${MAX_PROOF_BYTES / (1024 * 1024)} MB`,
          issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
        });
      }

      let validated;
      try {
        validated = validateProof(parsed.data.mimeType, parsed.data.dataBase64);
      } catch (err) {
        if (err instanceof AttachmentValidationError) return reply.code(400).send({ message: err.message });
        throw err;
      }

      const storedName = await storeProof(validated);
      const originalName = sanitizeOriginalName(parsed.data.fileName);
      const [row] = await db
        .insert(paymentProofs)
        .values({
          storedName,
          originalName,
          mimeType: validated.mimeType,
          sizeBytes: validated.buffer.length,
          sha256: validated.sha256,
          uploadedByUserId: request.currentUser!.id,
        })
        .returning();

      // The same image submitted again is a classic duplicate-GCash pattern;
      // surface it so the verifier sees it, without blocking the upload.
      const duplicates = await db
        .select({ proofId: paymentProofs.id, paymentId: paymentProofs.paymentId, createdAt: paymentProofs.createdAt })
        .from(paymentProofs)
        .where(and(eq(paymentProofs.sha256, validated.sha256), ne(paymentProofs.id, row!.id)));

      await db.insert(auditLogs).values({
        actorUserId: request.currentUser!.id,
        action: "payment_proof.upload",
        entityType: "payment_proof",
        entityId: row!.id,
        metadata: { originalName, mimeType: validated.mimeType, sizeBytes: validated.buffer.length, sha256: validated.sha256, duplicateOf: duplicates.map((d) => d.proofId) },
      });

      return reply.code(201).send({ data: toDto(row!), duplicates });
    },
  );

  app.get("/api/v1/payment-proofs/:id", { preHandler: [authenticate, requirePermission("payment_proof.view")] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid proof ID" });
    const [row] = await db.select().from(paymentProofs).where(eq(paymentProofs.id, params.data.id)).limit(1);
    if (!row) return reply.code(404).send({ message: "Proof not found" });
    const duplicates = await db
      .select({ proofId: paymentProofs.id, paymentId: paymentProofs.paymentId })
      .from(paymentProofs)
      .where(and(eq(paymentProofs.sha256, row.sha256), ne(paymentProofs.id, row.id)));
    return reply.send({ data: toDto(row), duplicates });
  });

  app.get("/api/v1/payment-proofs/:id/file", { preHandler: [authenticate, requirePermission("payment_proof.view")] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid proof ID" });
    const [row] = await db.select().from(paymentProofs).where(eq(paymentProofs.id, params.data.id)).limit(1);
    if (!row) return reply.code(404).send({ message: "Proof not found" });

    let buffer: Buffer;
    try {
      buffer = await readProof(row.storedName);
    } catch (err) {
      request.log.error({ err, proofId: row.id }, "Proof file missing from attachments directory");
      return reply.code(410).send({ message: "The proof file is missing from the server's attachments folder" });
    }
    reply.header("Content-Type", row.mimeType);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Disposition", `inline; filename="proof-${row.id}.${row.storedName.split(".").pop()}"`);
    return reply.send(buffer);
  });
}

function toDto(row: typeof paymentProofs.$inferSelect) {
  // storedName is an internal path component and is never returned.
  return {
    id: row.id,
    paymentId: row.paymentId,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    uploadedByUserId: row.uploadedByUserId,
    createdAt: row.createdAt,
  };
}
