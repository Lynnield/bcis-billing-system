export interface AppInfo {
  appName: string;
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  platform: string;
}

export interface PingResult {
  message: string;
  pong: true;
  timestamp: string;
}

/**
 * User identity returned by the Fastify API.
 * Matches the AuthUser interface from api/src/lib/auth.ts
 */
export interface AuthUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  roles: string[];
}

/** Request payload for POST /api/v1/auth/login */
export interface LoginRequest {
  identifier: string;
  password: string;
}

/** Response payload for POST /api/v1/auth/login */
export interface LoginResponse {
  token: string;
  user: AuthUser;
}

/** Response payload for GET /api/v1/auth/me */
export interface MeResponse {
  user: AuthUser;
}

/** Session status returned to renderer */
export interface SessionStatus {
  isAuthenticated: boolean;
  user: AuthUser | null;
  isValidating: boolean;
}

// Dashboard/Report API response types (matching backend reports.ts)

// Receivables Report
export interface ReceivablesReportResponse {
  data: {
    totalOutstandingBalance: string;
    outstandingInvoiceCount: number;
    overdueBalance: string;
    overdueInvoiceCount: number;
    serviceAccountCountWithOutstandingBalance: number;
    agingBuckets: Record<string, string>;
  };
  meta: { basis: string };
}

// Aging Report
export interface AgingBucket {
  count: number;
  amount: string;
}

export interface AgingReportResponse {
  data: {
    buckets: Record<string, AgingBucket>;
    totalInvoiceCount: number;
    totalOutstandingAmount: string;
  };
  meta: { basis: string };
}

// Collections Report
export interface CollectionsReportResponse {
  data: {
    range: { dateFrom: string | null; dateTo: string | null; paymentMethod: string | null };
    totalCollected: string;
    paymentCount: number;
    byPaymentMethod: Array<{ method: string; total: string; count: number }>;
    byCollector: Array<{ collectorId: number; collectorName: string; total: string; count: number }>;
    payments: Array<{
      id: number;
      serviceAccountId: number;
      amount: string;
      method: string;
      paymentDate: string;
      receiptNumber: string | null;
      referenceNumber: string | null;
      collectorId: number | null;
      collectorName: string | null;
    }>;
  };
  meta: { basis: string; reversedPaymentsExcluded: boolean };
}

// Dashboard Summary (from /api/v1/reports/dashboard)
export interface DashboardSummaryResponse {
  data: {
    activeSubscribers: number;
    activeServiceAccounts: number;
    pendingInstallations: number;
    totalOutstandingAr: string;
    totalOverdueAr: string;
    overdueInvoiceCount: number;
    currentMonthInvoiceTotal: string;
    currentMonthPostedCollectionTotal: string;
    currentMonthPaymentCount: number;
    openCollectionBatches: number;
    remittanceShortageTotal: string;
    remittanceOverageTotal: string;
    suspensionCandidateCount: number;
    agingBuckets: Record<string, string>;
  };
  meta: { today: string; monthStart: string };
}

// Subscriber types (matching api/src/routes/subscribers.ts)
export type SubscriberStatus = "active" | "inactive" | "suspended" | "disconnected" | "pending";

export interface Subscriber {
  id: number;
  accountNumber: string;
  firstName: string;
  lastName: string;
  contactNumber: string | null;
  email: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  status: SubscriberStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriberListResponse {
  data: Subscriber[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface SubscriberDetailResponse {
  data: Subscriber;
}

export interface CreateSubscriberRequest {
  accountNumber: string;
  firstName: string;
  lastName: string;
  contactNumber?: string;
  email?: string;
  addressLine1: string;
  addressLine2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  status?: SubscriberStatus;
}

export interface UpdateSubscriberRequest {
  firstName?: string;
  lastName?: string;
  contactNumber?: string | null;
  email?: string | null;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
}

export interface SubscriberStatusChangeRequest {
  status: SubscriberStatus;
  reason?: string;
}

export interface SubscriberStatusHistoryEntry {
  id: number;
  oldStatus: SubscriberStatus | null;
  newStatus: SubscriberStatus;
  note: string | null;
  createdAt: string;
  changedBy: string | null;
}

export interface SubscriberStatusHistoryResponse {
  data: SubscriberStatusHistoryEntry[];
}

// Service Account types (matching api/src/routes/service-accounts.ts)
export type ServiceAccountStatus = "active" | "inactive" | "suspended" | "disconnected" | "pending_installation";

export interface ServiceAccountListItem {
  id: number;
  serviceNumber: string;
  status: ServiceAccountStatus;
  activatedAt: string | null;
  subscriberId: number;
  planId: number;
  serviceId: number;
  collectionAreaId: number | null;
  assignedCollectorId: number | null;
  createdAt: string;
}

export interface ServiceAccountListResponse {
  data: ServiceAccountListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ServiceAccountDetail {
  id: number;
  serviceNumber: string;
  status: ServiceAccountStatus;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  subscriber: {
    id: number;
    accountNumber: string;
    firstName: string;
    lastName: string;
    status: SubscriberStatus;
  };
  plan: {
    id: number;
    name: string;
    price: string;
    status: string;
  };
  service: {
    id: number;
    type: string;
    name: string;
  };
  collectionArea: {
    id: number;
    name: string;
  } | null;
  collector: {
    id: number;
    fullName: string;
  } | null;
}

export interface ServiceAccountDetailResponse {
  data: ServiceAccountDetail;
}

export interface CreateServiceAccountRequest {
  subscriberId: number;
  planId: number;
  serviceNumber: string;
  status?: ServiceAccountStatus;
  collectionAreaId?: number;
  assignedCollectorId?: number;
}

export interface UpdateServiceAccountRequest {
  planId?: number;
  status?: ServiceAccountStatus;
  activatedAt?: string | null;
}

export interface ServiceAccountStatusChangeRequest {
  status: ServiceAccountStatus;
  reason?: string;
}

export interface ServiceAccountCollectionAssignmentRequest {
  collectionAreaId?: number | null;
  collectorId?: number | null;
}

// Service types (matching api/src/routes/services.ts)
export type ServiceType = "internet" | "cable" | "combo";
export type ServiceStatus = "active" | "inactive";

export interface Service {
  id: number;
  type: ServiceType;
  name: string;
  description: string | null;
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceListResponse {
  data: Service[];
}

export interface ServiceDetailResponse {
  data: Service;
}

export interface CreateServiceRequest {
  type: ServiceType;
  name: string;
  description?: string;
  status?: ServiceStatus;
}

export interface UpdateServiceRequest {
  type?: ServiceType;
  name?: string;
  description?: string | null;
  status?: ServiceStatus;
}

// Service Plan types
export interface ServicePlan {
  id: number;
  serviceId: number;
  name: string;
  description: string | null;
  price: string;
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ServicePlanListResponse {
  data: ServicePlan[];
}

export interface ServicePlanDetailResponse {
  data: ServicePlan;
}

export interface CreatePlanRequest {
  name: string;
  description?: string;
  price: string; // priceSchema: non-negative amount with up to 2 decimal places
  status?: ServiceStatus;
}

export interface UpdatePlanRequest {
  name?: string;
  description?: string | null;
  price?: string;
  status?: ServiceStatus;
}

// Collection Area types (matching api/src/routes/collections.ts)
export type CollectionAreaStatus = "active" | "inactive";

export interface CollectionArea {
  id: number;
  name: string;
  description: string | null;
  status: CollectionAreaStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionAreaListResponse {
  data: CollectionArea[];
}

export interface CollectionAreaDetailResponse {
  data: CollectionArea;
}

export interface CreateCollectionAreaRequest {
  name: string;
  description?: string;
  status?: CollectionAreaStatus;
}

export interface UpdateCollectionAreaRequest {
  name?: string;
  description?: string | null;
  status?: CollectionAreaStatus;
}

// Collector types (for service account assignment)
export type CollectorStatus = "active" | "inactive";

export interface Collector {
  id: number;
  fullName: string;
  contactNumber: string | null;
  status: CollectorStatus;
  collectionAreaId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectorListResponse {
  data: Collector[];
}

export interface CollectorDetailResponse {
  data: Collector;
}

export interface CreateCollectorRequest {
  fullName: string;
  contactNumber?: string;
  collectionAreaId?: number;
  status?: CollectorStatus;
}

export interface UpdateCollectorRequest {
  fullName?: string;
  contactNumber?: string | null;
  collectionAreaId?: number | null;
  status?: CollectorStatus;
}

// Collection batches (matching api/src/routes/collection-batches.ts)
export type CollectionBatchStatus = "open" | "closed" | "remitted" | "reconciled";

export interface CollectionBatch {
  id: number;
  collectorId: number;
  batchDate: string;
  status: CollectionBatchStatus;
  expectedAmount: string;
  remittedAmount: string;
  shortageAmount: string;
  overageAmount: string;
  reconciliationNotes: string | null;
  reconciledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionBatchPaymentRow {
  paymentId: number;
  amount: string;
  method: string;
  status: string;
  paymentDate: string;
  serviceAccountId: number;
}

export interface CollectionBatchDetail extends CollectionBatch {
  collector: { id: number; fullName: string; status: CollectorStatus } | null;
  payments: CollectionBatchPaymentRow[];
  expectedAmountComputed: string;
}

export interface CollectionBatchListResponse {
  data: CollectionBatch[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface CollectionBatchDetailResponse {
  data: CollectionBatchDetail;
}

export interface CreateCollectionBatchRequest {
  collectorId: number;
  batchDate: string;
}

export interface RemitBatchRequest {
  remittedAmount: string;
  reconciliationNotes?: string;
}

// Billing Period types (matching api/src/routes/billing-periods.ts)
export interface BillingPeriod {
  id: number;
  label: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingPeriodListResponse {
  data: BillingPeriod[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface BillingPeriodDetailResponse {
  data: BillingPeriod;
}

export interface CreateBillingPeriodRequest {
  label: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
}

export interface UpdateBillingPeriodRequest {
  label?: string;
  periodStart?: string;
  periodEnd?: string;
  dueDate?: string;
}

// Invoice types (matching api/src/routes/invoices.ts)
export type InvoiceStatus = "unpaid" | "partially_paid" | "paid" | "overdue" | "void";

export interface InvoiceLineItem {
  id: number;
  invoiceId: number;
  description: string;
  quantity: number;
  unitPrice: string;
  amount: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceAdjustment {
  id: number;
  invoiceId: number;
  type: "debit" | "credit";
  amount: string;
  reason: string;
  createdByUserId: number;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: number;
  invoiceNumber: string;
  status: InvoiceStatus;
  totalAmount: string;
  issueDate: string;
  dueDate: string;
  serviceAccountId: number;
  billingPeriodId: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceListItem {
  id: number;
  invoiceNumber: string;
  status: InvoiceStatus;
  totalAmount: string;
  issueDate: string;
  dueDate: string;
  serviceAccountId: number;
  billingPeriodId: number;
  subscriberId: number;
}

export interface InvoiceListResponse {
  data: InvoiceListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface InvoiceDetail {
  id: number;
  invoiceNumber: string;
  status: InvoiceStatus;
  totalAmount: string;
  issueDate: string;
  dueDate: string;
  serviceAccountId: number;
  billingPeriodId: number;
  createdAt: string;
  updatedAt: string;
  context: {
    accountNumber: string;
    subscriberId: number;
    firstName: string;
    lastName: string;
    serviceNumber: string;
    planName: string;
    serviceName: string;
    periodLabel: string;
  };
  lineItems: InvoiceLineItem[];
  adjustments: InvoiceAdjustment[];
  subtotal: string;
  adjustmentsTotal: string;
}

export interface InvoiceDetailResponse {
  data: InvoiceDetail;
}

export interface InvoiceListResponse {
  data: InvoiceListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateInvoiceRequest {
  serviceAccountId: number;
  billingPeriodId: number;
  invoiceNumber: string;
  issueDate?: string;
  dueDate?: string;
  quantity?: number;
  additionalLineItems?: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
  }>;
  adjustments?: Array<{
    type: "debit" | "credit";
    amount: string;
    reason: string;
  }>;
}

export interface InvoiceCreateResponse {
  data: InvoiceDetail;
}

export interface InvoiceStatusChangeRequest {
  status: InvoiceStatus;
  reason?: string;
}

// Payment types (matching api/src/routes/payments.ts). Amounts are always
// decimal strings, never JavaScript numbers — the API does exact-cents math
// server-side and the desktop must never re-derive totals client-side.
export type PaymentMethod = "cash" | "gcash" | "bank_transfer" | "cheque" | "other";
export type PaymentStatus = "pending" | "posted" | "reversed" | "cancelled";
export type GcashVerificationStatus = "pending" | "verified" | "rejected";

export interface Payment {
  id: number;
  serviceAccountId: number;
  method: PaymentMethod;
  amount: string;
  paymentDate: string;
  receiptNumber: string | null;
  referenceNumber: string | null;
  status: PaymentStatus;
  postedByUserId: number | null;
  postedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentListResponse {
  data: Payment[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface PaymentAllocation {
  id: number;
  paymentId: number;
  invoiceId: number;
  amount: string;
  createdAt: string;
}

export interface PaymentReversal {
  id: number;
  paymentId: number;
  reason: string;
  reversedByUserId: number | null;
  reversedAt: string;
}

export interface GcashPaymentDetail {
  id: number;
  paymentId: number;
  gcashReferenceNumber: string;
  proofAttachmentPath: string | null;
  verificationStatus: GcashVerificationStatus;
  verifiedByUserId: number | null;
  verifiedAt: string | null;
  verificationNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentDetail extends Payment {
  allocations: PaymentAllocation[];
  reversal: PaymentReversal | null;
  gcash: GcashPaymentDetail | null;
  unappliedAmount: string;
}

export interface PaymentDetailResponse {
  data: PaymentDetail;
}

export interface CreatePaymentRequest {
  serviceAccountId: number;
  amount: string;
  method: PaymentMethod;
  paymentDate?: string;
  receiptNumber?: string;
  referenceNumber?: string;
  gcash?: {
    gcashReferenceNumber: string;
    proofAttachmentPath?: string;
  };
}

// POST /api/v1/payments returns a lighter allocation shape (no id/createdAt)
// than GET /api/v1/payments/:id — kept as a distinct type to match the API.
export interface PaymentPostResult extends Payment {
  allocations: Array<{ invoiceId: number; amount: string }>;
  unappliedAmount: string;
}

export interface PaymentCreateResponse {
  data: PaymentPostResult;
}

export interface ReversePaymentRequest {
  reason: string;
}

export interface ReversePaymentResponse {
  data: {
    paymentId: number;
    status: "reversed";
  };
}

// GCash verification/rejection (matching api/src/routes/payments.ts
// POST /payments/:id/verify and /:id/reject). Verify returns the same
// lightweight allocation shape as creating a payment; reject returns a
// paymentId/status pair like reversal does.
export interface VerifyPaymentRequest {
  note?: string;
}

export interface VerifyPaymentResponse {
  data: PaymentPostResult;
}

export interface RejectPaymentRequest {
  reason: string;
}

export interface RejectPaymentResponse {
  data: {
    paymentId: number;
    status: "cancelled";
  };
}

// Subscriber ledger and Statement of Account (matching
// GET /api/v1/reports/ledger/:serviceAccountId and /soa/:serviceAccountId).
export interface LedgerEntryDto {
  date: string;
  type: string;
  reference: string;
  description: string;
  debit: string;
  credit: string;
  runningBalance: string;
}

export interface LedgerResponse {
  data: {
    serviceAccount: { id: number; serviceNumber: string; status: string; subscriberId: number; subscriberName: string };
    entries: LedgerEntryDto[];
    closingBalance: string;
  };
  meta: { basis: string };
}

export interface SoaOutstandingInvoice {
  invoiceId: number;
  invoiceNumber: string;
  totalAmount: string;
  allocated: string;
  balance: string;
  dueDate: string;
  daysOverdue: number;
  bucket: string;
}

export interface SoaResponse {
  data: {
    subscriber: { id: number; accountNumber: string; name: string; email: string | null; contactNumber: string | null };
    serviceAccount: { id: number; serviceNumber: string; status: string };
    service: { name: string; type: string };
    plan: { name: string; price: string };
    outstandingInvoices: SoaOutstandingInvoice[];
    recentPayments: Array<{ id: number; amount: string; method: string; status: string; paymentDate: string; receiptNumber: string | null }>;
    totals: { outstandingBalance: string; overdueBalance: string; aging: Record<string, string> };
  };
  meta: { generatedAt: string; basis: string };
}

// Backup & restore (matching api/src/routes/backup.ts). Owner-only.
export type BackupStatus = "completed" | "verified" | "failed" | "restored";

export interface BackupRecord {
  id: number;
  filename: string;
  sizeBytes: number;
  checksumSha256: string;
  status: BackupStatus;
  createdByUserId: number | null;
  createdAt: string;
  verifiedAt: string | null;
  restoredAt: string | null;
  restoredByUserId: number | null;
}

export interface BackupListResponse {
  data: BackupRecord[];
}

export interface BackupDetailResponse {
  data: BackupRecord;
}

// Report export (matching the new GET /api/v1/reports/*/export routes).
// The main process fetches the binary and prompts for a save location;
// the renderer only knows which API path to ask for.
export type ReportExportFormat = "pdf" | "xlsx";

export interface ReportExportRequest {
  path: string;
  format: ReportExportFormat;
  suggestedName: string;
}

export interface ReportExportResult {
  savedPath: string | null;
}

/**
 * Narrow, typed boundary exposed to the renderer via contextBridge.
 * The renderer must NEVER get direct access to ipcRenderer, Node APIs,
 * or the database. All privileged work happens in the main process or
 * goes through the Fastify API over HTTP.
 */
export interface BcisDesktopApi {
  getAppInfo: () => Promise<AppInfo>;
  ping: (message: string) => Promise<PingResult>;
  auth: {
    /** Attempt login with credentials. Returns session status on success. */
    login: (credentials: LoginRequest) => Promise<SessionStatus>;
    /** Logout: clear stored session and return to unauthenticated state. */
    logout: () => Promise<void>;
    /** Get current session status (validates token if present). */
    getSession: () => Promise<SessionStatus>;
    /** Force revalidation of current session with the API. */
    refreshSession: () => Promise<SessionStatus>;
  };
  dashboard: {
    /** Get dashboard summary KPI data */
    getSummary: () => Promise<DashboardSummaryResponse>;
    /** Get receivables report data */
    getReceivables: () => Promise<ReceivablesReportResponse>;
    /** Get collections report data */
    getCollections: () => Promise<CollectionsReportResponse>;
  };
  subscribers: {
    /** Get paginated list of subscribers */
    getList: (params: {
      page?: number;
      pageSize?: number;
      accountNumber?: string;
      name?: string;
      email?: string;
      contactNumber?: string;
      status?: SubscriberStatus;
    }) => Promise<SubscriberListResponse>;
    /** Get subscriber by ID */
    getById: (id: number) => Promise<SubscriberDetailResponse>;
    /** Create new subscriber */
    create: (data: CreateSubscriberRequest) => Promise<SubscriberDetailResponse>;
    /** Update subscriber */
    update: (id: number, data: UpdateSubscriberRequest) => Promise<SubscriberDetailResponse>;
    /** Change subscriber status */
    changeStatus: (id: number, data: SubscriberStatusChangeRequest) => Promise<SubscriberDetailResponse>;
    /** Get subscriber status history */
    getStatusHistory: (id: number) => Promise<SubscriberStatusHistoryResponse>;
  };
  serviceAccounts: {
    /** Get paginated list of service accounts */
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
    }) => Promise<ServiceAccountListResponse>;
    /** Get service account by ID */
    getById: (id: number) => Promise<ServiceAccountDetailResponse>;
    /** Create new service account */
    create: (data: CreateServiceAccountRequest) => Promise<ServiceAccountDetailResponse>;
    /** Update service account */
    update: (id: number, data: UpdateServiceAccountRequest) => Promise<ServiceAccountDetailResponse>;
    /** Change service account status */
    changeStatus: (id: number, data: ServiceAccountStatusChangeRequest) => Promise<ServiceAccountDetailResponse>;
    /** Update collection assignment */
    updateCollectionAssignment: (id: number, data: ServiceAccountCollectionAssignmentRequest) => Promise<ServiceAccountDetailResponse>;
    /** Suspend service account */
    suspend: (id: number, reason?: string) => Promise<ServiceAccountDetailResponse & { message?: string }>;
    /** Reconnect service account */
    reconnect: (id: number, reason?: string) => Promise<ServiceAccountDetailResponse & { message?: string }>;
  };
  services: {
    /** Get all services */
    getList: (status?: ServiceStatus) => Promise<ServiceListResponse>;
    /** Get service by ID */
    getById: (id: number) => Promise<ServiceDetailResponse>;
    /** Create new service */
    create: (data: CreateServiceRequest) => Promise<ServiceDetailResponse>;
    /** Update service */
    update: (id: number, data: UpdateServiceRequest) => Promise<ServiceDetailResponse>;
  };
  plans: {
    /** Get plans for a service */
    getByService: (serviceId: number, status?: ServiceStatus) => Promise<ServicePlanListResponse>;
    /** Get plan by ID */
    getById: (id: number) => Promise<ServicePlanDetailResponse>;
    /** Create new plan for a service */
    create: (serviceId: number, data: CreatePlanRequest) => Promise<ServicePlanDetailResponse>;
    /** Update plan */
    update: (id: number, data: UpdatePlanRequest) => Promise<ServicePlanDetailResponse>;
  };
  collectionAreas: {
    /** Get all collection areas */
    getList: (status?: CollectionAreaStatus) => Promise<CollectionAreaListResponse>;
    /** Get collection area by ID */
    getById: (id: number) => Promise<CollectionAreaDetailResponse>;
    /** Create new collection area */
    create: (data: CreateCollectionAreaRequest) => Promise<CollectionAreaDetailResponse>;
    /** Update collection area */
    update: (id: number, data: UpdateCollectionAreaRequest) => Promise<CollectionAreaDetailResponse>;
  };
  collectors: {
    /** Get all collectors */
    getList: (status?: CollectorStatus) => Promise<CollectorListResponse>;
    /** Get collector by ID */
    getById: (id: number) => Promise<CollectorDetailResponse>;
    /** Create a new collector */
    create: (data: CreateCollectorRequest) => Promise<CollectorDetailResponse>;
    /** Update a collector */
    update: (id: number, data: UpdateCollectorRequest) => Promise<CollectorDetailResponse>;
  };
  collectionBatches: {
    /** Get paginated list of collection batches */
    getList: (params: { page?: number; pageSize?: number; collectorId?: number; status?: CollectionBatchStatus }) => Promise<CollectionBatchListResponse>;
    /** Get a batch with its collector and assigned payments */
    getById: (id: number) => Promise<CollectionBatchDetailResponse>;
    /** Create a new OPEN batch for a collector */
    create: (data: CreateCollectionBatchRequest) => Promise<CollectionBatchDetailResponse>;
    /** Add a posted payment to an open batch */
    addPayment: (batchId: number, paymentId: number) => Promise<CollectionBatchDetailResponse>;
    /** Record the collector's remittance; computes shortage/overage automatically */
    remit: (id: number, data: RemitBatchRequest) => Promise<CollectionBatchDetailResponse>;
    /** Close out a remitted batch after reviewing any shortage/overage */
    reconcile: (id: number) => Promise<CollectionBatchDetailResponse>;
  };
  invoices: {
    /** Get paginated list of invoices */
    getList: (params: {
      page?: number;
      pageSize?: number;
      serviceAccountId?: number;
      subscriberId?: number;
      billingPeriodId?: number;
      invoiceNumber?: string;
      status?: InvoiceStatus;
    }) => Promise<InvoiceListResponse>;
    /** Get invoice by ID with full detail */
    getById: (id: number) => Promise<InvoiceDetailResponse>;
    /** Create new invoice */
    create: (data: CreateInvoiceRequest) => Promise<InvoiceCreateResponse>;
  };
  billingPeriods: {
    /** Get paginated list of billing periods */
    getList: (params: { page?: number; pageSize?: number }) => Promise<BillingPeriodListResponse>;
    /** Get billing period by ID */
    getById: (id: number) => Promise<BillingPeriodDetailResponse>;
    /** Create new billing period */
    create: (data: CreateBillingPeriodRequest) => Promise<BillingPeriodDetailResponse>;
    /** Update billing period */
    update: (id: number, data: UpdateBillingPeriodRequest) => Promise<BillingPeriodDetailResponse>;
  };
  payments: {
    /** Get paginated list of payments */
    getList: (params: {
      page?: number;
      pageSize?: number;
      serviceAccountId?: number;
      status?: PaymentStatus;
    }) => Promise<PaymentListResponse>;
    /** Get payment by ID with allocations, reversal, and GCash detail */
    getById: (id: number) => Promise<PaymentDetailResponse>;
    /** Post a new payment (oldest-first allocation is computed by the API) */
    create: (data: CreatePaymentRequest) => Promise<PaymentCreateResponse>;
    /** Reverse a posted payment. Requires a reason; never edits or deletes the original row. */
    reverse: (id: number, reason: string) => Promise<ReversePaymentResponse>;
    /** Verify a pending GCash payment, posting and allocating it. Optional note. */
    verify: (id: number, note?: string) => Promise<VerifyPaymentResponse>;
    /** Reject a pending GCash payment. Requires a reason; creates no allocations. */
    reject: (id: number, reason: string) => Promise<RejectPaymentResponse>;
  };
  backup: {
    /** List backup history, newest first. */
    getList: () => Promise<BackupListResponse>;
    /** Run pg_dump and record the result. */
    create: () => Promise<BackupDetailResponse>;
    /** Verify a backup file's checksum and internal structure without touching any database. */
    verify: (id: number) => Promise<BackupDetailResponse>;
    /** Restore a backup, replacing the live database. Requires explicit confirmation. */
    restore: (id: number) => Promise<BackupDetailResponse>;
  };
  reports: {
    /** Fetch a report as PDF/XLSX and prompt the user to save it. savedPath is null if the user cancels. */
    export: (request: ReportExportRequest) => Promise<ReportExportResult>;
    /** Full chronological ledger with running balance for one service account. */
    getLedger: (serviceAccountId: number) => Promise<LedgerResponse>;
    /** Statement of Account (outstanding invoices + totals) for one service account. */
    getSoa: (serviceAccountId: number) => Promise<SoaResponse>;
  };
}