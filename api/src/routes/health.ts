import type { FastifyInstance } from "fastify";
import { checkDatabaseConnection } from "../db";

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  });

  app.get("/health/ready", async (_request, reply) => {
    const database = await checkDatabaseConnection();

    if (!database) {
      return reply.code(503).send({
        status: "error",
        database: "unreachable",
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    };
  });
}
