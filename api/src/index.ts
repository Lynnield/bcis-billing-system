import { buildApp } from "./app";
import { env } from "./config/env";
import { markOverdueInvoices } from "./lib/invoice-status";

const OVERDUE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Invoices become OVERDUE by the passage of time, not by any user action,
  // so the server sweeps once at start-up and then hourly. Kept out of
  // buildApp() so tests never run a background timer.
  const sweep = async () => {
    try {
      const changed = await markOverdueInvoices();
      if (changed > 0) app.log.info({ changed }, "Marked invoices overdue");
    } catch (err) {
      app.log.error({ err }, "Overdue sweep failed");
    }
  };
  await sweep();
  setInterval(() => void sweep(), OVERDUE_SWEEP_INTERVAL_MS).unref();
}

void main();
