import { and, eq } from "drizzle-orm";
import { db } from "./index";
import { roles, userRoles, users } from "./schema";
import { hashPassword } from "../lib/password";
import { ROLE_NAMES } from "../lib/roles";

export interface BootstrapOwnerInput {
  username: string;
  email: string;
  fullName: string;
  password: string;
}

export async function bootstrapOwner(input: BootstrapOwnerInput): Promise<{ created: boolean; userId: number }> {
  if (!input.password || input.password.length < 12) {
    throw new Error("Bootstrap password must be at least 12 characters long.");
  }

  const ownerRole = await db
    .select()
    .from(roles)
    .where(eq(roles.name, ROLE_NAMES.OWNER))
    .limit(1);
  const owner = ownerRole[0];
  if (!owner) {
    throw new Error('Required role "Owner / Super Admin" is missing. Run db:seed first.');
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.username, input.username))
    .limit(1);

  let userId: number;
  let created = false;

  if (existing[0]) {
    userId = existing[0].id;
  } else {
    const passwordHash = await hashPassword(input.password);
    const inserted = await db
      .insert(users)
      .values({
        username: input.username,
        email: input.email,
        fullName: input.fullName,
        passwordHash,
        status: "active",
      })
      .returning({ id: users.id });
    userId = inserted[0]!.id;
    created = true;
  }

  const assignment = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, owner.id)))
    .limit(1);

  if (!assignment[0]) {
    await db.insert(userRoles).values({ userId, roleId: owner.id });
  }

  return { created, userId };
}

if (require.main === module) {
  const input: BootstrapOwnerInput = {
    username: process.env.BOOTSTRAP_OWNER_USERNAME ?? "",
    email: process.env.BOOTSTRAP_OWNER_EMAIL ?? "",
    fullName: process.env.BOOTSTRAP_OWNER_FULL_NAME ?? "",
    password: process.env.BOOTSTRAP_OWNER_PASSWORD ?? "",
  };

  if (!input.username || !input.email || !input.fullName || !input.password) {
    console.error(
      "Bootstrap requires BOOTSTRAP_OWNER_USERNAME, BOOTSTRAP_OWNER_EMAIL, BOOTSTRAP_OWNER_FULL_NAME, and BOOTSTRAP_OWNER_PASSWORD environment variables.",
    );
    process.exit(1);
  }

  bootstrapOwner(input)
    .then((result) => {
      console.log(result.created ? "Owner user created." : "Owner user already exists; role assignment ensured.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Bootstrap failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
