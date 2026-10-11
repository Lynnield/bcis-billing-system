import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import type { SearchHit } from "@/shared/types";

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  service_account: "Account",
  invoice: "Invoice",
  payment: "Payment",
};

function destination(hit: SearchHit): string {
  if (hit.kind === "invoice" && hit.invoiceId) return `/billing-invoices/${hit.invoiceId}`;
  if (hit.kind === "payment" && hit.paymentId) return `/payments/${hit.paymentId}`;
  return `/service-accounts/${hit.serviceAccountId}`;
}

/**
 * Header search (spec 3.2): account number, name, contact number, address,
 * receipt number, invoice number and GCash reference. Ctrl+K focuses it.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () => window.bcis.search.query(debounced),
    enabled: debounced.length >= 2,
  });
  const hits = data?.data ?? [];

  const go = (hit: SearchHit) => {
    setOpen(false);
    setQ("");
    navigate(destination(hit));
  };

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && hits[active]) go(hits[active]!);
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search account, name, phone, invoice, receipt, GCash ref…  (Ctrl+K)"
        aria-label="Global search"
        className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {open && debounced.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-auto rounded-md border bg-card shadow-lg" role="listbox">
          {isFetching && hits.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matches</p>
          ) : (
            hits.map((h, i) => (
              <button
                key={`${h.kind}-${h.invoiceId ?? h.paymentId ?? h.serviceAccountId}-${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(h)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60 ${i === active ? "bg-muted/60" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{h.subscriberName}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {h.accountNumber} · {h.serviceNumber}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className="font-medium">{KIND_LABEL[h.kind]}</span>
                  <span className="block font-mono text-muted-foreground">{h.reference}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
