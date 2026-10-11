import { relations, sql } from "drizzle-orm";
import {
  bigserial,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userStatusEnum = pgEnum("user_status", ["active", "inactive"]);

export const subscriberStatusEnum = pgEnum("subscriber_status", [
  "active",
  "inactive",
  "suspended",
  "disconnected",
  "pending",
]);

export const serviceTypeEnum = pgEnum("service_type", ["internet", "cable", "combo"]);

export const recordStatusEnum = pgEnum("record_status", ["active", "inactive"]);

export const serviceAccountStatusEnum = pgEnum("service_account_status", [
  "active",
  "inactive",
  "suspended",
  "disconnected",
  "pending_installation",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "unpaid",
  "partially_paid",
  "paid",
  "overdue",
  "void",
  "credited",
]);

export const adjustmentTypeEnum = pgEnum("adjustment_type", ["debit", "credit"]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "gcash",
  "bank_transfer",
  "cheque",
  "other",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "posted",
  "reversed",
  "cancelled",
]);

export const gcashVerificationStatusEnum = pgEnum("gcash_verification_status", [
  "pending",
  "verified",
  "rejected",
]);

export const collectionBatchStatusEnum = pgEnum("collection_batch_status", [
  "open",
  "closed",
  "remitted",
  "reconciled",
]);

// ---------------------------------------------------------------------------
// Users & Security
// ---------------------------------------------------------------------------

export const roles = pgTable("roles", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [uniqueIndex("roles_name_unique").on(t.name)]);

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  username: varchar("username", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  status: userStatusEnum("status").notNull().default("active"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("users_username_unique").on(t.username),
  uniqueIndex("users_email_unique").on(t.email),
]);

export const userRoles = pgTable("user_roles", {
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: bigint("role_id", { mode: "number" }).notNull().references(() => roles.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [
  unique("user_roles_pkey").on(t.userId, t.roleId),
  index("user_roles_role_id_idx").on(t.roleId),
]);

// ---------------------------------------------------------------------------
// Subscribers
// ---------------------------------------------------------------------------

export const subscribers = pgTable("subscribers", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  accountNumber: varchar("account_number", { length: 50 }).notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  contactNumber: varchar("contact_number", { length: 50 }),
  email: varchar("email", { length: 255 }),
  addressLine1: varchar("address_line1", { length: 255 }).notNull(),
  addressLine2: varchar("address_line2", { length: 255 }),
  city: varchar("city", { length: 100 }),
  province: varchar("province", { length: 100 }),
  postalCode: varchar("postal_code", { length: 20 }),
  status: subscriberStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("subscribers_account_number_unique").on(t.accountNumber),
  index("subscribers_status_idx").on(t.status),
  index("subscribers_name_idx").on(t.lastName, t.firstName),
]);

export const subscriberStatusHistory = pgTable("subscriber_status_history", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  subscriberId: bigint("subscriber_id", { mode: "number" }).notNull().references(() => subscribers.id, { onDelete: "cascade" }),
  oldStatus: subscriberStatusEnum("old_status"),
  newStatus: subscriberStatusEnum("new_status").notNull(),
  changedByUserId: bigint("changed_by_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [index("subscriber_status_history_subscriber_id_idx").on(t.subscriberId)]);

// ---------------------------------------------------------------------------
// Services & Plans
// ---------------------------------------------------------------------------

export const services = pgTable("services", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  type: serviceTypeEnum("type").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  status: recordStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("services_name_unique").on(t.name)]);

export const servicePlans = pgTable("service_plans", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  serviceId: bigint("service_id", { mode: "number" }).notNull().references(() => services.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  price: numeric("price", { precision: 14, scale: 2 }).notNull(),
  status: recordStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [
  unique("service_plans_service_name_unique").on(t.serviceId, t.name),
  index("service_plans_service_id_idx").on(t.serviceId),
  check("service_plans_price_non_negative", sql`${t.price} >= 0`),
]);

// ---------------------------------------------------------------------------
// Collection areas & collectors
// ---------------------------------------------------------------------------

export const collectionAreas = pgTable("collection_areas", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  status: recordStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [uniqueIndex("collection_areas_name_unique").on(t.name)]);

export const collectors = pgTable("collectors", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  contactNumber: varchar("contact_number", { length: 50 }),
  collectionAreaId: bigint("collection_area_id", { mode: "number" }).references(() => collectionAreas.id, { onDelete: "set null" }),
  status: recordStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [index("collectors_collection_area_id_idx").on(t.collectionAreaId)]);

// ---------------------------------------------------------------------------
// Service accounts
// ---------------------------------------------------------------------------

export const serviceAccounts = pgTable("service_accounts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  subscriberId: bigint("subscriber_id", { mode: "number" }).notNull().references(() => subscribers.id, { onDelete: "cascade" }),
  planId: bigint("plan_id", { mode: "number" }).notNull().references(() => servicePlans.id, { onDelete: "restrict" }),
  serviceNumber: varchar("service_number", { length: 50 }).notNull(),
  status: serviceAccountStatusEnum("status").notNull().default("pending_installation"),
  collectionAreaId: bigint("collection_area_id", { mode: "number" }).references(() => collectionAreas.id, { onDelete: "set null" }),
  assignedCollectorId: bigint("assigned_collector_id", { mode: "number" }).references(() => collectors.id, { onDelete: "set null" }),
  activatedAt: timestamp("activated_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("service_accounts_service_number_unique").on(t.serviceNumber),
  index("service_accounts_subscriber_id_idx").on(t.subscriberId),
  index("service_accounts_status_idx").on(t.status),
]);

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const billingPeriods = pgTable("billing_periods", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  label: varchar("label", { length: 100 }).notNull(),
  periodStart: date("period_start", { mode: "date" }).notNull(),
  periodEnd: date("period_end", { mode: "date" }).notNull(),
  dueDate: date("due_date", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("billing_periods_label_unique").on(t.label),
  unique("billing_periods_dates_unique").on(t.periodStart, t.periodEnd),
]);

// Server-side document numbering. Sequences never hand out a value twice,
// even when the surrounding transaction rolls back, so a voided or failed
// number is never reused.
export const invoiceNumberSeq = pgSequence("invoice_number_seq", { startWith: 1000 });
export const receiptNumberSeq = pgSequence("receipt_number_seq", { startWith: 5000 });

export const invoices = pgTable("invoices", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
  serviceAccountId: bigint("service_account_id", { mode: "number" }).notNull().references(() => serviceAccounts.id, { onDelete: "restrict" }),
  billingPeriodId: bigint("billing_period_id", { mode: "number" }).notNull().references(() => billingPeriods.id, { onDelete: "restrict" }),
  issueDate: date("issue_date", { mode: "date" }).notNull(),
  dueDate: date("due_date", { mode: "date" }).notNull(),
  status: invoiceStatusEnum("status").notNull().default("unpaid"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  // Void workflow: the row is kept with its issued total; these record who
  // voided it and why, so it stays in history but leaves receivables.
  voidReason: text("void_reason"),
  voidedByUserId: bigint("voided_by_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  voidedAt: timestamp("voided_at", { withTimezone: true, mode: "date" }),
  finalizedAt: timestamp("finalized_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("invoices_invoice_number_unique").on(t.invoiceNumber),
  // Prevent duplicate billing for the same service account and billing period.
  unique("invoices_service_account_period_unique").on(t.serviceAccountId, t.billingPeriodId),
  index("invoices_status_idx").on(t.status),
  index("invoices_due_date_idx").on(t.dueDate),
  check("invoices_total_amount_non_negative", sql`${t.totalAmount} >= 0`),
]);

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  invoiceId: bigint("invoice_id", { mode: "number" }).notNull().references(() => invoices.id, { onDelete: "cascade" }),
  description: varchar("description", { length: 255 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [
  index("invoice_line_items_invoice_id_idx").on(t.invoiceId),
  check("invoice_line_items_amount_non_negative", sql`${t.amount} >= 0`),
]);

export const invoiceAdjustments = pgTable("invoice_adjustments", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  invoiceId: bigint("invoice_id", { mode: "number" }).notNull().references(() => invoices.id, { onDelete: "restrict" }),
  type: adjustmentTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  // false: entered with the invoice and already part of its issued total.
  // true: a controlled post-issue adjustment, shown as its own ledger line.
  postIssue: boolean("post_issue").notNull().default(false),
  createdByUserId: bigint("created_by_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [
  index("invoice_adjustments_invoice_id_idx").on(t.invoiceId),
  check("invoice_adjustments_amount_positive", sql`${t.amount} > 0`),
]);

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const payments = pgTable("payments", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  serviceAccountId: bigint("service_account_id", { mode: "number" }).notNull().references(() => serviceAccounts.id, { onDelete: "restrict" }),
  method: paymentMethodEnum("method").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paymentDate: date("payment_date", { mode: "date" }).notNull(),
  receiptNumber: varchar("receipt_number", { length: 50 }),
  referenceNumber: varchar("reference_number", { length: 100 }),
  // Non-GCash proof-of-payment reference (bank slip, cheque photo, etc.).
  // GCash payments use gcashPaymentDetails.proofAttachmentPath instead,
  // since that field is tied to the verification workflow.
  proofAttachmentPath: varchar("proof_attachment_path", { length: 500 }),
  status: paymentStatusEnum("status").notNull().default("posted"),
  postedByUserId: bigint("posted_by_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  postedAt: timestamp("posted_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [
  index("payments_service_account_id_idx").on(t.serviceAccountId),
  index("payments_status_idx").on(t.status),
  index("payments_payment_date_idx").on(t.paymentDate),
  uniqueIndex("payments_receipt_number_unique").on(t.receiptNumber),
  check("payments_amount_positive", sql`${t.amount} > 0`),
]);

// Posted payments are reversed, never deleted/edited in place.
export const paymentReversals = pgTable("payment_reversals", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  paymentId: bigint("payment_id", { mode: "number" }).notNull().references(() => payments.id, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  reversedByUserId: bigint("reversed_by_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  reversedAt: timestamp("reversed_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("payment_reversals_payment_id_unique").on(t.paymentId),
]);

export const gcashPaymentDetails = pgTable("gcash_payment_details", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  paymentId: bigint("payment_id", { mode: "number" }).notNull().references(() => payments.id, { onDelete: "cascade" }),
  gcashReferenceNumber: varchar("gcash_reference_number", { length: 100 }).notNull(),
  proofAttachmentPath: varchar("proof_attachment_path", { length: 500 }),
  verificationStatus: gcashVerificationStatusEnum("verification_status").notNull().default("pending"),
  verifiedByUserId: bigint("verified_by_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  verificationNote: text("verification_note"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("gcash_payment_details_payment_id_unique").on(t.paymentId),
  // Database-level duplicate GCash reference protection.
  uniqueIndex("gcash_payment_details_reference_unique").on(t.gcashReferenceNumber),
  index("gcash_payment_details_verification_status_idx").on(t.verificationStatus),
]);

export const paymentAllocations = pgTable("payment_allocations", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  paymentId: bigint("payment_id", { mode: "number" }).notNull().references(() => payments.id, { onDelete: "restrict" }),
  invoiceId: bigint("invoice_id", { mode: "number" }).notNull().references(() => invoices.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [
  unique("payment_allocations_payment_invoice_unique").on(t.paymentId, t.invoiceId),
  index("payment_allocations_invoice_id_idx").on(t.invoiceId),
  check("payment_allocations_amount_positive", sql`${t.amount} > 0`),
]);

// ---------------------------------------------------------------------------
// Collection batches & remittance
// ---------------------------------------------------------------------------

export const collectionBatches = pgTable("collection_batches", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  collectorId: bigint("collector_id", { mode: "number" }).notNull().references(() => collectors.id, { onDelete: "restrict" }),
  batchDate: date("batch_date", { mode: "date" }).notNull(),
  status: collectionBatchStatusEnum("status").notNull().default("open"),
  expectedAmount: numeric("expected_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  remittedAmount: numeric("remitted_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  shortageAmount: numeric("shortage_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  overageAmount: numeric("overage_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  reconciliationNotes: text("reconciliation_notes"),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [
  index("collection_batches_collector_id_idx").on(t.collectorId),
  index("collection_batches_batch_date_idx").on(t.batchDate),
  check("collection_batches_non_negative", sql`${t.expectedAmount} >= 0 AND ${t.remittedAmount} >= 0 AND ${t.shortageAmount} >= 0 AND ${t.overageAmount} >= 0`),
]);

export const collectionBatchPayments = pgTable("collection_batch_payments", {
  batchId: bigint("batch_id", { mode: "number" }).notNull().references(() => collectionBatches.id, { onDelete: "cascade" }),
  paymentId: bigint("payment_id", { mode: "number" }).notNull().references(() => payments.id, { onDelete: "restrict" }),
}, (t) => [
  unique("collection_batch_payments_pkey").on(t.batchId, t.paymentId),
  uniqueIndex("collection_batch_payments_payment_id_unique").on(t.paymentId),
]);

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorUserId: bigint("actor_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: bigint("entity_id", { mode: "number" }),
  metadata: jsonb("metadata"),
  ipAddress: varchar("ip_address", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [
  index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  index("audit_logs_actor_user_id_idx").on(t.actorUserId),
  index("audit_logs_action_idx").on(t.action),
  index("audit_logs_created_at_idx").on(t.createdAt),
]);

// ---------------------------------------------------------------------------
// Suspension & reconnection (3.10)
// ---------------------------------------------------------------------------

export const reconnectionStatusEnum = pgEnum("reconnection_status", ["requested", "completed"]);

export const suspensionRecords = pgTable("suspension_records", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  serviceAccountId: bigint("service_account_id", { mode: "number" }).notNull().references(() => serviceAccounts.id, { onDelete: "cascade" }),
  reason: text("reason"),
  effectiveDate: timestamp("effective_date", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  approvedByUserId: bigint("approved_by_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [
  index("suspension_records_service_account_id_idx").on(t.serviceAccountId),
]);

export const reconnectionRecords = pgTable("reconnection_records", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  serviceAccountId: bigint("service_account_id", { mode: "number" }).notNull().references(() => serviceAccounts.id, { onDelete: "cascade" }),
  fee: numeric("fee", { precision: 14, scale: 2 }).notNull().default("0"),
  technicianUserId: bigint("technician_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  requestDate: timestamp("request_date", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  completionDate: timestamp("completion_date", { withTimezone: true, mode: "date" }),
  status: reconnectionStatusEnum("status").notNull().default("completed"),
  notes: text("notes"),
  requestedByUserId: bigint("requested_by_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => [
  index("reconnection_records_service_account_id_idx").on(t.serviceAccountId),
]);

// ---------------------------------------------------------------------------
// Application settings (3.10 configurable grace period / suspension threshold)
// ---------------------------------------------------------------------------

export const applicationSettings = pgTable("application_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date()),
  updatedByUserId: bigint("updated_by_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
});

// ---------------------------------------------------------------------------
// Backup history
// ---------------------------------------------------------------------------

export const backupStatusEnum = pgEnum("backup_status", ["completed", "verified", "failed", "restored"]);

export const backupHistory = pgTable("backup_history", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
  status: backupStatusEnum("status").notNull().default("completed"),
  createdByUserId: bigint("created_by_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  restoredAt: timestamp("restored_at", { withTimezone: true, mode: "date" }),
  restoredByUserId: bigint("restored_by_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
}, (t) => [
  index("backup_history_created_at_idx").on(t.createdAt),
]);

// ---------------------------------------------------------------------------
// Relations (for Drizzle relational queries)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const subscribersRelations = relations(subscribers, ({ many }) => ({
  serviceAccounts: many(serviceAccounts),
  statusHistory: many(subscriberStatusHistory),
}));

export const subscriberStatusHistoryRelations = relations(subscriberStatusHistory, ({ one }) => ({
  subscriber: one(subscribers, { fields: [subscriberStatusHistory.subscriberId], references: [subscribers.id] }),
  changedBy: one(users, { fields: [subscriberStatusHistory.changedByUserId], references: [users.id] }),
}));

export const servicesRelations = relations(services, ({ many }) => ({
  plans: many(servicePlans),
}));

export const servicePlansRelations = relations(servicePlans, ({ one, many }) => ({
  service: one(services, { fields: [servicePlans.serviceId], references: [services.id] }),
  serviceAccounts: many(serviceAccounts),
}));

export const collectionAreasRelations = relations(collectionAreas, ({ many }) => ({
  collectors: many(collectors),
  serviceAccounts: many(serviceAccounts),
}));

export const collectorsRelations = relations(collectors, ({ one, many }) => ({
  user: one(users, { fields: [collectors.userId], references: [users.id] }),
  collectionArea: one(collectionAreas, { fields: [collectors.collectionAreaId], references: [collectionAreas.id] }),
  assignedServiceAccounts: many(serviceAccounts),
  batches: many(collectionBatches),
}));

export const serviceAccountsRelations = relations(serviceAccounts, ({ one, many }) => ({
  subscriber: one(subscribers, { fields: [serviceAccounts.subscriberId], references: [subscribers.id] }),
  plan: one(servicePlans, { fields: [serviceAccounts.planId], references: [servicePlans.id] }),
  collectionArea: one(collectionAreas, { fields: [serviceAccounts.collectionAreaId], references: [collectionAreas.id] }),
  assignedCollector: one(collectors, { fields: [serviceAccounts.assignedCollectorId], references: [collectors.id] }),
  invoices: many(invoices),
  payments: many(payments),
}));

export const billingPeriodsRelations = relations(billingPeriods, ({ many }) => ({
  invoices: many(invoices),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  serviceAccount: one(serviceAccounts, { fields: [invoices.serviceAccountId], references: [serviceAccounts.id] }),
  billingPeriod: one(billingPeriods, { fields: [invoices.billingPeriodId], references: [billingPeriods.id] }),
  lineItems: many(invoiceLineItems),
  adjustments: many(invoiceAdjustments),
  allocations: many(paymentAllocations),
}));

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLineItems.invoiceId], references: [invoices.id] }),
}));

export const invoiceAdjustmentsRelations = relations(invoiceAdjustments, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceAdjustments.invoiceId], references: [invoices.id] }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  serviceAccount: one(serviceAccounts, { fields: [payments.serviceAccountId], references: [serviceAccounts.id] }),
  allocations: many(paymentAllocations),
  reversal: many(paymentReversals),
  gcashDetails: many(gcashPaymentDetails),
  batches: many(collectionBatchPayments),
}));

export const paymentReversalsRelations = relations(paymentReversals, ({ one }) => ({
  payment: one(payments, { fields: [paymentReversals.paymentId], references: [payments.id] }),
  reversedBy: one(users, { fields: [paymentReversals.reversedByUserId], references: [users.id] }),
}));

export const gcashPaymentDetailsRelations = relations(gcashPaymentDetails, ({ one }) => ({
  payment: one(payments, { fields: [gcashPaymentDetails.paymentId], references: [payments.id] }),
  verifiedBy: one(users, { fields: [gcashPaymentDetails.verifiedByUserId], references: [users.id] }),
}));

export const paymentAllocationsRelations = relations(paymentAllocations, ({ one }) => ({
  payment: one(payments, { fields: [paymentAllocations.paymentId], references: [payments.id] }),
  invoice: one(invoices, { fields: [paymentAllocations.invoiceId], references: [invoices.id] }),
}));

export const collectionBatchesRelations = relations(collectionBatches, ({ one, many }) => ({
  collector: one(collectors, { fields: [collectionBatches.collectorId], references: [collectors.id] }),
  payments: many(collectionBatchPayments),
}));

export const collectionBatchPaymentsRelations = relations(collectionBatchPayments, ({ one }) => ({
  batch: one(collectionBatches, { fields: [collectionBatchPayments.batchId], references: [collectionBatches.id] }),
  payment: one(payments, { fields: [collectionBatchPayments.paymentId], references: [payments.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorUserId], references: [users.id] }),
}));
