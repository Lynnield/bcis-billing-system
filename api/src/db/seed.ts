import { db } from "./index";
import { roles } from "./schema";

const REQUIRED_ROLES: Array<{ name: string; description: string }> = [
  { name: "Owner / Super Admin", description: "Full system access and ownership" },
  { name: "Administrator", description: "System administration and management" },
  { name: "Cashier", description: "Records and posts customer payments" },
  { name: "Collection Supervisor", description: "Supervises collectors, routes, and batches" },
  { name: "Accounting / Auditor", description: "Reviews financial records and audit trails" },
  { name: "Technician", description: "Handles service installation and account status fieldwork" },
  { name: "Read-only Viewer", description: "Read-only access to system information" },
];

async function seed(): Promise<void> {
  await db
    .insert(roles)
    .values(REQUIRED_ROLES)
    .onConflictDoNothing({ target: roles.name });

  console.log(`Roles seed complete (${REQUIRED_ROLES.length} required roles ensured).`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
