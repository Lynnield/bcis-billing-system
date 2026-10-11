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
  /** Permission codes from the server (spec 4.4); absent on stale sessions. */
  permissions?: string[];
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
    // Spec 4.3 panels; omitted for roles without payment.view (Technician).
    billingVsCollection?: Array<{ month: string; billed: string; collected: string }>;
    paymentMethodMix?: Array<{ method: string; total: string; count: number }>;
    collectorPerformance?: Array<{ collectorId: number; collectorName: string; batches: number; collected: string; accounts: number; shortage: string }>;
    overdueAlerts?: Array<{ serviceAccountId: number; serviceNumber: string; name: string; daysOverdue: number; overdueBalance: string }>;
    recentPayments?: Array<{ id: number; receiptNumber: string | null; amount: string; method: string; status: string; postedAt: string; serviceNumber: string; name: string }>;
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
  notes: string | null;
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
  notes?: string;
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
  notes?: string | null;
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
  installationAddress: string | null;
  billingStartDate: string | null;
  billingDueDay: number | null;
  /** Account-specific monthly rate; null = plan price. */
  currentRate: string | null;
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
    code: string | null;
    name: string;
    price: string;
    installationFee: string;
    reconnectionFee: string;
    speedMbps: number | null;
    channelCount: number | null;
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
  installationAddress?: string;
  billingStartDate?: string;
  billingDueDay?: number;
  currentRate?: string;
}

export interface UpdateServiceAccountRequest {
  planId?: number;
  status?: ServiceAccountStatus;
  activatedAt?: string | null;
  installationAddress?: string | null;
  billingStartDate?: string | null;
  billingDueDay?: number | null;
  currentRate?: string | null;
}

export interface ServiceHistoryEntry {
  id: number;
  at: string;
  action: string;
  metadata: Record<string, unknown> | null;
  actorName: string | null;
}

export interface ServiceAccountStatusChangeRequest {
  status: ServiceAccountStatus;
  reason?: string;
}

export interface ServiceAccountCollectionAssignmentRequest {
  collectionAreaId?: number | null;
  collectorId?: number | null;
}

// Suspension & reconnection history (matching the suspension_records /
// reconnection_records tables added for spec 3.10).
export interface SuspensionRecord {
  id: number;
  serviceAccountId: number;
  reason: string | null;
  effectiveDate: string;
  approvedByUserId: number | null;
  notes: string | null;
  createdAt: string;
}

export interface SuspensionHistoryResponse {
  data: SuspensionRecord[];
}

export type ReconnectionRecordStatus = "requested" | "completed";

export interface ReconnectionRecord {
  id: number;
  serviceAccountId: number;
  fee: string;
  technicianUserId: number | null;
  requestDate: string;
  completionDate: string | null;
  status: ReconnectionRecordStatus;
  notes: string | null;
  requestedByUserId: number | null;
  completedByUserId: number | null;
  billedInvoiceId: number | null;
  createdAt: string;
}

export interface ReconnectionHistoryResponse {
  data: ReconnectionRecord[];
}

export interface SuspendServiceAccountRequest {
  reason?: string;
  notes?: string;
}

export interface ReconnectServiceAccountRequest {
  reason?: string;
  /** Defaults to the plan's reconnection fee. */
  fee?: string;
  technicianUserId?: number;
  notes?: string;
  /** Reconnect immediately instead of raising a field request. */
  completeNow?: boolean;
  /** Owner/Admin only, reason required: reconnect despite an overdue balance. */
  overrideUnpaid?: boolean;
}

// Collections settings (matching api/src/routes/settings.ts)
export interface CollectionsSettings {
  gracePeriodDays: number;
  suspensionThresholdDays: number;
}

export interface CollectionsSettingsResponse {
  data: CollectionsSettings;
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
  code: string | null;
  name: string;
  description: string | null;
  price: string;
  installationFee: string;
  reconnectionFee: string;
  speedMbps: number | null;
  channelCount: number | null;
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
  code?: string;
  name: string;
  description?: string;
  price: string; // priceSchema: non-negative amount with up to 2 decimal places
  installationFee?: string;
  reconnectionFee?: string;
  speedMbps?: number | null;
  channelCount?: number | null;
  status?: ServiceStatus;
}

export interface UpdatePlanRequest {
  code?: string | null;
  name?: string;
  description?: string | null;
  price?: string;
  installationFee?: string;
  reconnectionFee?: string;
  speedMbps?: number | null;
  channelCount?: number | null;
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
export type CollectionBatchStatus = "open" | "in_progress" | "submitted" | "remitted" | "reconciled" | "closed";

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
  expectedReceivable: string;
  submittedAt: string | null;
  reconciledAt: string | null;
  reconciledByUserId: number | null;
  closedAt: string | null;
  closedByUserId: number | null;
  closingNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionBatchSummary {
  expectedReceivable: string;
  cashCollected: string;
  nonCashCollected: string;
  uncollected: string;
  accountsOnRoute: number;
  accountsCollected: number;
  expectedCash: string;
  remittedCash: string | null;
  difference: string | null;
}

export interface ReconcileBatchRequest {
  acknowledgeDifference?: boolean;
  notes?: string;
}

export interface CloseBatchRequest {
  confirm: true;
  notes?: string;
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
  routeAccounts: Array<{ serviceAccountId: number; serviceNumber: string; balanceDue: string }>;
  expectedAmountComputed: string;
  summary: CollectionBatchSummary;
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
export type InvoiceStatus = "draft" | "unpaid" | "partially_paid" | "paid" | "overdue" | "void" | "credited";

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
  voidReason: string | null;
  voidedAt: string | null;
  finalizedAt: string | null;
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
  /** Omit to let the server assign the next INV- number. */
  invoiceNumber?: string;
  asDraft?: boolean;
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

export interface InvoiceAdjustmentRequest {
  type: "debit" | "credit";
  amount: string;
  reason: string;
}

export interface GenerateBillingRequest {
  asDraft?: boolean;
  dryRun?: boolean;
}

export interface GenerateBillingResponse {
  data: {
    periodId?: number;
    dryRun?: boolean;
    wouldBill?: number;
    created?: number;
    invoices?: Array<{ serviceAccountId: number; invoiceId: number }>;
    skipped?: Array<{ serviceAccountId: number; serviceNumber: string; reason: string }>;
  };
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
  proofAttachmentPath: string | null;
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

export interface AuditLogRow {
  id: number;
  createdAt: string;
  actorUserId: number | null;
  actorUsername: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditLogQuery {
  page?: number;
  pageSize?: number;
  actorUserId?: number;
  action?: string;
  entityType?: string;
  entityId?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface AuditLogListResponse {
  data: AuditLogRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ReportCatalogEntry {
  slug: string;
  title: string;
  description: string;
  params: Array<"dateFrom" | "dateTo" | "period" | "groupBy" | "collectorId" | "collectionAreaId">;
}

export interface ReportRunParams {
  dateFrom?: string;
  dateTo?: string;
  period?: "day" | "week" | "month" | "year";
  groupBy?: "plan" | "service" | "area";
  collectorId?: number;
  collectionAreaId?: number;
}

export interface ReportRunResult {
  title: string;
  subtitle: string;
  columns: Array<{ key: string; header: string; align?: "left" | "right" | "center" }>;
  rows: Array<Record<string, string | number>>;
  totals?: Record<string, string | number>;
}

export interface PermissionMatrix {
  permissions: Array<{ code: string; group: string; description: string }>;
  roles: Array<{ id: number; name: string; permissions: string[] }>;
}

export interface SearchHit {
  kind: "service_account" | "invoice" | "payment";
  matchedOn: string;
  reference: string;
  subscriberId: number;
  subscriberName: string;
  accountNumber: string;
  serviceAccountId: number;
  serviceNumber: string;
  serviceStatus: string;
  planName: string;
  invoiceId?: number;
  paymentId?: number;
}

export interface AllocationPreview {
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  allocations: Array<{
    invoiceId: number;
    invoiceNumber: string;
    dueDate: string;
    balance: string;
    applied: string;
    remainingBalance: string;
    statusAfter: string;
  }>;
  unapplied: string;
}

export interface AccountReceivableSummary {
  serviceAccount: { id: number; serviceNumber: string; status: string; subscriberId: number; accountNumber: string; firstName: string; lastName: string };
  outstandingInvoiceCount: number;
  overdueInvoiceCount: number;
  outstandingBalance: string;
  overdueBalance: string;
  invoices: Array<{ invoiceId: number; invoiceNumber: string; status: string; totalAmount: string; allocated: string; balance: string; dueDate: string }>;
}

export interface SubscriberDocument {
  id: number;
  paymentId: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  receiptNumber: string | null;
  method: string;
  amount: string;
}

export interface PaymentProofSummary {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

export interface PaymentProofUploadResult {
  data: PaymentProofSummary & { paymentId: number | null };
  /** Other proofs with byte-identical content — a possible duplicate submission. */
  duplicates: Array<{ proofId: number; paymentId: number | null }>;
}

export interface PaymentProofPreview {
  mimeType: string;
  /** data: URL for images; null for PDFs (open externally instead). */
  dataUrl: string | null;
}

export interface PaymentDetail extends Payment {
  allocations: PaymentAllocation[];
  reversal: PaymentReversal | null;
  gcash: GcashPaymentDetail | null;
  proofs: Array<PaymentProofSummary & { duplicates: Array<{ proofId: number; paymentId: number | null }> }>;
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
  proofAttachmentPath?: string;
  /** Uploaded proof from paymentProofs.upload() (non-GCash methods). */
  proofId?: number;
  gcash?: {
    gcashReferenceNumber: string;
    proofAttachmentPath?: string;
    proofId?: number;
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

// User management (matching api/src/routes/users.ts). Owner-only writes.
export type UserAccountStatus = "active" | "inactive";

export interface Role {
  id: number;
  name: string;
  description: string | null;
}

export interface RoleListResponse {
  roles: Role[];
}

export interface UserListRow {
  id: number;
  username: string;
  email: string;
  fullName: string;
  status: UserAccountStatus;
  roles: string[];
  lastLoginAt: string | null;
  /** Set only while a failed-login lock is in force. */
  lockedUntil: string | null;
  createdAt: string;
}

export interface UserListResponse {
  users: UserListRow[];
}

export interface UserDetail {
  id: number;
  username: string;
  email: string;
  fullName: string;
  status: UserAccountStatus;
  lastLoginAt: string | null;
  createdAt: string;
  roles: Role[];
}

export interface UserDetailResponse {
  data: UserDetail;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  fullName: string;
  password: string;
  roleIds: number[];
}

export interface UpdateUserRequest {
  email?: string;
  fullName?: string;
  status?: UserAccountStatus;
}

export interface UpdateUserRolesRequest {
  roleIds: number[];
}

export interface ResetPasswordRequest {
  password: string;
}

// Receivables (matching api/src/routes/receivables.ts)
// Named AgingBucketKey, distinct from the pre-existing AgingBucket interface
// above (the {count, amount} shape) — this is the bucket label itself.
export type AgingBucketKey = "current" | "1-30" | "31-60" | "61-90" | "90+";

export interface OutstandingInvoiceRow {
  invoiceId: number;
  invoiceNumber: string;
  status: string;
  totalAmount: string;
  allocated: string;
  balance: string;
  dueDate: string;
  daysOverdue: number;
  bucket: AgingBucketKey;
  serviceAccountId: number;
  subscriberId: number;
}

export interface ReceivableInvoicesResponse {
  data: OutstandingInvoiceRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface AgingSummaryResponse {
  data: {
    buckets: Record<AgingBucketKey, { count: number; amount: string }>;
    total: { count: number; amount: string };
  };
}

export interface SuspensionCandidate {
  serviceAccountId: number;
  subscriberId: number;
  overdueBalance: string;
  overdueInvoiceCount: number;
  oldestOverdueDays: number;
  oldestOverdueInvoice: string;
}

export interface SuspensionCandidatesResponse {
  data: SuspensionCandidate[];
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
  server: {
    /** The API server address this client is using. */
    getUrl: () => Promise<string>;
    /** Validate, health-check and save a new API server address. */
    setUrl: (url: string) => Promise<string>;
  };
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
    /** Suspend service account; writes a suspension_records row */
    suspend: (id: number, data: SuspendServiceAccountRequest) => Promise<ServiceAccountDetailResponse & { message?: string }>;
    /** Reconnect service account; writes a reconnection_records row */
    reconnect: (id: number, data: ReconnectServiceAccountRequest) => Promise<ServiceAccountDetailResponse & { message?: string; reconnection?: ReconnectionRecord }>;
    /** Mark a requested reconnection completed (activates the account). */
    completeReconnection: (id: number, reconnectionId: number, notes?: string) => Promise<ServiceAccountDetailResponse>;
    /** All recorded changes to the account (spec 3.10 service history). */
    getHistory: (id: number) => Promise<{ data: ServiceHistoryEntry[] }>;
    /** Suspension history, newest first */
    getSuspensionHistory: (id: number) => Promise<SuspensionHistoryResponse>;
    /** Reconnection history, newest first */
    getReconnectionHistory: (id: number) => Promise<ReconnectionHistoryResponse>;
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
    /** Collector turned in: no more collections can be recorded */
    submit: (id: number) => Promise<CollectionBatchDetailResponse>;
    /** Reconcile a remitted batch; a shortage/overage must be acknowledged with notes */
    reconcile: (id: number, data: ReconcileBatchRequest) => Promise<CollectionBatchDetailResponse>;
    /** Final authorized sign-off on a reconciled batch */
    close: (id: number, data: CloseBatchRequest) => Promise<CollectionBatchDetailResponse>;
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
    /** Finalize a DRAFT invoice so it becomes billable */
    finalize: (id: number) => Promise<InvoiceDetailResponse>;
    /** Void an invoice with no posted payments (reason required) */
    void: (id: number, reason: string) => Promise<InvoiceDetailResponse>;
    /** Controlled post-issue debit/credit adjustment */
    adjust: (id: number, data: InvoiceAdjustmentRequest) => Promise<InvoiceDetailResponse>;
    /** Sweep past-due open invoices to OVERDUE */
    markOverdue: () => Promise<{ data: { changed: number } }>;
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
    /** Bill every active, not-yet-billed service account for the period */
    generate: (id: number, data: GenerateBillingRequest) => Promise<GenerateBillingResponse>;
  };
  payments: {
    /** Get paginated list of payments */
    getList: (params: {
      page?: number;
      pageSize?: number;
      serviceAccountId?: number;
      subscriberId?: number;
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
    /** Read-only oldest-first allocation preview for an amount. */
    previewAllocation: (serviceAccountId: number, amount: string) => Promise<{ data: AllocationPreview }>;
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
  users: {
    /** List all users with their roles. Owner/Administrator. */
    getList: () => Promise<UserListResponse>;
    /** List all roles. Owner/Administrator. */
    getRoles: () => Promise<RoleListResponse>;
    /** Create a user with an initial role set. Owner only. */
    create: (data: CreateUserRequest) => Promise<UserDetailResponse>;
    /** Update a user's profile/status. Owner only. */
    update: (id: number, data: UpdateUserRequest) => Promise<UserDetailResponse>;
    /** Replace a user's role assignments. Owner only. */
    updateRoles: (id: number, data: UpdateUserRolesRequest) => Promise<UserDetailResponse>;
    /** Reset a user's password. Owner only. */
    resetPassword: (id: number, data: ResetPasswordRequest) => Promise<{ data: { userId: number } }>;
    /** Clear a failed-login lock. Owner only. */
    unlock: (id: number) => Promise<{ data: { userId: number } }>;
  };
  settings: {
    /** Read the configurable grace period / suspension threshold. */
    getCollections: () => Promise<CollectionsSettingsResponse>;
    /** Update the configurable grace period / suspension threshold. Owner/Administrator only. */
    updateCollections: (data: CollectionsSettings) => Promise<CollectionsSettingsResponse>;
  };
  receivables: {
    /** Outstanding invoices with optional overdueOnly/bucket/account filters. */
    getInvoices: (params: {
      page?: number;
      pageSize?: number;
      serviceAccountId?: number;
      subscriberId?: number;
      overdueOnly?: boolean;
      bucket?: AgingBucketKey;
    }) => Promise<ReceivableInvoicesResponse>;
    /** AR aging bucket totals. */
    getAging: () => Promise<AgingSummaryResponse>;
    /** Accounts with at least one overdue invoice, oldest-first. */
    getSuspensionCandidates: () => Promise<SuspensionCandidatesResponse>;
    /** Balance summary and open invoices for one service account. */
    getAccount: (serviceAccountId: number) => Promise<{ data: AccountReceivableSummary }>;
  };
  audit: {
    /** Read-only audit trail (Owner, Accounting / Auditor). */
    getList: (params: AuditLogQuery) => Promise<AuditLogListResponse>;
    getActions: () => Promise<{ data: string[] }>;
  };
  permissions: {
    /** Role/permission matrix (user.view). */
    getMatrix: () => Promise<{ data: PermissionMatrix }>;
    /** Replace one role's permissions (user.manage, audited). */
    updateRole: (roleId: number, permissions: string[]) => Promise<{ data: { roleId: number; permissions: string[] } }>;
  };
  search: {
    /** Global search: account no., name, contact, address, invoice no., receipt no., GCash ref. */
    query: (q: string) => Promise<{ data: SearchHit[] }>;
  };
  reports: {
    /** Fetch a report as PDF/XLSX and prompt the user to save it. savedPath is null if the user cancels. */
    export: (request: ReportExportRequest) => Promise<ReportExportResult>;
    /** Full chronological ledger with running balance for one service account. */
    getLedger: (serviceAccountId: number) => Promise<LedgerResponse>;
    /** Statement of Account (outstanding invoices + totals) for one service account. */
    getSoa: (serviceAccountId: number) => Promise<SoaResponse>;
    /** Management reports this user may run (spec 3.11). */
    getCatalog: () => Promise<{ data: ReportCatalogEntry[] }>;
    /** Run a management report for on-screen display. */
    run: (slug: string, params: ReportRunParams) => Promise<{ data: ReportRunResult }>;
  };
  paymentProofs: {
    /** Pick a PNG/JPEG/WEBP/PDF (max 5 MB) and upload it to the server. Null if cancelled. */
    upload: () => Promise<PaymentProofUploadResult | null>;
    /** Fetch a proof for in-app preview (images only render inline). */
    getPreview: (id: number) => Promise<PaymentProofPreview>;
    /** Open a proof (e.g. a PDF) in the system viewer. */
    open: (id: number) => Promise<void>;
    /** All proofs attached to one subscriber's payments. */
    listBySubscriber: (subscriberId: number) => Promise<{ data: SubscriberDocument[] }>;
  };
}