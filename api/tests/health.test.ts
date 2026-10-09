import { describe, it, expect, afterAll, afterEach } from "vitest";
import { buildApp } from "../src/app";
import { pool } from "../src/db";
import type { FastifyInstance } from "fastify";

describe("health routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("GET /health returns a healthy JSON response", async () => {
    app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
  });

  it("GET /health/ready reports database connectivity", async () => {
    app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health/ready" });

    const body = response.json();
    if (response.statusCode === 200) {
      expect(body.status).toBe("ok");
      expect(body.database).toBe("connected");
    } else {
      expect(response.statusCode).toBe(503);
      expect(body.database).toBe("unreachable");
    }
  });
});
