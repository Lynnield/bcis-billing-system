// Demo dataset for local development/testing only. Every business key is
// prefixed "DEMO-" and every person/contact is synthetic (no real PII) so
// this is always safe to point at bcis_billing or bcis_billing_test, never
// at anything resembling a production database.
import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import { roles, users, userRoles } from "./schema";
import { buildApp } from "../app";
import { hashPassword } from "../lib/password";
import { ROLE_NAMES } from "../lib/roles";
import { formatCents, parseMoneyToCents } from "../lib/money";
import type { FastifyInstance } from "fastify";

const REQUIRED_ROLES: Array<{ name: string; description: string }> = [
  { name: "Owner / Super Admin", description: "Full system access and ownership" },
  { name: "Administrator", description: "System administration and management" },
  { name: "Cashier", description: "Records and posts customer payments" },
  { name: "Collection Supervisor", description: "Supervises collectors, routes, and batches" },
  { name: "Accounting / Auditor", description: "Reviews financial records and audit trails" },
  { name: "Technician", description: "Handles service installation and account status fieldwork" },
  { name: "Read-only Viewer", description: "Read-only access to system information" },
];

async function seedRoles(): Promise<void> {
  await db.insert(roles).values(REQUIRED_ROLES).onConflictDoNothing({ target: roles.name });
  console.log(`Roles seed complete (${REQUIRED_ROLES.length} required roles ensured).`);
}

// ---------------------------------------------------------------------------
// Safety guard: only ever run this against a local database. There is no
// separate "production" environment in this project, but refusing anything
// that isn't localhost prevents an accidental run against a misconfigured
// DATABASE_URL pointed at someone else's machine.
// ---------------------------------------------------------------------------
function assertLocalDatabase(): void {
  let hostname = "";
  try {
    hostname = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    // fall through to the rejection below
  }
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `Refusing to seed demo data: DATABASE_URL host "${hostname}" is not localhost. ` +
        "This seed is for local dev/test databases only.",
    );
  }
}

const DEMO_PASSWORD = "Demo@12345";

const DEMO_USERS = [
  { username: "demo.admin", email: "demo.admin@example.test", fullName: "Alicia Ramos", role: ROLE_NAMES.ADMINISTRATOR },
  { username: "demo.cashier", email: "demo.cashier@example.test", fullName: "Bea Fernandez", role: ROLE_NAMES.CASHIER },
  { username: "demo.supervisor", email: "demo.supervisor@example.test", fullName: "Carlos Mendoza", role: ROLE_NAMES.COLLECTION_SUPERVISOR },
  { username: "demo.auditor", email: "demo.auditor@example.test", fullName: "Diana Reyes", role: ROLE_NAMES.ACCOUNTING_AUDITOR },
  { username: "demo.technician", email: "demo.technician@example.test", fullName: "Eduardo Villanueva", role: ROLE_NAMES.TECHNICIAN },
  { username: "demo.viewer", email: "demo.viewer@example.test", fullName: "Fiona Castro", role: ROLE_NAMES.READ_ONLY_VIEWER },
] as const;

const FIRST_NAMES = [
  "Maria", "Jose", "Juan", "Ana", "Pedro", "Rosa", "Antonio", "Carmen", "Manuel", "Teresa",
  "Ricardo", "Elena", "Francisco", "Luz", "Eduardo", "Grace", "Roberto", "Josefa", "Mario", "Corazon",
  "Alfredo", "Remedios", "Danilo", "Imelda", "Romeo", "Leonora", "Arturo", "Milagros", "Ernesto", "Victoria",
  "Oscar", "Gloria", "Rodolfo", "Esperanza", "Nestor", "Cecilia", "Benjamin", "Lourdes", "Gregorio", "Perla",
];
const LAST_NAMES = [
  "Santos", "Reyes", "Cruz", "Bautista", "Garcia", "Mendoza", "Torres", "Flores", "Ramos", "Gonzales",
  "Fernandez", "Castillo", "Villanueva", "Aquino", "Rivera", "Morales", "Castro", "Pascual", "Navarro", "Salazar",
  "Domingo", "Ocampo", "Agustin", "Marquez", "Padilla",
];
const STREETS = [
  "Rizal Street", "Mabini Street", "Bonifacio Avenue", "Luna Street", "Aguinaldo Road",
  "Quezon Avenue", "Magsaysay Drive", "Burgos Street", "Del Pilar Street", "Kalayaan Avenue",
];
const BARANGAYS = ["Barangay San Isidro", "Barangay Poblacion", "Barangay Sto. Nino", "Barangay Bagong Silang", "Barangay Malipayon"];

const SUBSCRIBER_COUNT = 50;
const EXTRA_ACCOUNTS = 12; // additional second accounts -> 62 service accounts total

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

interface Session {
  token: string;
  userId: number;
}

async function login(app: FastifyInstance, identifier: string, password: string): Promise<Session> {
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier, password } });
  if (res.statusCode !== 200) {
    throw new Error(`Login failed for ${identifier}: ${res.statusCode} ${res.payload}`);
  }
  const body = res.json() as { token: string; user: { id: number } };
  return { token: body.token, userId: body.user.id };
}

async function call<T = unknown>(
  app: FastifyInstance,
  session: Session,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const res = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${session.token}` },
    payload,
  });
  if (res.statusCode >= 400) {
    throw new Error(`${method} ${url} failed: ${res.statusCode} ${res.payload}`);
  }
  return res.json() as T;
}

async function seedDemoDataset(): Promise<void> {
  assertLocalDatabase();

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, "demo.admin")).limit(1);
  if (existing) {
    console.log("Demo dataset already present (demo.admin exists); skipping.");
    return;
  }

  console.log("Seeding demo dataset...");

  const roleRows = await db.select().from(roles);
  const roleIdByName = new Map(roleRows.map((r) => [r.name, r.id]));

  const demoUserIds = new Map<string, number>();
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const u of DEMO_USERS) {
    const roleId = roleIdByName.get(u.role);
    if (!roleId) throw new Error(`Required role "${u.role}" is missing; run role seed first.`);
    const [inserted] = await db
      .insert(users)
      .values({ username: u.username, email: u.email, fullName: u.fullName, passwordHash, status: "active" })
      .onConflictDoNothing({ target: users.username })
      .returning({ id: users.id });
    const userId = inserted?.id ?? (await db.select({ id: users.id }).from(users).where(eq(users.username, u.username)).limit(1))[0]!.id;
    await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();
    demoUserIds.set(u.username, userId);
  }
  console.log(`  Created ${DEMO_USERS.length} demo users (password for all: ${DEMO_PASSWORD}).`);

  const app = await buildApp();
  await app.ready();

  try {
    const admin = await login(app, "demo.admin", DEMO_PASSWORD);
    const cashier = await login(app, "demo.cashier", DEMO_PASSWORD);
    const technicianUserId = demoUserIds.get("demo.technician")!;

    // --- Services & plans -------------------------------------------------
    const serviceDefs = [
      { type: "internet", name: "Internet Service" },
      { type: "cable", name: "Cable TV Service" },
      { type: "combo", name: "Combo Package" },
    ] as const;
    const serviceIds = new Map<string, number>();
    for (const s of serviceDefs) {
      const res = await call<{ data: { id: number } }>(app, admin, "POST", "/api/v1/services", { type: s.type, name: s.name });
      serviceIds.set(s.type, res.data.id);
    }

    const planDefs = [
      { service: "internet", name: "Internet 25 Mbps", price: "799.00" },
      { service: "internet", name: "Internet 50 Mbps", price: "1299.00" },
      { service: "internet", name: "Internet 100 Mbps", price: "1999.00" },
      { service: "cable", name: "Cable Basic", price: "350.00" },
      { service: "cable", name: "Cable Premium", price: "650.00" },
      { service: "combo", name: "Combo Starter", price: "999.00" },
      { service: "combo", name: "Combo Plus", price: "1599.00" },
    ] as const;
    const plans: Array<{ id: number; price: string }> = [];
    for (const p of planDefs) {
      const serviceId = serviceIds.get(p.service)!;
      const res = await call<{ data: { id: number; price: string } }>(app, admin, "POST", `/api/v1/services/${serviceId}/plans`, {
        name: p.name,
        price: p.price,
      });
      plans.push({ id: res.data.id, price: res.data.price });
    }
    console.log(`  Created ${serviceDefs.length} services and ${plans.length} plans.`);

    // --- Collection areas & collectors -------------------------------------
    const areaNames = ["Poblacion Area", "Riverside Area", "Uptown Area"];
    const areaIds: number[] = [];
    for (const name of areaNames) {
      const res = await call<{ data: { id: number } }>(app, admin, "POST", "/api/v1/collection-areas", { name });
      areaIds.push(res.data.id);
    }

    const collectorNames = ["Juan dela Cruz Jr.", "Maria Santos"];
    const collectorIds: number[] = [];
    for (let i = 0; i < collectorNames.length; i++) {
      const res = await call<{ data: { id: number } }>(app, admin, "POST", "/api/v1/collectors", {
        fullName: collectorNames[i],
        collectionAreaId: areaIds[i % areaIds.length],
      });
      collectorIds.push(res.data.id);
    }
    console.log(`  Created ${areaIds.length} collection areas and ${collectorIds.length} collectors.`);

    // --- Subscribers --------------------------------------------------------
    const subscriberIds: number[] = [];
    for (let i = 1; i <= SUBSCRIBER_COUNT; i++) {
      const firstName = FIRST_NAMES[(i - 1) % FIRST_NAMES.length];
      const lastName = LAST_NAMES[(i - 1) % LAST_NAMES.length];
      const res = await call<{ data: { id: number } }>(app, admin, "POST", "/api/v1/subscribers", {
        accountNumber: `DEMO-SUB-${pad4(i)}`,
        firstName,
        lastName,
        contactNumber: `0917${String(1000000 + i).slice(-7)}`,
        email: `demo.subscriber${i}@example.test`,
        addressLine1: `${100 + i} ${STREETS[(i - 1) % STREETS.length]}`,
        addressLine2: BARANGAYS[(i - 1) % BARANGAYS.length],
        city: "Malaybalay City",
        province: "Bukidnon",
        postalCode: "8700",
        status: "active",
      });
      subscriberIds.push(res.data.id);
    }
    console.log(`  Created ${subscriberIds.length} subscribers.`);

    // --- Service accounts (62 total: 50 primary + 12 secondary) ------------
    const accountIds: number[] = [];
    let serviceNumberCounter = 1;
    async function createAccount(subscriberId: number, planIdx: number, idx: number): Promise<number> {
      // Each collector is pinned to one collection area, so a collector
      // assignment and area assignment must agree; every third account is
      // left uncollected in the third area to exercise all collection areas.
      const useCollector = idx % 3 !== 2;
      const collectorIdx = idx % 2;
      const res = await call<{ data: { id: number } }>(app, admin, "POST", "/api/v1/service-accounts", {
        subscriberId,
        planId: plans[planIdx % plans.length]!.id,
        serviceNumber: `DEMO-SVC-${pad4(serviceNumberCounter++)}`,
        status: "active",
        collectionAreaId: useCollector ? areaIds[collectorIdx] : areaIds[2],
        ...(useCollector ? { assignedCollectorId: collectorIds[collectorIdx] } : {}),
      });
      return res.data.id;
    }
    for (let i = 0; i < SUBSCRIBER_COUNT; i++) {
      accountIds.push(await createAccount(subscriberIds[i]!, i, i));
    }
    for (let i = 0; i < EXTRA_ACCOUNTS; i++) {
      accountIds.push(await createAccount(subscriberIds[i]!, i + 3, i));
    }
    console.log(`  Created ${accountIds.length} service accounts.`);

    // --- Billing periods (4 distinct months) --------------------------------
    const periodDefs = [
      { label: "June 2026", periodStart: "2026-06-01", periodEnd: "2026-06-30", dueDate: "2026-06-15" },
      { label: "August 2026", periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: "2026-08-15" },
      { label: "September 2026", periodStart: "2026-09-01", periodEnd: "2026-09-30", dueDate: "2026-09-15" },
      { label: "October 2026", periodStart: "2026-10-01", periodEnd: "2026-10-31", dueDate: "2026-10-25" },
    ];
    const periodIds = new Map<string, number>();
    for (const p of periodDefs) {
      const res = await call<{ data: { id: number } }>(app, admin, "POST", "/api/v1/billing-periods", p);
      periodIds.set(p.label, res.data.id);
    }
    console.log(`  Created ${periodDefs.length} billing periods.`);

    // --- Invoices -------------------------------------------------------------
    // Every account gets an October invoice (not yet due -> "current" bucket).
    // Twelve accounts additionally get one older, still-unpaid invoice so
    // receivables aging has accounts in every overdue bucket.
    const octoberPeriodId = periodIds.get("October 2026")!;
    let invoiceNumberCounter = 1;
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i]!;
      await call(app, admin, "POST", "/api/v1/invoices", {
        serviceAccountId: accountId,
        billingPeriodId: octoberPeriodId,
        invoiceNumber: `DEMO-INV-${pad4(invoiceNumberCounter++)}`,
        issueDate: "2026-10-01",
      });
    }

    const overdueGroups: Array<{ label: string; issueDate: string }> = [
      { label: "June 2026", issueDate: "2026-06-01" }, // 90+ bucket
      { label: "August 2026", issueDate: "2026-08-01" }, // 31-60 bucket
      { label: "September 2026", issueDate: "2026-09-01" }, // 1-30 bucket
    ];
    for (let g = 0; g < overdueGroups.length; g++) {
      const group = overdueGroups[g]!;
      const periodId = periodIds.get(group.label)!;
      for (let k = 0; k < 4; k++) {
        const accountId = accountIds[g * 4 + k]!;
        await call(app, admin, "POST", "/api/v1/invoices", {
          serviceAccountId: accountId,
          billingPeriodId: periodId,
          invoiceNumber: `DEMO-INV-${pad4(invoiceNumberCounter++)}`,
          issueDate: group.issueDate,
        });
      }
    }
    console.log(`  Created ${invoiceNumberCounter - 1} invoices (12 deliberately overdue across 3 aging buckets).`);

    // --- Payments ---------------------------------------------------------
    // All payments below target the October invoice, which is not yet due
    // (dueDate 2026-10-25) -- i.e. they are all "paid in advance" by
    // construction. The 12 overdue invoices above are left untouched so
    // they remain in the receivables aging report.
    let receiptCounter = 1;
    let gcashRefCounter = 1;
    const cashExactPaymentIds: number[] = [];
    const gcashPaymentIds: number[] = [];

    // 20 full ("exact") cash payments.
    for (let i = 12; i < 32; i++) {
      const accountId = accountIds[i]!;
      const planIdx = i < SUBSCRIBER_COUNT ? i : i - SUBSCRIBER_COUNT + 3;
      const amount = plans[planIdx % plans.length]!.price;
      const res = await call<{ data: { id: number } }>(app, cashier, "POST", "/api/v1/payments", {
        serviceAccountId: accountId,
        amount,
        method: "cash",
        receiptNumber: `DEMO-RCT-${pad4(receiptCounter++)}`,
      });
      cashExactPaymentIds.push(res.data.id);
    }

    // 10 partial cash payments (half the invoice amount).
    for (let i = 32; i < 42; i++) {
      const accountId = accountIds[i]!;
      const planIdx = i < SUBSCRIBER_COUNT ? i : i - SUBSCRIBER_COUNT + 3;
      const totalCents = parseMoneyToCents(plans[planIdx % plans.length]!.price)!;
      const half = formatCents(totalCents / 2n);
      await call(app, cashier, "POST", "/api/v1/payments", {
        serviceAccountId: accountId,
        amount: half,
        method: "cash",
        receiptNumber: `DEMO-RCT-${pad4(receiptCounter++)}`,
      });
    }

    // 5 GCash payments (full amount): verify 3, reject 1, leave 1 pending.
    for (let i = 42; i < 47; i++) {
      const accountId = accountIds[i]!;
      const planIdx = i < SUBSCRIBER_COUNT ? i : i - SUBSCRIBER_COUNT + 3;
      const amount = plans[planIdx % plans.length]!.price;
      const res = await call<{ data: { id: number } }>(app, cashier, "POST", "/api/v1/payments", {
        serviceAccountId: accountId,
        amount,
        method: "gcash",
        receiptNumber: `DEMO-RCT-${pad4(receiptCounter++)}`,
        gcash: { gcashReferenceNumber: `GC-DEMO-${pad4(gcashRefCounter++)}` },
      });
      gcashPaymentIds.push(res.data.id);
    }
    for (const id of gcashPaymentIds.slice(0, 3)) {
      await call(app, admin, "POST", `/api/v1/payments/${id}/verify`, { note: "Demo: verified against GCash statement" });
    }
    await call(app, admin, "POST", `/api/v1/payments/${gcashPaymentIds[3]}/reject`, { reason: "Demo: reference number could not be matched" });
    // gcashPaymentIds[4] intentionally left pending.

    console.log(`  Posted ${cashExactPaymentIds.length + 10 + gcashPaymentIds.length} payments (cash exact/partial + GCash verify/reject/pending).`);

    // --- Reversal example ----------------------------------------------------
    await call(app, admin, "POST", `/api/v1/payments/${cashExactPaymentIds[0]}/reverse`, {
      reason: "Demo: duplicate payment entry corrected",
    });
    console.log("  Reversed 1 payment (demo example).");

    // --- Suspension & reconnection examples -----------------------------------
    const suspendOnlyAccountId = accountIds[accountIds.length - 1]!;
    const suspendThenReconnectAccountId = accountIds[accountIds.length - 2]!;

    await call(app, admin, "PATCH", `/api/v1/service-accounts/${suspendThenReconnectAccountId}/suspend`, {
      reason: "Non-payment for over 90 days",
      notes: "Demo: suspended for delinquency",
    });
    await call(app, admin, "PATCH", `/api/v1/service-accounts/${suspendThenReconnectAccountId}/reconnect`, {
      reason: "Customer settled outstanding balance",
      fee: "150.00",
      technicianUserId,
      notes: "Demo: reconnected after payment and field verification",
    });

    await call(app, admin, "PATCH", `/api/v1/service-accounts/${suspendOnlyAccountId}/suspend`, {
      reason: "Non-payment for over 60 days",
      notes: "Demo: currently suspended, awaiting payment",
    });
    console.log("  Created 2 suspension/reconnection examples (one full cycle, one still suspended).");

    // --- Collections settings ----------------------------------------------
    await call(app, admin, "PUT", "/api/v1/settings/collections", { gracePeriodDays: 7, suspensionThresholdDays: 60 });
    console.log("  Set collections settings (grace period / suspension threshold).");

    console.log("Demo dataset seed complete.");
  } finally {
    await app.close();
  }
}

async function seed(): Promise<void> {
  await seedRoles();
  await seedDemoDataset();
}

seed()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
