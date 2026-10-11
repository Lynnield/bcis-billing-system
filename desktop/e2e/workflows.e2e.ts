import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_API_URL } from "./env";

// Key desktop workflows (spec 7.1 "E2E ... for key desktop workflows"),
// driven through the real built Electron app against the seeded e2e API.
const here = dirname(fileURLToPath(import.meta.url));
const MAIN = join(here, "..", "out", "main", "index.js");
const PASSWORD = "Demo@12345";

let app: ElectronApplication | undefined;
let profileDir: string | undefined;

async function launchAs(username: string): Promise<Page> {
  profileDir = mkdtempSync(join(tmpdir(), "bcis-e2e-profile-"));
  app = await electron.launch({
    args: [MAIN],
    env: { ...process.env, VITE_API_BASE_URL: E2E_API_URL, BCIS_USER_DATA_DIR: profileDir, NODE_ENV: "production" },
  });
  const page = await app.firstWindow();
  await page.getByLabel("Username or Email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", level: 2 })).toBeVisible();
  return page;
}

test.afterEach(async () => {
  await app?.close();
  app = undefined;
  if (profileDir) rmSync(profileDir, { recursive: true, force: true });
});

test("administrator signs in and sees the dashboard KPIs", async () => {
  const page = await launchAs("demo.admin");
  await expect(page.getByText("Outstanding AR")).toBeVisible();
  await expect(page.getByText("Billing vs Collection")).toBeVisible();
  await expect(page.getByText("Overdue Alerts")).toBeVisible();
});

test("cashier receives a partial payment: search, preview, post, receipt", async () => {
  const page = await launchAs("demo.cashier");
  await page.getByRole("link", { name: "Receive Payment" }).click();

  await page.getByLabel("Search subscriber").fill("DEMO-SUB-0010");
  await page.getByRole("button", { name: /DEMO-SUB-0010/ }).first().click();
  await expect(page.getByText("2. Balance")).toBeVisible();

  const amount = page.getByLabel("Amount (₱) *");
  await amount.fill("100.00");
  // Allocation preview is computed by the API before anything is posted.
  await expect(page.getByText("Allocation preview")).toBeVisible();
  await expect(page.getByRole("cell", { name: "100.00" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Post Payment" }).click();
  await expect(page.getByText("Payment posted", { exact: true })).toBeVisible();
  await expect(page.getByText(/^OR-\d+$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Print Receipt" })).toBeVisible();
});

test("auditor verifies the pending GCash submission in the two-pane queue", async () => {
  const page = await launchAs("demo.auditor");
  await page.getByRole("link", { name: "GCash Verification" }).click();
  await expect(page.getByText("GC-DEMO-0005")).toBeVisible();
  await page.getByRole("button", { name: "Verify & Post" }).click();
  await expect(page.getByText("No pending GCash payments")).toBeVisible();
});

test("cashier cannot reach owner-only areas, and the server refuses them even when called directly", async () => {
  const page = await launchAs("demo.cashier");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link", { name: "Receive Payment" })).toBeVisible();
  for (const name of ["Backup & Restore", "Users", "Roles & Permissions", "GCash Verification", "Audit Log"]) {
    await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
  // Hiding a menu item is not authorization (spec 4.4): call the API
  // through the app's own bridge and expect a refusal.
  const outcome = await page.evaluate(async () => {
    try {
      await (window as unknown as { bcis: { backup: { getList: () => Promise<unknown> } } }).bcis.backup.getList();
      return "allowed";
    } catch (err) {
      return String(err);
    }
  });
  expect(outcome).toMatch(/permission/i);
});
