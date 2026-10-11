import { describe, it, expect } from "vitest";
import { normalizeServerUrl } from "../src/main/server-url";

describe("normalizeServerUrl", () => {
  it("accepts plain http on this PC and private office-LAN addresses", () => {
    expect(normalizeServerUrl("http://localhost:3000/")).toBe("http://localhost:3000");
    expect(normalizeServerUrl("http://192.168.1.10:3000")).toBe("http://192.168.1.10:3000");
    expect(normalizeServerUrl("http://10.0.0.5:3000")).toBe("http://10.0.0.5:3000");
    expect(normalizeServerUrl("http://172.20.1.2:3000")).toBe("http://172.20.1.2:3000");
    expect(normalizeServerUrl("http://bcis-server.local:3000")).toBe("http://bcis-server.local:3000");
  });

  it("rejects plain http to a public address", () => {
    expect(() => normalizeServerUrl("http://8.8.8.8:3000")).toThrow(/https/);
    expect(() => normalizeServerUrl("http://example.com")).toThrow(/https/);
    expect(() => normalizeServerUrl("http://172.32.0.1")).toThrow(/https/);
  });

  it("accepts https anywhere, rejects other schemes, credentials and junk", () => {
    expect(normalizeServerUrl("https://billing.example.com")).toBe("https://billing.example.com");
    expect(() => normalizeServerUrl("ftp://192.168.1.10")).toThrow();
    expect(() => normalizeServerUrl("http://user:pw@192.168.1.10:3000")).toThrow();
    expect(() => normalizeServerUrl("not a url")).toThrow();
  });
});
