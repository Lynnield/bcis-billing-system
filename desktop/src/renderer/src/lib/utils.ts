import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Display a decimal-string amount as pesos with thousands separators (display only; never for math). */
export function formatPeso(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const [whole, frac = ""] = amount.replace(/^-/, "").split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${amount.startsWith("-") ? "−" : ""}₱${grouped}.${(frac + "00").slice(0, 2)}`;
}
