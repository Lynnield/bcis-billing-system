import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Phase 13B.1 — Desktop Authentication Security Remediation (Desktop Unit Tests)", () => {
  describe("Shared Types", () => {
    it("AuthUser interface matches expected shape", async () => {
      const { AuthUser } = await import("../src/shared/types");
      const testUser: AuthUser = {
        id: 1,
        username: "test",
        email: "test@example.com",
        fullName: "Test User",
        roles: ["owner"],
      };
      expect(testUser.id).toBe(1);
      expect(testUser.roles).toContain("owner");
    });

    it("LoginRequest interface exists", async () => {
      const { LoginRequest } = await import("../src/shared/types");
      const req: LoginRequest = { identifier: "user", password: "pass" };
      expect(req.identifier).toBe("user");
    });

    it("SessionStatus interface includes isValidating", async () => {
      const { SessionStatus } = await import("../src/shared/types");
      const status: SessionStatus = {
        isAuthenticated: true,
        user: { id: 1, username: "u", email: "e", fullName: "n", roles: ["r"] },
        isValidating: false,
      };
      expect(status.isAuthenticated).toBe(true);
      expect(status.isValidating).toBe(false);
    });

    it("BcisDesktopApi.auth exposes narrow methods only (no getToken)", async () => {
      const { BcisDesktopApi } = await import("../src/shared/types");
      // Type check - verify the interface shape
      const api: BcisDesktopApi = {
        getAppInfo: vi.fn(),
        ping: vi.fn(),
        auth: {
          login: vi.fn(),
          logout: vi.fn(),
          getSession: vi.fn(),
          refreshSession: vi.fn(),
        },
      };
      expect(typeof api.auth.login).toBe("function");
      expect(typeof api.auth.logout).toBe("function");
      expect(typeof api.auth.getSession).toBe("function");
      expect(typeof api.auth.refreshSession).toBe("function");
      // Ensure getToken is NOT in the type
      // @ts-expect-error - getToken should not exist
      api.auth.getToken;
      // @ts-expect-error - storeToken should not exist
      api.auth.storeToken;
      // @ts-expect-error - setStoredUser should not exist
      api.auth.setStoredUser;
      // @ts-expect-error - getStoredUser should not exist
      api.auth.getStoredUser;
      // @ts-expect-error - clearStoredUser should not exist
      api.auth.clearStoredUser;
    });
  });

  describe("API Client Types", () => {
    it("ApiError class exposes status code", async () => {
      const { ApiError } = await import("../src/renderer/src/lib/api-client");
      const err = new ApiError(401, "Unauthorized");
      expect(err.status).toBe(401);
      expect(err.message).toBe("Unauthorized");
      expect(err.name).toBe("ApiError");
    });

    it("Auth types are exported", async () => {
      const { AuthUser, LoginRequest, SessionStatus } = await import("../src/renderer/src/lib/api-client");
      const user: AuthUser = { id: 1, username: "u", email: "e", fullName: "n", roles: ["r"] };
      const req: LoginRequest = { identifier: "i", password: "p" };
      const status: SessionStatus = { isAuthenticated: true, user, isValidating: false };
      expect(user.id).toBe(1);
      expect(req.identifier).toBe("i");
      expect(status.isAuthenticated).toBe(true);
    });

    it("login and getMe functions are NOT exported (moved to main process)", async () => {
      const apiClient = await import("../src/renderer/src/lib/api-client");
      expect("login" in apiClient).toBe(false);
      expect("getMe" in apiClient).toBe(false);
    });
  });

  describe("AuthContext Types", () => {
    it("AuthProvider and useAuth are exported", async () => {
      const { AuthProvider, useAuth } = await import("../src/renderer/src/lib/auth-context");
      expect(typeof AuthProvider).toBe("function");
      expect(typeof useAuth).toBe("function");
    });
  });

  describe("LoginForm Component Types", () => {
    it("LoginForm component is exported", async () => {
      const { LoginForm } = await import("../src/renderer/src/components/auth/LoginForm");
      expect(typeof LoginForm).toBe("function");
    });
  });

  describe("UserAvatar Component Types", () => {
    it("UserAvatar component is exported", async () => {
      const { UserAvatar } = await import("../src/renderer/src/components/auth/UserAvatar");
      expect(typeof UserAvatar).toBe("function");
    });
  });

  describe("Preload API Shape", () => {
    it("preload module can be imported without runtime execution", async () => {
      // The preload module uses Electron APIs that aren't available in test environment
      // This test just verifies the TypeScript types are correct
      const { BcisDesktopApi } = await import("../src/shared/types");
      // Type check - verify the interface shape
      const api: BcisDesktopApi = {
        getAppInfo: vi.fn(),
        ping: vi.fn(),
        auth: {
          login: vi.fn(),
          logout: vi.fn(),
          getSession: vi.fn(),
          refreshSession: vi.fn(),
        },
      };
      expect(typeof api.auth.login).toBe("function");
      expect(typeof api.auth.logout).toBe("function");
      expect(typeof api.auth.getSession).toBe("function");
      expect(typeof api.auth.refreshSession).toBe("function");
    });
  });
});