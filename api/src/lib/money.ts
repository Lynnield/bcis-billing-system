// Exact decimal money helpers. Monetary values are strings in the API layer
// and NUMERIC in the database — never JavaScript numbers.

export function parseMoneyToCents(value: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) return null;
  const whole = BigInt(m[1] as string) * 100n;
  const frac = (m[2] ?? "").padEnd(2, "0") || "0";
  return whole + BigInt(frac);
}

export function formatCents(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${sign}${whole}.${frac}`;
}
