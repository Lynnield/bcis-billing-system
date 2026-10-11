import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env";

// Spec 4.4: validate uploaded payment proofs by type, size and safe storage path.

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

// Allowed types, the extension we store them under, and the file signature
// ("magic bytes") the content must actually start with. The declared MIME
// type alone is never trusted.
const ALLOWED: Record<string, { ext: string; matches: (b: Buffer) => boolean }> = {
  "image/png": { ext: "png", matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/jpeg": { ext: "jpg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": { ext: "webp", matches: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
  "application/pdf": { ext: "pdf", matches: (b) => b.subarray(0, 5).toString("ascii") === "%PDF-" },
};

export const ALLOWED_PROOF_TYPES = Object.keys(ALLOWED);

export class AttachmentValidationError extends Error {}

export function attachmentsRoot(): string {
  return path.resolve(env.ATTACHMENTS_DIR);
}

/** Resolve a stored name to an absolute path, refusing anything outside the root. */
export function resolveStoredPath(storedName: string): string {
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp|pdf)$/.test(storedName)) {
    throw new AttachmentValidationError("Invalid stored file name");
  }
  const root = attachmentsRoot();
  const full = path.resolve(root, storedName);
  if (path.dirname(full) !== root) throw new AttachmentValidationError("Path escapes the attachments directory");
  return full;
}

/** Display-only name: basename, control characters stripped, length-capped. */
export function sanitizeOriginalName(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/"));
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim();
  return (cleaned || "proof").slice(0, 255);
}

export interface ValidatedProof {
  buffer: Buffer;
  mimeType: string;
  ext: string;
  sha256: string;
}

export function validateProof(mimeType: string, dataBase64: string): ValidatedProof {
  const rule = ALLOWED[mimeType];
  if (!rule) {
    throw new AttachmentValidationError(`File type ${mimeType} is not allowed. Use PNG, JPEG, WEBP or PDF.`);
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64)) {
    throw new AttachmentValidationError("File data is not valid base64");
  }
  const buffer = Buffer.from(dataBase64, "base64");
  if (buffer.length === 0) throw new AttachmentValidationError("File is empty");
  if (buffer.length > MAX_PROOF_BYTES) {
    throw new AttachmentValidationError(`File is larger than the ${MAX_PROOF_BYTES / (1024 * 1024)} MB limit`);
  }
  if (!rule.matches(buffer)) {
    throw new AttachmentValidationError(`File content does not match its declared type (${mimeType})`);
  }
  return { buffer, mimeType, ext: rule.ext, sha256: createHash("sha256").update(buffer).digest("hex") };
}

/** Writes the file under a fresh random name and returns that name. */
export async function storeProof(proof: ValidatedProof): Promise<string> {
  const storedName = `${randomUUID()}.${proof.ext}`;
  await mkdir(attachmentsRoot(), { recursive: true });
  await writeFile(resolveStoredPath(storedName), proof.buffer, { flag: "wx" });
  return storedName;
}

export async function readProof(storedName: string): Promise<Buffer> {
  return readFile(resolveStoredPath(storedName));
}
