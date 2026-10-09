import { app, BrowserWindow, ipcMain, safeStorage, dialog } from "electron";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import type {
  AppInfo,
  AuthUser,
  PingResult,
  SessionStatus,
  LoginRequest,
  LoginResponse,
  MeResponse,
  DashboardSummaryResponse,
  ReceivablesReportResponse,
  CollectionsReportResponse,
  SubscriberListResponse,
  SubscriberDetailResponse,
  UpdateSubscriberRequest,
  SubscriberStatusHistoryResponse,
  ServiceAccountListResponse,
  ServiceAccountDetailResponse,
  UpdateServiceAccountRequest,
  ServiceListResponse,
  ServiceDetailResponse,
  UpdateServiceRequest,
  ServicePlanListResponse,
  ServicePlanDetailResponse,
  CreatePlanRequest,
  UpdatePlanRequest,
  CollectionAreaListResponse,
  CollectionAreaDetailResponse,
  UpdateCollectionAreaRequest,
  CollectorListResponse,
  InvoiceListResponse,
  InvoiceDetailResponse,
  InvoiceCreateResponse,
  BillingPeriodListResponse,
  BillingPeriodDetailResponse,
  UpdateBillingPeriodRequest,
  PaymentListResponse,
  PaymentDetailResponse,
  PaymentCreateResponse,
  ReversePaymentResponse,
  VerifyPaymentResponse,
  RejectPaymentResponse,
  PaymentStatus,
  BackupListResponse,
  BackupDetailResponse,
  ReportExportResult,
  LedgerResponse,
  SoaResponse,
  CollectorDetailResponse,
  CreateCollectorRequest,
  UpdateCollectorRequest,
  CollectionBatchListResponse,
  CollectionBatchDetailResponse,
  CreateCollectionBatchRequest,
  RemitBatchRequest,
  CollectionBatchStatus,
  SubscriberStatus,
  ServiceAccountStatus,
  ServiceStatus,
} from "../shared/types";

const IPC_GET_INFO = "app:get-info";
const IPC_PING = "app:ping";
const IPC_AUTH_LOGIN = "auth:login";
const IPC_AUTH_LOGOUT = "auth:logout";
const IPC_AUTH_GET_SESSION = "auth:get-session";
const IPC_AUTH_REFRESH_SESSION = "auth:refresh-session";
const IPC_DASHBOARD_GET_SUMMARY = "dashboard:get-summary";
const IPC_DASHBOARD_GET_RECEIVABLES = "dashboard:get-receivables";
const IPC_DASHBOARD_GET_COLLECTIONS = "dashboard:get-collections";
const IPC_SUBSCRIBERS_GET_LIST = "subscribers:get-list";
const IPC_SUBSCRIBERS_GET_BY_ID = "subscribers:get-by-id";
const IPC_SUBSCRIBERS_CREATE = "subscribers:create";
const IPC_SUBSCRIBERS_UPDATE = "subscribers:update";
const IPC_SUBSCRIBERS_CHANGE_STATUS = "subscribers:change-status";
const IPC_SUBSCRIBERS_GET_STATUS_HISTORY = "subscribers:get-status-history";
const IPC_SERVICE_ACCOUNTS_GET_LIST = "service-accounts:get-list";
const IPC_SERVICE_ACCOUNTS_GET_BY_ID = "service-accounts:get-by-id";
const IPC_SERVICE_ACCOUNTS_CREATE = "service-accounts:create";
const IPC_SERVICE_ACCOUNTS_UPDATE = "service-accounts:update";
const IPC_SERVICE_ACCOUNTS_CHANGE_STATUS = "service-accounts:change-status";
const IPC_SERVICE_ACCOUNTS_UPDATE_COLLECTION_ASSIGNMENT = "service-accounts:update-collection-assignment";
const IPC_SERVICE_ACCOUNTS_SUSPEND = "service-accounts:suspend";
const IPC_SERVICE_ACCOUNTS_RECONNECT = "service-accounts:reconnect";
const IPC_SERVICES_GET_LIST = "services:get-list";
const IPC_SERVICES_GET_BY_ID = "services:get-by-id";
const IPC_SERVICES_CREATE = "services:create";
const IPC_SERVICES_UPDATE = "services:update";
const IPC_PLANS_GET_BY_SERVICE = "plans:get-by-service";
const IPC_PLANS_GET_BY_ID = "plans:get-by-id";
const IPC_PLANS_CREATE = "plans:create";
const IPC_PLANS_UPDATE = "plans:update";
const IPC_COLLECTION_AREAS_GET_LIST = "collection-areas:get-list";
const IPC_COLLECTION_AREAS_GET_BY_ID = "collection-areas:get-by-id";
const IPC_COLLECTION_AREAS_CREATE = "collection-areas:create";
const IPC_COLLECTION_AREAS_UPDATE = "collection-areas:update";
const IPC_COLLECTORS_GET_LIST = "collectors:get-list";
const IPC_COLLECTORS_GET_BY_ID = "collectors:get-by-id";
const IPC_COLLECTORS_CREATE = "collectors:create";
const IPC_COLLECTORS_UPDATE = "collectors:update";
const IPC_COLLECTION_BATCHES_GET_LIST = "collection-batches:get-list";
const IPC_COLLECTION_BATCHES_GET_BY_ID = "collection-batches:get-by-id";
const IPC_COLLECTION_BATCHES_CREATE = "collection-batches:create";
const IPC_COLLECTION_BATCHES_ADD_PAYMENT = "collection-batches:add-payment";
const IPC_COLLECTION_BATCHES_REMIT = "collection-batches:remit";
const IPC_COLLECTION_BATCHES_RECONCILE = "collection-batches:reconcile";
const IPC_INVOICES_GET_LIST = "invoices:get-list";
const IPC_INVOICES_GET_BY_ID = "invoices:get-by-id";
const IPC_INVOICES_CREATE = "invoices:create";
const IPC_BILLING_PERIODS_GET_LIST = "billing-periods:get-list";
const IPC_BILLING_PERIODS_GET_BY_ID = "billing-periods:get-by-id";
const IPC_BILLING_PERIODS_CREATE = "billing-periods:create";
const IPC_BILLING_PERIODS_UPDATE = "billing-periods:update";
const IPC_PAYMENTS_GET_LIST = "payments:get-list";
const IPC_PAYMENTS_GET_BY_ID = "payments:get-by-id";
const IPC_PAYMENTS_CREATE = "payments:create";
const IPC_PAYMENTS_REVERSE = "payments:reverse";
const IPC_PAYMENTS_VERIFY = "payments:verify";
const IPC_PAYMENTS_REJECT = "payments:reject";
const IPC_BACKUP_GET_LIST = "backup:get-list";
const IPC_BACKUP_CREATE = "backup:create";
const IPC_BACKUP_VERIFY = "backup:verify";
const IPC_BACKUP_RESTORE = "backup:restore";
const IPC_REPORTS_EXPORT = "reports:export";
const IPC_REPORTS_GET_LEDGER = "reports:get-ledger";
const IPC_REPORTS_GET_SOA = "reports:get-soa";

const STORE_KEY_TOKEN = "auth_token";
const STORE_KEY_USER = "auth_user";

// Validate and normalize API base URL
function getApiBaseUrl(): string {
  const fromEnv = process.env.VITE_API_BASE_URL ?? "http://localhost:3000";
  let url: URL;
  try {
    url = new URL(fromEnv);
  } catch {
    throw new Error(`Invalid API base URL: ${fromEnv}`);
  }

  // Allow localhost HTTP for development
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  // Require HTTPS for non-localhost
  if (!isLocalhost && url.protocol !== "https:") {
    throw new Error(`API base URL must use HTTPS for non-localhost origins: ${fromEnv}`);
  }

  // Only allow http/https
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`API base URL must use HTTP or HTTPS: ${fromEnv}`);
  }

  return url.toString().replace(/\/$/, "");
}

const API_BASE_URL = getApiBaseUrl();

// Secure storage helpers using Electron safeStorage
function encryptToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure storage encryption is not available on this system");
  }
  const buffer = Buffer.from(token, "utf8");
  const encrypted = safeStorage.encryptString(buffer.toString("utf8"));
  return encrypted.toString("base64");
}

function decryptToken(encryptedBase64: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure storage encryption is not available on this system");
  }
  const encrypted = Buffer.from(encryptedBase64, "base64");
  return safeStorage.decryptString(encrypted);
}

// In-memory store for user identity (not sensitive, but kept in main process)
let memoryStore = new Map<string, unknown>();

function setInMemory(key: string, value: unknown): void {
  memoryStore.set(key, value);
}

function deleteFromMemory(key: string): void {
  memoryStore.delete(key);
}

// Persistent encrypted token storage using electron-store for the encrypted blob
import Store from "electron-store";
const persistentStore = new Store({
  name: "bcis-auth",
  clearInvalidConfig: true,
});

// Helper to make authenticated API requests from main process
async function apiRequest<T>(path: string, options: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload?.message) message = payload.message;
    } catch {
      // keep default message
    }
    const err = new Error(message) as Error & { status: number };
    err.status = response.status;
    throw err;
  }

  return (await response.json()) as T;
}

async function validateToken(token: string): Promise<AuthUser | null> {
  try {
    const response = await apiRequest<MeResponse>("/api/v1/auth/me", {
      method: "GET",
      token,
    });
    return response.user;
  } catch (err) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 401) {
      return null;
    }
    // For other errors (network, 500), don't clear session - just return null to indicate validation failed
    return null;
  }
}

async function getValidatedSession(): Promise<SessionStatus> {
  // Try to get encrypted token from persistent store
  const encryptedToken = persistentStore.get(STORE_KEY_TOKEN);
  if (typeof encryptedToken !== "string" || encryptedToken.length === 0) {
    return { isAuthenticated: false, user: null, isValidating: false };
  }

  let token: string;
  try {
    token = decryptToken(encryptedToken);
  } catch {
    // Decryption failed - clear corrupted data
    persistentStore.delete(STORE_KEY_TOKEN);
    deleteFromMemory(STORE_KEY_USER);
    return { isAuthenticated: false, user: null, isValidating: false };
  }

  // Validate token with API
  const user = await validateToken(token);
  if (user) {
    // Update in-memory user cache
    setInMemory(STORE_KEY_USER, user);
    return { isAuthenticated: true, user, isValidating: false };
  } else {
    // Token invalid or expired - clear everything
    persistentStore.delete(STORE_KEY_TOKEN);
    deleteFromMemory(STORE_KEY_USER);
    return { isAuthenticated: false, user: null, isValidating: false };
  }
}

// Get stored token for dashboard API calls
async function getStoredToken(): Promise<string | undefined> {
  const encryptedToken = persistentStore.get(STORE_KEY_TOKEN);
  if (typeof encryptedToken !== "string" || encryptedToken.length === 0) {
    return undefined;
  }
  try {
    return decryptToken(encryptedToken);
  } catch {
    return undefined;
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: "BCIS Billing",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void mainWindow.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_GET_INFO, (): AppInfo => ({
    appName: app.getName(),
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? "unknown",
    chromeVersion: process.versions.chrome ?? "unknown",
    nodeVersion: process.versions.node ?? "unknown",
    platform: process.platform,
  }));

  ipcMain.handle(IPC_PING, (_event, message: unknown): PingResult => {
    const safeMessage = typeof message === "string" && message.length > 0 ? message : "ping";
    return {
      message: safeMessage,
      pong: true,
      timestamp: new Date().toISOString(),
    };
  });

  // Login: authenticate with API, encrypt and store token, cache user
  ipcMain.handle(IPC_AUTH_LOGIN, async (_event, credentials: unknown): Promise<SessionStatus> => {
    // Validate input
    if (!credentials || typeof credentials !== "object") {
      throw new Error("Invalid credentials");
    }
    const { identifier, password } = credentials as LoginRequest;
    if (typeof identifier !== "string" || typeof password !== "string" || !identifier.trim() || !password.trim()) {
      throw new Error("Identifier and password are required");
    }

    try {
      const response = await apiRequest<LoginResponse>("/api/v1/auth/login", {
        method: "POST",
        body: { identifier: identifier.trim(), password },
      });

      const { token, user } = response;

      // Encrypt and store token
      const encryptedToken = encryptToken(token);
      persistentStore.set(STORE_KEY_TOKEN, encryptedToken);

      // Cache user in memory
      setInMemory(STORE_KEY_USER, user);

      return { isAuthenticated: true, user, isValidating: false };
    } catch (err) {
      // Don't leak error details that could aid enumeration
      if (err instanceof Error && "status" in err && (err as { status: number }).status === 401) {
        throw new Error("Invalid username/email or password");
      }
      throw err;
    }
  });

  // Logout: clear all stored auth data
  ipcMain.handle(IPC_AUTH_LOGOUT, async (): Promise<void> => {
    persistentStore.delete(STORE_KEY_TOKEN);
    deleteFromMemory(STORE_KEY_USER);
  });

  // Get current session status (validates token if present)
  ipcMain.handle(IPC_AUTH_GET_SESSION, async (): Promise<SessionStatus> => {
    return getValidatedSession();
  });

  // Force revalidation of current session
  ipcMain.handle(IPC_AUTH_REFRESH_SESSION, async (): Promise<SessionStatus> => {
    return getValidatedSession();
  });

  // Dashboard API handlers - proxy through main process with stored token
  ipcMain.handle(IPC_DASHBOARD_GET_SUMMARY, async (): Promise<DashboardSummaryResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<DashboardSummaryResponse>("/api/v1/reports/dashboard", {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_DASHBOARD_GET_RECEIVABLES, async (): Promise<ReceivablesReportResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<ReceivablesReportResponse>("/api/v1/reports/receivables", {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_DASHBOARD_GET_COLLECTIONS, async (): Promise<CollectionsReportResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<CollectionsReportResponse>("/api/v1/reports/collections", {
      method: "GET",
      token,
    });
  });

  // Subscriber API handlers
  ipcMain.handle(IPC_SUBSCRIBERS_GET_LIST, async (_event, params: unknown): Promise<SubscriberListResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const p = params as {
      page?: number;
      pageSize?: number;
      accountNumber?: string;
      name?: string;
      email?: string;
      contactNumber?: string;
      status?: SubscriberStatus;
    };
    const query = new URLSearchParams();
    if (p.page) query.set("page", String(p.page));
    if (p.pageSize) query.set("pageSize", String(p.pageSize));
    if (p.accountNumber) query.set("accountNumber", p.accountNumber);
    if (p.name) query.set("name", p.name);
    if (p.email) query.set("email", p.email);
    if (p.contactNumber) query.set("contactNumber", p.contactNumber);
    if (p.status) query.set("status", p.status);
    return apiRequest<SubscriberListResponse>(`/api/v1/subscribers?${query.toString()}`, {
      method: "GET",
      token: await getStoredToken(),
    });
  });

  ipcMain.handle(IPC_SUBSCRIBERS_GET_BY_ID, async (_event, id: unknown): Promise<SubscriberDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<SubscriberDetailResponse>(`/api/v1/subscribers/${id}`, {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_SUBSCRIBERS_CREATE, async (_event, data: unknown): Promise<SubscriberDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<SubscriberDetailResponse>("/api/v1/subscribers", {
      method: "POST",
      token,
      body: data,
    });
  });

  ipcMain.handle(IPC_SUBSCRIBERS_UPDATE, async (_event, payload: unknown): Promise<SubscriberDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { id, data } = payload as { id: number; data: UpdateSubscriberRequest };
    return apiRequest<SubscriberDetailResponse>(`/api/v1/subscribers/${id}`, {
      method: "PATCH",
      token,
      body: data,
    });
  });

  ipcMain.handle(IPC_SUBSCRIBERS_CHANGE_STATUS, async (_event, payload: unknown): Promise<SubscriberDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { id, data } = payload as { id: number; data: { status: SubscriberStatus; reason?: string } };
    return apiRequest<SubscriberDetailResponse>(`/api/v1/subscribers/${id}/status`, {
      method: "PATCH",
      token,
      body: data,
    });
  });

  ipcMain.handle(IPC_SUBSCRIBERS_GET_STATUS_HISTORY, async (_event, id: unknown): Promise<SubscriberStatusHistoryResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<SubscriberStatusHistoryResponse>(`/api/v1/subscribers/${id}/status-history`, {
      method: "GET",
      token,
    });
  });

  // Service Account API handlers
  ipcMain.handle(IPC_SERVICE_ACCOUNTS_GET_LIST, async (_event, params: unknown): Promise<ServiceAccountListResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const p = params as {
      page?: number;
      pageSize?: number;
      subscriberId?: number;
      serviceId?: number;
      planId?: number;
      serviceNumber?: string;
      collectionAreaId?: number;
      collectorId?: number;
      status?: ServiceAccountStatus;
    };
    const query = new URLSearchParams();
    if (p.page) query.set("page", String(p.page));
    if (p.pageSize) query.set("pageSize", String(p.pageSize));
    if (p.subscriberId) query.set("subscriberId", String(p.subscriberId));
    if (p.serviceId) query.set("serviceId", String(p.serviceId));
    if (p.planId) query.set("planId", String(p.planId));
    if (p.serviceNumber) query.set("serviceNumber", p.serviceNumber);
    if (p.collectionAreaId) query.set("collectionAreaId", String(p.collectionAreaId));
    if (p.collectorId) query.set("collectorId", String(p.collectorId));
    if (p.status) query.set("status", p.status);
    return apiRequest<ServiceAccountListResponse>(`/api/v1/service-accounts?${query.toString()}`, {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_SERVICE_ACCOUNTS_GET_BY_ID, async (_event, id: unknown): Promise<ServiceAccountDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<ServiceAccountDetailResponse>(`/api/v1/service-accounts/${id}`, {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_SERVICE_ACCOUNTS_CREATE, async (_event, data: unknown): Promise<ServiceAccountDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<ServiceAccountDetailResponse>("/api/v1/service-accounts", {
      method: "POST",
      token,
      body: data,
    });
  });

  ipcMain.handle(IPC_SERVICE_ACCOUNTS_UPDATE, async (_event, payload: unknown): Promise<ServiceAccountDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { id, data } = payload as { id: number; data: UpdateServiceAccountRequest };
    return apiRequest<ServiceAccountDetailResponse>(`/api/v1/service-accounts/${id}`, {
      method: "PATCH",
      token,
      body: data,
    });
  });

  ipcMain.handle(IPC_SERVICE_ACCOUNTS_CHANGE_STATUS, async (_event, payload: unknown): Promise<ServiceAccountDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { id, data } = payload as { id: number; data: { status: ServiceAccountStatus; reason?: string } };
    return apiRequest<ServiceAccountDetailResponse>(`/api/v1/service-accounts/${id}/status`, {
      method: "PATCH",
      token,
      body: data,
    });
  });

  ipcMain.handle(IPC_SERVICE_ACCOUNTS_UPDATE_COLLECTION_ASSIGNMENT, async (_event, payload: unknown): Promise<ServiceAccountDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { id, data } = payload as { id: number; data: { collectionAreaId?: number | null; collectorId?: number | null } };
    return apiRequest<ServiceAccountDetailResponse>(`/api/v1/service-accounts/${id}/collection-assignment`, {
      method: "PATCH",
      token,
      body: data,
    });
  });

  ipcMain.handle(IPC_SERVICE_ACCOUNTS_SUSPEND, async (_event, payload: unknown): Promise<ServiceAccountDetailResponse & { message?: string }> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { id, reason } = payload as { id: number; reason?: string };
    return apiRequest<ServiceAccountDetailResponse & { message?: string }>(`/api/v1/service-accounts/${id}/suspend`, {
      method: "PATCH",
      token,
      body: { reason },
    });
  });

  ipcMain.handle(IPC_SERVICE_ACCOUNTS_RECONNECT, async (_event, payload: unknown): Promise<ServiceAccountDetailResponse & { message?: string }> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { id, reason } = payload as { id: number; reason?: string };
    return apiRequest<ServiceAccountDetailResponse & { message?: string }>(`/api/v1/service-accounts/${id}/reconnect`, {
      method: "PATCH",
      token,
      body: { reason },
    });
  });

  // Services API handlers
  ipcMain.handle(IPC_SERVICES_GET_LIST, async (_event, status: unknown): Promise<ServiceListResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const query = status ? `?status=${status}` : "";
    return apiRequest<ServiceListResponse>(`/api/v1/services${query}`, {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_SERVICES_GET_BY_ID, async (_event, id: unknown): Promise<ServiceDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<ServiceDetailResponse>(`/api/v1/services/${id}`, {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_SERVICES_CREATE, async (_event, data: unknown): Promise<ServiceDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<ServiceDetailResponse>("/api/v1/services", {
      method: "POST",
      token,
      body: data,
    });
  });

  ipcMain.handle(IPC_SERVICES_UPDATE, async (_event, payload: unknown): Promise<ServiceDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { id, data } = payload as { id: number; data: UpdateServiceRequest };
    return apiRequest<ServiceDetailResponse>(`/api/v1/services/${id}`, {
      method: "PATCH",
      token,
      body: data,
    });
  });

  // Plans API handlers
  ipcMain.handle(IPC_PLANS_GET_BY_SERVICE, async (_event, payload: unknown): Promise<ServicePlanListResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { serviceId, status } = payload as { serviceId: number; status?: ServiceStatus };
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    return apiRequest<ServicePlanListResponse>(`/api/v1/services/${serviceId}/plans?${query.toString()}`, {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_PLANS_GET_BY_ID, async (_event, id: unknown): Promise<ServicePlanDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<ServicePlanDetailResponse>(`/api/v1/service-plans/${id}`, {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_PLANS_CREATE, async (_event, payload: unknown): Promise<ServicePlanDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { serviceId, data } = payload as { serviceId: number; data: CreatePlanRequest };
    return apiRequest<ServicePlanDetailResponse>(`/api/v1/services/${serviceId}/plans`, {
      method: "POST",
      token,
      body: data,
    });
  });

  ipcMain.handle(IPC_PLANS_UPDATE, async (_event, payload: unknown): Promise<ServicePlanDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { id, data } = payload as { id: number; data: UpdatePlanRequest };
    return apiRequest<ServicePlanDetailResponse>(`/api/v1/service-plans/${id}`, {
      method: "PATCH",
      token,
      body: data,
    });
  });

  // Collection Areas API handlers
  ipcMain.handle(IPC_COLLECTION_AREAS_GET_LIST, async (_event, status: unknown): Promise<CollectionAreaListResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const query = status ? `?status=${status}` : "";
    return apiRequest<CollectionAreaListResponse>(`/api/v1/collection-areas${query}`, {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_COLLECTION_AREAS_GET_BY_ID, async (_event, id: unknown): Promise<CollectionAreaDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<CollectionAreaDetailResponse>(`/api/v1/collection-areas/${id}`, {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_COLLECTION_AREAS_CREATE, async (_event, data: unknown): Promise<CollectionAreaDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<CollectionAreaDetailResponse>("/api/v1/collection-areas", {
      method: "POST",
      token,
      body: data,
    });
  });

  ipcMain.handle(IPC_COLLECTION_AREAS_UPDATE, async (_event, payload: unknown): Promise<CollectionAreaDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { id, data } = payload as { id: number; data: UpdateCollectionAreaRequest };
    return apiRequest<CollectionAreaDetailResponse>(`/api/v1/collection-areas/${id}`, {
      method: "PATCH",
      token,
      body: data,
    });
  });

  // Collectors API handlers
  ipcMain.handle(IPC_COLLECTORS_GET_LIST, async (_event, status: unknown): Promise<CollectorListResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const query = status ? `?status=${status}` : "";
    return apiRequest<CollectorListResponse>(`/api/v1/collectors${query}`, {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_COLLECTORS_GET_BY_ID, async (_event, id: unknown): Promise<CollectorDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<CollectorDetailResponse>(`/api/v1/collectors/${id}`, { method: "GET", token });
  });

  ipcMain.handle(IPC_COLLECTORS_CREATE, async (_event, data: unknown): Promise<CollectorDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<CollectorDetailResponse>("/api/v1/collectors", { method: "POST", token, body: data as CreateCollectorRequest });
  });

  ipcMain.handle(IPC_COLLECTORS_UPDATE, async (_event, payload: unknown): Promise<CollectorDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { id, data } = payload as { id: number; data: UpdateCollectorRequest };
    return apiRequest<CollectorDetailResponse>(`/api/v1/collectors/${id}`, { method: "PATCH", token, body: data });
  });

  // Collection Batches API handlers
  ipcMain.handle(IPC_COLLECTION_BATCHES_GET_LIST, async (_event, params: unknown): Promise<CollectionBatchListResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const p = params as { page?: number; pageSize?: number; collectorId?: number; status?: CollectionBatchStatus };
    const query = new URLSearchParams();
    if (p.page) query.set("page", String(p.page));
    if (p.pageSize) query.set("pageSize", String(p.pageSize));
    if (p.collectorId) query.set("collectorId", String(p.collectorId));
    if (p.status) query.set("status", p.status);
    return apiRequest<CollectionBatchListResponse>(`/api/v1/collection-batches?${query.toString()}`, { method: "GET", token });
  });

  ipcMain.handle(IPC_COLLECTION_BATCHES_GET_BY_ID, async (_event, id: unknown): Promise<CollectionBatchDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<CollectionBatchDetailResponse>(`/api/v1/collection-batches/${id}`, { method: "GET", token });
  });

  ipcMain.handle(IPC_COLLECTION_BATCHES_CREATE, async (_event, data: unknown): Promise<CollectionBatchDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<CollectionBatchDetailResponse>("/api/v1/collection-batches", { method: "POST", token, body: data as CreateCollectionBatchRequest });
  });

  ipcMain.handle(IPC_COLLECTION_BATCHES_ADD_PAYMENT, async (_event, payload: unknown): Promise<CollectionBatchDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { batchId, paymentId } = payload as { batchId: number; paymentId: number };
    return apiRequest<CollectionBatchDetailResponse>(`/api/v1/collection-batches/${batchId}/payments`, {
      method: "POST",
      token,
      body: { paymentId },
    });
  });

  ipcMain.handle(IPC_COLLECTION_BATCHES_REMIT, async (_event, payload: unknown): Promise<CollectionBatchDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { id, data } = payload as { id: number; data: RemitBatchRequest };
    return apiRequest<CollectionBatchDetailResponse>(`/api/v1/collection-batches/${id}/remit`, { method: "POST", token, body: data });
  });

  ipcMain.handle(IPC_COLLECTION_BATCHES_RECONCILE, async (_event, id: unknown): Promise<CollectionBatchDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<CollectionBatchDetailResponse>(`/api/v1/collection-batches/${id}/reconcile`, { method: "POST", token });
  });

  // Invoices API handlers
  ipcMain.handle(IPC_INVOICES_GET_LIST, async (_event, params: unknown): Promise<InvoiceListResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const p = params as {
      page?: number;
      pageSize?: number;
      serviceAccountId?: number;
      subscriberId?: number;
      billingPeriodId?: number;
      invoiceNumber?: string;
      status?: string;
    };
    const query = new URLSearchParams();
    if (p.page) query.set("page", String(p.page));
    if (p.pageSize) query.set("pageSize", String(p.pageSize));
    if (p.serviceAccountId) query.set("serviceAccountId", String(p.serviceAccountId));
    if (p.subscriberId) query.set("subscriberId", String(p.subscriberId));
    if (p.billingPeriodId) query.set("billingPeriodId", String(p.billingPeriodId));
    if (p.invoiceNumber) query.set("invoiceNumber", p.invoiceNumber);
    if (p.status) query.set("status", p.status);
    return apiRequest<InvoiceListResponse>(`/api/v1/invoices?${query.toString()}`, {
      method: "GET",
      token: await getStoredToken(),
    });
  });

  ipcMain.handle(IPC_INVOICES_GET_BY_ID, async (_event, id: unknown): Promise<InvoiceDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<InvoiceDetailResponse>(`/api/v1/invoices/${id}`, {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_INVOICES_CREATE, async (_event, data: unknown): Promise<InvoiceCreateResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<InvoiceCreateResponse>("/api/v1/invoices", {
      method: "POST",
      token,
      body: data,
    });
  });

  // Billing Periods API handlers
  ipcMain.handle(IPC_BILLING_PERIODS_GET_LIST, async (_event, params: unknown): Promise<BillingPeriodListResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const p = params as {
      page?: number;
      pageSize?: number;
    };
    const query = new URLSearchParams();
    if (p.page) query.set("page", String(p.page));
    if (p.pageSize) query.set("pageSize", String(p.pageSize));
    return apiRequest<BillingPeriodListResponse>(`/api/v1/billing-periods?${query.toString()}`, {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_BILLING_PERIODS_GET_BY_ID, async (_event, id: unknown): Promise<BillingPeriodDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<BillingPeriodDetailResponse>(`/api/v1/billing-periods/${id}`, {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_BILLING_PERIODS_CREATE, async (_event, data: unknown): Promise<BillingPeriodDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<BillingPeriodDetailResponse>("/api/v1/billing-periods", {
      method: "POST",
      token,
      body: data,
    });
  });

  ipcMain.handle(IPC_BILLING_PERIODS_UPDATE, async (_event, payload: unknown): Promise<BillingPeriodDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { id, data } = payload as { id: number; data: UpdateBillingPeriodRequest };
    return apiRequest<BillingPeriodDetailResponse>(`/api/v1/billing-periods/${id}`, {
      method: "PATCH",
      token,
      body: data,
    });
  });

  // Payments API handlers
  ipcMain.handle(IPC_PAYMENTS_GET_LIST, async (_event, params: unknown): Promise<PaymentListResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const p = params as {
      page?: number;
      pageSize?: number;
      serviceAccountId?: number;
      status?: PaymentStatus;
    };
    const query = new URLSearchParams();
    if (p.page) query.set("page", String(p.page));
    if (p.pageSize) query.set("pageSize", String(p.pageSize));
    if (p.serviceAccountId) query.set("serviceAccountId", String(p.serviceAccountId));
    if (p.status) query.set("status", p.status);
    return apiRequest<PaymentListResponse>(`/api/v1/payments?${query.toString()}`, {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_PAYMENTS_GET_BY_ID, async (_event, id: unknown): Promise<PaymentDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<PaymentDetailResponse>(`/api/v1/payments/${id}`, {
      method: "GET",
      token,
    });
  });

  ipcMain.handle(IPC_PAYMENTS_CREATE, async (_event, data: unknown): Promise<PaymentCreateResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<PaymentCreateResponse>("/api/v1/payments", {
      method: "POST",
      token,
      body: data,
    });
  });

  ipcMain.handle(IPC_PAYMENTS_REVERSE, async (_event, payload: unknown): Promise<ReversePaymentResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { id, reason } = payload as { id: number; reason: string };
    return apiRequest<ReversePaymentResponse>(`/api/v1/payments/${id}/reverse`, {
      method: "POST",
      token,
      body: { reason },
    });
  });

  ipcMain.handle(IPC_PAYMENTS_VERIFY, async (_event, payload: unknown): Promise<VerifyPaymentResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { id, note } = payload as { id: number; note?: string };
    return apiRequest<VerifyPaymentResponse>(`/api/v1/payments/${id}/verify`, {
      method: "POST",
      token,
      body: note !== undefined ? { note } : {},
    });
  });

  ipcMain.handle(IPC_PAYMENTS_REJECT, async (_event, payload: unknown): Promise<RejectPaymentResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { id, reason } = payload as { id: number; reason: string };
    return apiRequest<RejectPaymentResponse>(`/api/v1/payments/${id}/reject`, {
      method: "POST",
      token,
      body: { reason },
    });
  });

  // Backup API handlers — Owner-only on the server regardless of what the
  // renderer shows.
  ipcMain.handle(IPC_BACKUP_GET_LIST, async (): Promise<BackupListResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<BackupListResponse>("/api/v1/backup", { method: "GET", token });
  });

  ipcMain.handle(IPC_BACKUP_CREATE, async (): Promise<BackupDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<BackupDetailResponse>("/api/v1/backup", { method: "POST", token });
  });

  ipcMain.handle(IPC_BACKUP_VERIFY, async (_event, id: unknown): Promise<BackupDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<BackupDetailResponse>(`/api/v1/backup/${id}/verify`, { method: "POST", token });
  });

  ipcMain.handle(IPC_BACKUP_RESTORE, async (_event, id: unknown): Promise<BackupDetailResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<BackupDetailResponse>(`/api/v1/backup/${id}/restore`, {
      method: "POST",
      token,
      body: { confirm: true },
    });
  });

  // Report export: fetches a binary PDF/XLSX from the API (not JSON, so it
  // bypasses apiRequest) and prompts the user for a save location. Returns
  // null if the user cancels the save dialog — that is not an error.
  ipcMain.handle(IPC_REPORTS_EXPORT, async (_event, payload: unknown): Promise<ReportExportResult> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    const { path, format, suggestedName } = payload as { path: string; format: "pdf" | "xlsx"; suggestedName: string };

    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      let message = `Export failed with status ${response.status}`;
      try {
        const body = (await response.json()) as { message?: string };
        if (body?.message) message = body.message;
      } catch {
        // keep default message
      }
      throw new Error(message);
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    const result = await dialog.showSaveDialog({
      defaultPath: suggestedName,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (result.canceled || !result.filePath) {
      return { savedPath: null };
    }
    await writeFile(result.filePath, buffer);
    return { savedPath: result.filePath };
  });

  ipcMain.handle(IPC_REPORTS_GET_LEDGER, async (_event, serviceAccountId: unknown): Promise<LedgerResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<LedgerResponse>(`/api/v1/reports/ledger/${serviceAccountId}`, { method: "GET", token });
  });

  ipcMain.handle(IPC_REPORTS_GET_SOA, async (_event, serviceAccountId: unknown): Promise<SoaResponse> => {
    const token = await getStoredToken();
    if (!token) {
      throw new Error("No valid session");
    }
    return apiRequest<SoaResponse>(`/api/v1/reports/soa/${serviceAccountId}`, { method: "GET", token });
  });
}

void app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.bcis.desktop");

  app.on("browser-window-created", (_event, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});