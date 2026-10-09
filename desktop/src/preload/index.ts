import { contextBridge, ipcRenderer } from "electron";
import type {
  AppInfo,
  BcisDesktopApi,
  PingResult,
  SessionStatus,
  LoginRequest,
  DashboardSummaryResponse,
  ReceivablesReportResponse,
  CollectionsReportResponse,
  SubscriberListResponse,
  SubscriberDetailResponse,
  CreateSubscriberRequest,
  UpdateSubscriberRequest,
  SubscriberStatusChangeRequest,
  SubscriberStatusHistoryResponse,
  ServiceAccountListResponse,
  ServiceAccountDetailResponse,
  CreateServiceAccountRequest,
  UpdateServiceAccountRequest,
  ServiceAccountStatusChangeRequest,
  ServiceAccountCollectionAssignmentRequest,
  ServiceListResponse,
  ServiceDetailResponse,
  CreateServiceRequest,
  UpdateServiceRequest,
  ServicePlanListResponse,
  ServicePlanDetailResponse,
  CreatePlanRequest,
  UpdatePlanRequest,
  CollectionAreaListResponse,
  CollectionAreaDetailResponse,
  CreateCollectionAreaRequest,
  UpdateCollectionAreaRequest,
  CollectorListResponse,
  SubscriberStatus,
  ServiceAccountStatus,
  ServiceStatus,
  CollectorStatus,
  CollectionAreaStatus,
  InvoiceListResponse,
  InvoiceDetailResponse,
  InvoiceCreateResponse,
  CreateInvoiceRequest,
  BillingPeriodListResponse,
  BillingPeriodDetailResponse,
  CreateBillingPeriodRequest,
  UpdateBillingPeriodRequest,
  PaymentListResponse,
  PaymentDetailResponse,
  PaymentCreateResponse,
  ReversePaymentResponse,
  VerifyPaymentResponse,
  RejectPaymentResponse,
  CreatePaymentRequest,
  PaymentStatus,
  BackupListResponse,
  BackupDetailResponse,
  ReportExportRequest,
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
  ReceivableInvoicesResponse,
  AgingSummaryResponse,
  SuspensionCandidatesResponse,
  AgingBucketKey,
  SuspendServiceAccountRequest,
  ReconnectServiceAccountRequest,
  SuspensionHistoryResponse,
  ReconnectionHistoryResponse,
  CollectionsSettingsResponse,
  CollectionsSettings,
  UserListResponse,
  RoleListResponse,
  CreateUserRequest,
  UpdateUserRequest,
  UpdateUserRolesRequest,
  ResetPasswordRequest,
  UserDetailResponse,
} from "../shared/types";

const api: BcisDesktopApi = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke("app:get-info"),
  ping: (message: string): Promise<PingResult> => ipcRenderer.invoke("app:ping", message),
  auth: {
    login: (credentials: LoginRequest): Promise<SessionStatus> =>
      ipcRenderer.invoke("auth:login", credentials),
    logout: (): Promise<void> => ipcRenderer.invoke("auth:logout"),
    getSession: (): Promise<SessionStatus> => ipcRenderer.invoke("auth:get-session"),
    refreshSession: (): Promise<SessionStatus> => ipcRenderer.invoke("auth:refresh-session"),
  },
  dashboard: {
    getSummary: (): Promise<DashboardSummaryResponse> => ipcRenderer.invoke("dashboard:get-summary"),
    getReceivables: (): Promise<ReceivablesReportResponse> => ipcRenderer.invoke("dashboard:get-receivables"),
    getCollections: (): Promise<CollectionsReportResponse> => ipcRenderer.invoke("dashboard:get-collections"),
  },
  subscribers: {
    getList: (params: {
      page?: number;
      pageSize?: number;
      accountNumber?: string;
      name?: string;
      email?: string;
      contactNumber?: string;
      status?: SubscriberStatus;
    }): Promise<SubscriberListResponse> => ipcRenderer.invoke("subscribers:get-list", params),
    getById: (id: number): Promise<SubscriberDetailResponse> => ipcRenderer.invoke("subscribers:get-by-id", id),
    create: (data: CreateSubscriberRequest): Promise<SubscriberDetailResponse> => ipcRenderer.invoke("subscribers:create", data),
    update: (id: number, data: UpdateSubscriberRequest): Promise<SubscriberDetailResponse> =>
      ipcRenderer.invoke("subscribers:update", { id, data }),
    changeStatus: (id: number, data: SubscriberStatusChangeRequest): Promise<SubscriberDetailResponse> =>
      ipcRenderer.invoke("subscribers:change-status", { id, data }),
    getStatusHistory: (id: number): Promise<SubscriberStatusHistoryResponse> =>
      ipcRenderer.invoke("subscribers:get-status-history", id),
  },
  serviceAccounts: {
    getList: (params: {
      page?: number;
      pageSize?: number;
      subscriberId?: number;
      serviceId?: number;
      planId?: number;
      serviceNumber?: string;
      collectionAreaId?: number;
      collectorId?: number;
      status?: ServiceAccountStatus;
    }): Promise<ServiceAccountListResponse> => ipcRenderer.invoke("service-accounts:get-list", params),
    getById: (id: number): Promise<ServiceAccountDetailResponse> => ipcRenderer.invoke("service-accounts:get-by-id", id),
    create: (data: CreateServiceAccountRequest): Promise<ServiceAccountDetailResponse> =>
      ipcRenderer.invoke("service-accounts:create", data),
    update: (id: number, data: UpdateServiceAccountRequest): Promise<ServiceAccountDetailResponse> =>
      ipcRenderer.invoke("service-accounts:update", { id, data }),
    changeStatus: (id: number, data: ServiceAccountStatusChangeRequest): Promise<ServiceAccountDetailResponse> =>
      ipcRenderer.invoke("service-accounts:change-status", { id, data }),
    updateCollectionAssignment: (id: number, data: ServiceAccountCollectionAssignmentRequest): Promise<ServiceAccountDetailResponse> =>
      ipcRenderer.invoke("service-accounts:update-collection-assignment", { id, data }),
    suspend: (id: number, data: SuspendServiceAccountRequest): Promise<ServiceAccountDetailResponse & { message?: string }> =>
      ipcRenderer.invoke("service-accounts:suspend", { id, data }),
    reconnect: (id: number, data: ReconnectServiceAccountRequest): Promise<ServiceAccountDetailResponse & { message?: string }> =>
      ipcRenderer.invoke("service-accounts:reconnect", { id, data }),
    getSuspensionHistory: (id: number): Promise<SuspensionHistoryResponse> => ipcRenderer.invoke("service-accounts:get-suspension-history", id),
    getReconnectionHistory: (id: number): Promise<ReconnectionHistoryResponse> => ipcRenderer.invoke("service-accounts:get-reconnection-history", id),
  },
  services: {
    getList: (status?: ServiceStatus): Promise<ServiceListResponse> => ipcRenderer.invoke("services:get-list", status),
    getById: (id: number): Promise<ServiceDetailResponse> => ipcRenderer.invoke("services:get-by-id", id),
    create: (data: CreateServiceRequest): Promise<ServiceDetailResponse> => ipcRenderer.invoke("services:create", data),
    update: (id: number, data: UpdateServiceRequest): Promise<ServiceDetailResponse> =>
      ipcRenderer.invoke("services:update", { id, data }),
  },
  plans: {
    getByService: (serviceId: number, status?: ServiceStatus): Promise<ServicePlanListResponse> =>
      ipcRenderer.invoke("plans:get-by-service", { serviceId, status }),
    getById: (id: number): Promise<ServicePlanDetailResponse> => ipcRenderer.invoke("plans:get-by-id", id),
    create: (serviceId: number, data: CreatePlanRequest): Promise<ServicePlanDetailResponse> =>
      ipcRenderer.invoke("plans:create", { serviceId, data }),
    update: (id: number, data: UpdatePlanRequest): Promise<ServicePlanDetailResponse> =>
      ipcRenderer.invoke("plans:update", { id, data }),
  },
  collectionAreas: {
    getList: (status?: CollectionAreaStatus): Promise<CollectionAreaListResponse> =>
      ipcRenderer.invoke("collection-areas:get-list", status),
    getById: (id: number): Promise<CollectionAreaDetailResponse> => ipcRenderer.invoke("collection-areas:get-by-id", id),
    create: (data: CreateCollectionAreaRequest): Promise<CollectionAreaDetailResponse> =>
      ipcRenderer.invoke("collection-areas:create", data),
    update: (id: number, data: UpdateCollectionAreaRequest): Promise<CollectionAreaDetailResponse> =>
      ipcRenderer.invoke("collection-areas:update", { id, data }),
  },
  collectors: {
    getList: (status?: CollectorStatus): Promise<CollectorListResponse> =>
      ipcRenderer.invoke("collectors:get-list", status),
    getById: (id: number): Promise<CollectorDetailResponse> => ipcRenderer.invoke("collectors:get-by-id", id),
    create: (data: CreateCollectorRequest): Promise<CollectorDetailResponse> => ipcRenderer.invoke("collectors:create", data),
    update: (id: number, data: UpdateCollectorRequest): Promise<CollectorDetailResponse> =>
      ipcRenderer.invoke("collectors:update", { id, data }),
  },
  collectionBatches: {
    getList: (params: { page?: number; pageSize?: number; collectorId?: number; status?: CollectionBatchStatus }): Promise<CollectionBatchListResponse> =>
      ipcRenderer.invoke("collection-batches:get-list", params),
    getById: (id: number): Promise<CollectionBatchDetailResponse> => ipcRenderer.invoke("collection-batches:get-by-id", id),
    create: (data: CreateCollectionBatchRequest): Promise<CollectionBatchDetailResponse> =>
      ipcRenderer.invoke("collection-batches:create", data),
    addPayment: (batchId: number, paymentId: number): Promise<CollectionBatchDetailResponse> =>
      ipcRenderer.invoke("collection-batches:add-payment", { batchId, paymentId }),
    remit: (id: number, data: RemitBatchRequest): Promise<CollectionBatchDetailResponse> =>
      ipcRenderer.invoke("collection-batches:remit", { id, data }),
    reconcile: (id: number): Promise<CollectionBatchDetailResponse> => ipcRenderer.invoke("collection-batches:reconcile", id),
  },
  invoices: {
    getList: (params: {
      page?: number;
      pageSize?: number;
      serviceAccountId?: number;
      subscriberId?: number;
      billingPeriodId?: number;
      invoiceNumber?: string;
      status?: string;
    }): Promise<InvoiceListResponse> => ipcRenderer.invoke("invoices:get-list", params),
    getById: (id: number): Promise<InvoiceDetailResponse> => ipcRenderer.invoke("invoices:get-by-id", id),
    create: (data: CreateInvoiceRequest): Promise<InvoiceCreateResponse> =>
      ipcRenderer.invoke("invoices:create", data),
  },
  billingPeriods: {
    getList: (params: { page?: number; pageSize?: number }): Promise<BillingPeriodListResponse> =>
      ipcRenderer.invoke("billing-periods:get-list", params),
    getById: (id: number): Promise<BillingPeriodDetailResponse> => ipcRenderer.invoke("billing-periods:get-by-id", id),
    create: (data: CreateBillingPeriodRequest): Promise<BillingPeriodDetailResponse> =>
      ipcRenderer.invoke("billing-periods:create", data),
    update: (id: number, data: UpdateBillingPeriodRequest): Promise<BillingPeriodDetailResponse> =>
      ipcRenderer.invoke("billing-periods:update", { id, data }),
  },
  payments: {
    getList: (params: {
      page?: number;
      pageSize?: number;
      serviceAccountId?: number;
      status?: PaymentStatus;
    }): Promise<PaymentListResponse> => ipcRenderer.invoke("payments:get-list", params),
    getById: (id: number): Promise<PaymentDetailResponse> => ipcRenderer.invoke("payments:get-by-id", id),
    create: (data: CreatePaymentRequest): Promise<PaymentCreateResponse> =>
      ipcRenderer.invoke("payments:create", data),
    reverse: (id: number, reason: string): Promise<ReversePaymentResponse> =>
      ipcRenderer.invoke("payments:reverse", { id, reason }),
    verify: (id: number, note?: string): Promise<VerifyPaymentResponse> =>
      ipcRenderer.invoke("payments:verify", { id, note }),
    reject: (id: number, reason: string): Promise<RejectPaymentResponse> =>
      ipcRenderer.invoke("payments:reject", { id, reason }),
  },
  backup: {
    getList: (): Promise<BackupListResponse> => ipcRenderer.invoke("backup:get-list"),
    create: (): Promise<BackupDetailResponse> => ipcRenderer.invoke("backup:create"),
    verify: (id: number): Promise<BackupDetailResponse> => ipcRenderer.invoke("backup:verify", id),
    restore: (id: number): Promise<BackupDetailResponse> => ipcRenderer.invoke("backup:restore", id),
  },
  users: {
    getList: (): Promise<UserListResponse> => ipcRenderer.invoke("users:get-list"),
    getRoles: (): Promise<RoleListResponse> => ipcRenderer.invoke("users:get-roles"),
    create: (data: CreateUserRequest): Promise<UserDetailResponse> => ipcRenderer.invoke("users:create", data),
    update: (id: number, data: UpdateUserRequest): Promise<UserDetailResponse> => ipcRenderer.invoke("users:update", { id, data }),
    updateRoles: (id: number, data: UpdateUserRolesRequest): Promise<UserDetailResponse> =>
      ipcRenderer.invoke("users:update-roles", { id, data }),
    resetPassword: (id: number, data: ResetPasswordRequest): Promise<{ data: { userId: number } }> =>
      ipcRenderer.invoke("users:reset-password", { id, data }),
  },
  settings: {
    getCollections: (): Promise<CollectionsSettingsResponse> => ipcRenderer.invoke("settings:get-collections"),
    updateCollections: (data: CollectionsSettings): Promise<CollectionsSettingsResponse> =>
      ipcRenderer.invoke("settings:update-collections", data),
  },
  receivables: {
    getInvoices: (params: {
      page?: number;
      pageSize?: number;
      serviceAccountId?: number;
      subscriberId?: number;
      overdueOnly?: boolean;
      bucket?: AgingBucketKey;
    }): Promise<ReceivableInvoicesResponse> => ipcRenderer.invoke("receivables:get-invoices", params),
    getAging: (): Promise<AgingSummaryResponse> => ipcRenderer.invoke("receivables:get-aging"),
    getSuspensionCandidates: (): Promise<SuspensionCandidatesResponse> => ipcRenderer.invoke("receivables:get-suspension-candidates"),
  },
  reports: {
    export: (request: ReportExportRequest): Promise<ReportExportResult> => ipcRenderer.invoke("reports:export", request),
    getLedger: (serviceAccountId: number): Promise<LedgerResponse> => ipcRenderer.invoke("reports:get-ledger", serviceAccountId),
    getSoa: (serviceAccountId: number): Promise<SoaResponse> => ipcRenderer.invoke("reports:get-soa", serviceAccountId),
  },
};

contextBridge.exposeInMainWorld("bcis", api);