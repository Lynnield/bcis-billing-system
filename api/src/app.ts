import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import jwt from "@fastify/jwt";
import { env } from "./config/env";
import healthRoutes from "./routes/health";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import subscriberRoutes from "./routes/subscribers";
import serviceRoutes from "./routes/services";
import collectionRoutes from "./routes/collections";
import serviceAccountRoutes from "./routes/service-accounts";
import billingPeriodRoutes from "./routes/billing-periods";
import invoiceRoutes from "./routes/invoices";
import paymentRoutes from "./routes/payments";
import paymentProofRoutes from "./routes/payment-proofs";
import collectionBatchRoutes from "./routes/collection-batches";
import receivableRoutes from "./routes/receivables";
import reportRoutes from "./routes/reports";
import backupRoutes from "./routes/backup";
import settingsRoutes from "./routes/settings";
import searchRoutes from "./routes/search";
import auditRoutes from "./routes/audit";
import managementReportRoutes from "./routes/management-reports";
import type { AuthUser } from "./lib/auth";
import { syncPermissions } from "./lib/permissions";

declare module "fastify" {
  interface FastifyRequest {
    currentUser: AuthUser | null;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  app.decorateRequest("currentUser", null);
  await syncPermissions();

  await app.register(cors, { origin: true });
  await app.register(sensible);
  await app.register(jwt, { secret: env.JWT_SECRET });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(subscriberRoutes);
  await app.register(serviceRoutes);
  await app.register(collectionRoutes);
  await app.register(serviceAccountRoutes);
  await app.register(billingPeriodRoutes);
  await app.register(invoiceRoutes);
  await app.register(paymentRoutes);
  await app.register(paymentProofRoutes);
  await app.register(collectionBatchRoutes);
  await app.register(receivableRoutes);
  await app.register(reportRoutes);
  await app.register(backupRoutes);
  await app.register(settingsRoutes);
  await app.register(searchRoutes);
  await app.register(auditRoutes);
  await app.register(managementReportRoutes);

  return app;
}
