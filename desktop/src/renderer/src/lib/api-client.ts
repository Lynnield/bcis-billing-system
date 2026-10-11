/**
 * Typed foundation for talking to the existing Fastify API.
 * Renderer fetches go through this client only; the renderer never
 * touches PostgreSQL directly.
 */

const DEFAULT_API_BASE_URL = "http://localhost:3000";

export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return (fromEnv && fromEnv.trim().length > 0 ? fromEnv : DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload?.message) message = payload.message;
    } catch {
      // keep default message
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export function getHealth(context?: { signal?: AbortSignal }): Promise<HealthResponse> {
  return apiRequest<HealthResponse>("/health", { signal: context?.signal });
}

// Auth types (mirroring API contracts)
export interface AuthUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  roles: string[];
  /** Permission codes from the server (spec 4.4); absent on stale sessions. */
  permissions?: string[];
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface MeResponse {
  user: AuthUser;
}

export interface SessionStatus {
  isAuthenticated: boolean;
  user: AuthUser | null;
  isValidating: boolean;
}