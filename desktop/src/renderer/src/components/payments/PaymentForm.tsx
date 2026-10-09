import * as React from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/lib/toast";
import { getServiceAccounts } from "@/lib/service-account-api";
import { createPayment } from "@/lib/payment-api";
import type { CreatePaymentRequest, PaymentMethod } from "@/shared/types";

interface PaymentFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// Matches the backend's moneyString schema (api/src/routes/payments.ts):
// a non-negative amount with up to 2 decimal places, validated as a string.
// Never parsed to a JS number for math — the API does exact-cents math.
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

const METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

interface PaymentFormData {
  serviceAccountId: number;
  method: PaymentMethod;
  amount: string;
  paymentDate: string;
  receiptNumber: string;
  referenceNumber: string;
  gcashReferenceNumber: string;
  proofAttachmentPath: string;
}

const EMPTY_FORM: PaymentFormData = {
  serviceAccountId: 0,
  method: "cash",
  amount: "",
  paymentDate: "",
  receiptNumber: "",
  referenceNumber: "",
  gcashReferenceNumber: "",
  proofAttachmentPath: "",
};

function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

export function PaymentForm({ open, onClose, onSuccess }: PaymentFormProps) {
  const { error: showError, success: showSuccess } = useToast();

  // API caps pageSize at 100 (api/src/routes/service-accounts.ts) —
  // requesting more fails validation with 400 "Invalid query parameters".
  const { data: serviceAccountsData } = useQuery({
    queryKey: ["service-accounts-for-payment-form"],
    queryFn: () => getServiceAccounts({ pageSize: 100 }),
    staleTime: 60_000,
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors },
  } = useForm<PaymentFormData>({ defaultValues: EMPTY_FORM });

  const method = watch("method");

  React.useEffect(() => {
    if (open) reset(EMPTY_FORM);
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (data: CreatePaymentRequest) => createPayment(data),
    onSuccess: () => {
      showSuccess("Payment posted");
      onSuccess();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to post payment";
      showError("Payment failed", message);
    },
  });

  const onSubmit = (data: PaymentFormData) => {
    // Guard against double submission (e.g. double-click or double Enter)
    // beyond the button's own disabled state — a second call while the
    // first is still in flight is simply ignored here; the backend's own
    // transaction and receipt/GCash-reference uniqueness constraints are
    // the authoritative safeguard against any duplicate that gets through.
    if (mutation.isPending) return;

    if (!data.serviceAccountId) {
      setError("serviceAccountId", { type: "manual", message: "Service account is required" });
      return;
    }
    if (!AMOUNT_PATTERN.test(data.amount.trim())) {
      setError("amount", { type: "manual", message: "Enter an amount like 500 or 500.00" });
      return;
    }
    if (data.method === "gcash" && !data.gcashReferenceNumber.trim()) {
      setError("gcashReferenceNumber", { type: "manual", message: "GCash reference number is required" });
      return;
    }

    const payload: CreatePaymentRequest = {
      serviceAccountId: data.serviceAccountId,
      method: data.method,
      amount: data.amount.trim(),
      paymentDate: data.paymentDate || undefined,
      receiptNumber: data.receiptNumber.trim() || undefined,
      referenceNumber: data.referenceNumber.trim() || undefined,
      gcash:
        data.method === "gcash"
          ? {
              gcashReferenceNumber: data.gcashReferenceNumber.trim(),
              proofAttachmentPath: data.proofAttachmentPath.trim() || undefined,
            }
          : undefined,
    };

    mutation.mutate(payload);
  };

  const accounts = serviceAccountsData?.data ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record Payment"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => handleSubmit(onSubmit)()} disabled={mutation.isPending}>
            {mutation.isPending ? "Posting..." : "Post Payment"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Select
          label="Service Account *"
          options={accounts.map((a) => ({
            value: String(a.id),
            label: `${a.serviceNumber} (${a.status})`,
          }))}
          {...register("serviceAccountId", { required: "Service account is required", valueAsNumber: true })}
          error={getErrorMessage(errors.serviceAccountId)}
          placeholder="Select service account"
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Payment Method *"
            options={METHOD_OPTIONS}
            {...register("method", { required: true })}
          />
          <Input
            label="Amount *"
            inputMode="decimal"
            {...register("amount", {
              required: "Amount is required",
              pattern: { value: AMOUNT_PATTERN, message: "Enter an amount like 500 or 500.00" },
            })}
            error={getErrorMessage(errors.amount)}
            placeholder="0.00"
          />
        </div>

        {method === "gcash" && (
          <div className="rounded-md border border-dashed p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              GCash payments are recorded as <span className="font-medium">pending verification</span>.
              Posting here does not confirm the funds were received — verification is a separate,
              authorized step and is not available in this screen.
            </p>
            <Input
              label="GCash Reference Number *"
              {...register("gcashReferenceNumber", {
                required: method === "gcash" ? "GCash reference number is required" : false,
                maxLength: 100,
              })}
              error={getErrorMessage(errors.gcashReferenceNumber)}
              placeholder="e.g. 1234567890123"
            />
            <Input
              label="Proof Attachment Path"
              {...register("proofAttachmentPath", { maxLength: 500 })}
              error={getErrorMessage(errors.proofAttachmentPath)}
              placeholder="Path or reference to the screenshot/receipt on file"
              helperText="Record where the proof is filed; this screen does not upload files."
            />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Payment Date" type="date" {...register("paymentDate")} />
          <Input
            label="Receipt Number"
            {...register("receiptNumber", { maxLength: 50 })}
            error={getErrorMessage(errors.receiptNumber)}
            placeholder="OR-0001"
          />
        </div>

        <Input
          label="Reference Number"
          {...register("referenceNumber", { maxLength: 100 })}
          error={getErrorMessage(errors.referenceNumber)}
          placeholder="Bank/cheque reference, if any"
        />

        <p className="text-sm text-muted-foreground">
          The amount is allocated oldest-invoice-first automatically; any portion left over is kept as
          an advance/unapplied balance on the account.
        </p>
      </form>
    </Modal>
  );
}
