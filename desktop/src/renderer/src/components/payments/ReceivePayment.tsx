import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useToast } from "@/lib/toast";
import { createPayment } from "@/lib/payment-api";
import type { CreatePaymentRequest, PaymentMethod, PaymentProofUploadResult, SearchHit } from "@/shared/types";
import { ProofUploadField } from "./ProofViewer";
import { PaymentDetail } from "./PaymentDetail";
import { CheckCircle2, Loader2, Printer, Search } from "lucide-react";

// Same rule as the API's moneyString: up to 2 decimals, kept as a string.
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

const METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Cashier screen (spec 4.3): search -> balance -> amount/method ->
 * allocation preview -> post -> print receipt, on one page.
 */
export function ReceivePayment() {
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();
  const searchRef = React.useRef<HTMLInputElement>(null);

  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<SearchHit | null>(null);
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [gcashRef, setGcashRef] = React.useState("");
  const [referenceNumber, setReferenceNumber] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState("");
  const [proof, setProof] = React.useState<PaymentProofUploadResult | null>(null);
  const [posted, setPosted] = React.useState<{ id: number; receiptNumber: string | null; status: string } | null>(null);
  const [printingId, setPrintingId] = React.useState<number | null>(null);

  const debouncedQuery = useDebounced(query.trim(), 250);
  const debouncedAmount = useDebounced(amount.trim(), 300);

  const { data: searchData, isFetching: searching } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () => window.bcis.search.query(debouncedQuery),
    enabled: debouncedQuery.length >= 2 && !selected,
  });

  const { data: accountData, isLoading: accountLoading } = useQuery({
    queryKey: ["receivable-account", selected?.serviceAccountId],
    queryFn: () => window.bcis.receivables.getAccount(selected!.serviceAccountId),
    enabled: !!selected,
  });
  const account = accountData?.data;

  const amountValid = AMOUNT_PATTERN.test(debouncedAmount) && !/^0+(\.0+)?$/.test(debouncedAmount);
  const { data: previewData, isFetching: previewing } = useQuery({
    queryKey: ["allocation-preview", selected?.serviceAccountId, debouncedAmount],
    queryFn: () => window.bcis.payments.previewAllocation(selected!.serviceAccountId, debouncedAmount),
    enabled: !!selected && amountValid && method !== "gcash",
  });
  const preview = previewData?.data;

  React.useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Default the amount to the full balance when an account is picked.
  React.useEffect(() => {
    if (account && !amount) setAmount(account.outstandingBalance === "0.00" ? "" : account.outstandingBalance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.serviceAccount.id]);

  const reset = () => {
    setQuery("");
    setSelected(null);
    setAmount("");
    setMethod("cash");
    setGcashRef("");
    setReferenceNumber("");
    setPaymentDate("");
    setProof(null);
    setPosted(null);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const mutation = useMutation({
    mutationFn: (payload: CreatePaymentRequest) => createPayment(payload),
    onSuccess: (res) => {
      const p = res.data;
      setPosted({ id: p.id, receiptNumber: p.receiptNumber, status: p.status });
      showSuccess(p.status === "pending" ? "GCash payment submitted for verification" : `Payment posted — receipt ${p.receiptNumber ?? ""}`);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["receivable-account"] });
    },
    onError: (err: unknown) => showError("Payment failed", err instanceof Error ? err.message : "Request failed"),
  });

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (mutation.isPending || !selected) return;
    const amt = amount.trim();
    if (!AMOUNT_PATTERN.test(amt) || /^0+(\.0+)?$/.test(amt)) {
      showError("Check the amount", "Enter an amount like 500 or 500.00");
      return;
    }
    if (method === "gcash" && !gcashRef.trim()) {
      showError("GCash reference required", "Enter the reference number from the customer's GCash receipt.");
      return;
    }
    const isGcash = method === "gcash";
    mutation.mutate({
      serviceAccountId: selected.serviceAccountId,
      method,
      amount: amt,
      ...(paymentDate ? { paymentDate } : {}),
      ...(referenceNumber.trim() ? { referenceNumber: referenceNumber.trim() } : {}),
      ...(!isGcash && proof ? { proofId: proof.data.id } : {}),
      ...(isGcash ? { gcash: { gcashReferenceNumber: gcashRef.trim(), ...(proof ? { proofId: proof.data.id } : {}) } } : {}),
    });
  };

  if (printingId !== null) {
    return <PaymentDetail paymentId={printingId} onBack={() => setPrintingId(null)} />;
  }

  // Unique service accounts from the hits, in the order they were found.
  const hits = searchData?.data ?? [];
  const accountsFound = [...new Map(hits.map((h) => [h.serviceAccountId, h])).values()];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Receive Payment</h2>
        <p className="text-muted-foreground">Search the subscriber, confirm the balance, enter the amount, review the allocation and post.</p>
      </div>

      {posted ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-6">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
              {posted.status === "pending" ? "Submitted for GCash verification" : "Payment posted"}
            </div>
            {posted.status === "pending" ? (
              <p className="text-sm text-muted-foreground">
                Nothing has been applied to the account yet. An authorized reviewer will verify or reject it in GCash Verification.
              </p>
            ) : (
              <p className="text-sm">
                Receipt number <span className="font-mono font-semibold">{posted.receiptNumber}</span>
              </p>
            )}
            <div className="flex gap-2">
              {posted.status !== "pending" && (
                <Button onClick={() => setPrintingId(posted.id)}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print Receipt
                </Button>
              )}
              <Button variant="outline" onClick={reset}>
                Next Payment
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            {/* 1. Search */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">1. Find account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {selected ? (
                  <div className="flex items-start justify-between gap-2 rounded-md border p-3">
                    <div className="text-sm">
                      <p className="font-medium">{selected.subscriberName}</p>
                      <p className="text-muted-foreground font-mono">
                        {selected.accountNumber} · {selected.serviceNumber}
                      </p>
                      <p className="text-muted-foreground">{selected.planName}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={reset}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <input
                        ref={searchRef}
                        aria-label="Search subscriber"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && accountsFound.length === 1) setSelected(accountsFound[0]!);
                        }}
                        placeholder="Account no., name, phone, address, invoice, receipt or GCash ref"
                        className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                    {searching && <p className="text-sm text-muted-foreground">Searching…</p>}
                    {debouncedQuery.length >= 2 && !searching && accountsFound.length === 0 && (
                      <p className="text-sm text-muted-foreground">No matching accounts</p>
                    )}
                    <ul className="max-h-72 divide-y overflow-auto rounded-md border empty:hidden">
                      {accountsFound.map((h) => (
                        <li key={h.serviceAccountId}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                            onClick={() => setSelected(h)}
                          >
                            <span>
                              <span className="font-medium">{h.subscriberName}</span>
                              <span className="block font-mono text-xs text-muted-foreground">
                                {h.accountNumber} · {h.serviceNumber}
                              </span>
                            </span>
                            <span className="text-right text-xs text-muted-foreground">
                              matched {h.matchedOn}
                              <Badge variant="outline" className="ml-2">
                                {h.serviceStatus.replace("_", " ")}
                              </Badge>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>

            {/* 2. Balance */}
            {selected && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">2. Balance</CardTitle>
                </CardHeader>
                <CardContent>
                  {accountLoading || !account ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Outstanding</p>
                          <p className="text-2xl font-semibold tabular-nums">₱{account.outstandingBalance}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Overdue</p>
                          <p className={`text-2xl font-semibold tabular-nums ${account.overdueBalance !== "0.00" ? "text-destructive" : ""}`}>
                            ₱{account.overdueBalance}
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {account.outstandingInvoiceCount} open invoice(s), {account.overdueInvoiceCount} overdue
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* 3. Payment + preview */}
          {selected && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">3. Payment</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={submit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input label="Amount (₱) *" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
                    <Select label="Method *" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} options={METHOD_OPTIONS} />
                  </div>
                  {method === "gcash" ? (
                    <Input label="GCash Reference Number *" value={gcashRef} onChange={(e) => setGcashRef(e.target.value)} placeholder="13-digit reference from the GCash receipt" />
                  ) : method !== "cash" ? (
                    <Input label="Reference Number" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Bank / cheque reference" />
                  ) : null}
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input label="Payment Date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} helperText="Defaults to today" />
                  </div>
                  {method !== "cash" && <ProofUploadField value={proof} onChange={setProof} disabled={mutation.isPending} />}

                  {method === "gcash" ? (
                    <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                      GCash payments are held as <span className="font-medium">pending</span> and allocated only after an authorized reviewer verifies the proof.
                    </p>
                  ) : (
                    <div>
                      <p className="mb-1 text-sm font-medium">
                        Allocation preview {previewing && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
                      </p>
                      {!amountValid ? (
                        <p className="text-sm text-muted-foreground">Enter an amount to see how it will be applied.</p>
                      ) : preview ? (
                        <>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Invoice</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                                <TableHead className="text-right">Applied</TableHead>
                                <TableHead className="text-right">Remaining</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {preview.allocations.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                                    No open invoices
                                  </TableCell>
                                </TableRow>
                              ) : (
                                preview.allocations.map((a) => (
                                  <TableRow key={a.invoiceId}>
                                    <TableCell className="font-mono">{a.invoiceNumber}</TableCell>
                                    <TableCell className="text-right tabular-nums">{a.balance}</TableCell>
                                    <TableCell className="text-right tabular-nums font-medium">{a.applied}</TableCell>
                                    <TableCell className="text-right tabular-nums">{a.remainingBalance}</TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                          <div className="mt-2 flex justify-between text-sm">
                            <span>Balance after payment</span>
                            <span className="font-semibold tabular-nums">₱{preview.balanceAfter}</span>
                          </div>
                          {preview.unapplied !== "0.00" && (
                            <p className="text-sm text-muted-foreground">
                              ₱{preview.unapplied} will be kept as an advance and applied to future invoices.
                            </p>
                          )}
                        </>
                      ) : null}
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={mutation.isPending}>
                    {mutation.isPending ? "Posting…" : method === "gcash" ? "Submit for Verification" : "Post Payment"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
