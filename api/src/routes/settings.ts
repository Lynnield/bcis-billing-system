import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { applicationSettings, auditLogs } from "../db/schema";
import { authenticate, requireRoles } from "../lib/auth";
import { ROLE_NAMES } from "../lib/roles";

const READ_ROLES = [ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR, ROLE_NAMES.COLLECTION_SUPERVISOR];
const WRITE_ROLES = [ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR];

// Settings 3.10 cares about: how many days of grace before an overdue
// account becomes a suspension candidate, and the threshold (in days
// overdue) at which suspension is recommended. These are read/recorded
// here; nothing in the codebase currently auto-suspends based on them —
// suspension stays a deliberate, authorized action (service-accounts.ts
// POST .../suspend).
const SETTINGS_SCHEMA = z.object({
  gracePeriodDays: z.coerce.number().int().min(0).max(365),
  suspensionThresholdDays: z.coerce.number().int().min(0).max(365),
});
const DEFAULTS = { gracePeriodDays: 5, suspensionThresholdDays: 30 };

type SettingsShape = z.infer<typeof SETTINGS_SCHEMA>;

async function loadSettings(): Promise<SettingsShape> {
  const rows = await db.select().from(applicationSettings).where(eq(applicationSettings.key, "collections"));
  const row = rows[0];
  if (!row) return DEFAULTS;
  try {
    const parsed = SETTINGS_SCHEMA.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export default async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/settings/collections", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (_request, reply) => {
    return reply.send({ data: await loadSettings() });
  });

  app.put("/api/v1/settings/collections", { preHandler: [authenticate, requireRoles(...WRITE_ROLES)] }, async (request, reply) => {
    const parsed = SETTINGS_SCHEMA.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid settings data", issues: parsed.error.issues });

    await db
      .insert(applicationSettings)
      .values({ key: "collections", value: JSON.stringify(parsed.data), updatedByUserId: request.currentUser!.id })
      .onConflictDoUpdate({
        target: applicationSettings.key,
        set: { value: JSON.stringify(parsed.data), updatedByUserId: request.currentUser!.id },
      });

    await db.insert(auditLogs).values({
      actorUserId: request.currentUser!.id,
      action: "settings.collections.update",
      entityType: "application_settings",
      entityId: null,
      metadata: parsed.data,
    });

    return reply.send({ data: parsed.data });
  });
}
