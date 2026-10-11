import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/lib/toast";
import { AlertTriangle, ExternalLink, FileText, Loader2, Upload } from "lucide-react";
import type { PaymentDetail, PaymentProofUploadResult } from "@/shared/types";

type ProofWithDuplicates = PaymentDetail["proofs"][number];

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Inline preview of one uploaded proof; PDFs open in the system viewer. */
export function ProofViewer({ proof, className }: { proof: ProofWithDuplicates; className?: string }) {
  const { error: showError } = useToast();
  const { data, isLoading, error } = useQuery({
    queryKey: ["payment-proof-preview", proof.id],
    queryFn: () => window.bcis.paymentProofs.getPreview(proof.id),
    staleTime: Infinity,
  });

  const openExternally = () =>
    window.bcis.paymentProofs.open(proof.id).catch((err: unknown) => showError("Could not open proof", err instanceof Error ? err.message : ""));

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate font-medium" title={proof.originalName}>
          {proof.originalName}
        </span>
        <span className="shrink-0 text-muted-foreground tabular-nums">{formatSize(proof.sizeBytes)}</span>
      </div>
      {proof.duplicates.length > 0 && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Possible duplicate: this exact file is also attached to{" "}
            {proof.duplicates.map((d) => (d.paymentId ? `payment #${d.paymentId}` : "an unsubmitted upload")).join(", ")}.
          </span>
        </div>
      )}
      <div className="mt-2 flex min-h-[200px] items-center justify-center rounded-md border bg-muted/30 p-2">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : error ? (
          <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Could not load proof"}</p>
        ) : data?.dataUrl ? (
          <img src={data.dataUrl} alt={`Proof: ${proof.originalName}`} className="max-h-[60vh] max-w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-8 w-8" aria-hidden="true" />
            PDF document
          </div>
        )}
      </div>
      <Button variant="outline" size="sm" className="mt-2" onClick={openExternally}>
        <ExternalLink className="mr-2 h-4 w-4" />
        Open full size
      </Button>
    </div>
  );
}

/** Upload button for a payment proof. Reports the uploaded proof (or null when cleared). */
export function ProofUploadField({
  value,
  onChange,
  disabled,
}: {
  value: PaymentProofUploadResult | null;
  onChange: (next: PaymentProofUploadResult | null) => void;
  disabled?: boolean;
}) {
  const { error: showError } = useToast();
  const [uploading, setUploading] = React.useState(false);

  const pick = async () => {
    setUploading(true);
    try {
      const result = await window.bcis.paymentProofs.upload();
      if (result) onChange(result);
    } catch (err) {
      showError("Upload failed", err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : "");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium leading-none">Proof of Payment</span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={pick} disabled={disabled || uploading}>
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {value ? "Replace file…" : "Attach file…"}
        </Button>
        {value && (
          <>
            <span className="truncate text-sm" title={value.data.originalName}>
              {value.data.originalName} <span className="text-muted-foreground">({formatSize(value.data.sizeBytes)})</span>
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} disabled={disabled}>
              Remove
            </Button>
          </>
        )}
      </div>
      {value && value.duplicates.length > 0 && (
        <p className="flex items-center gap-1 text-sm text-warning" role="alert">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          This exact file was uploaded before — check it is not a duplicate submission.
        </p>
      )}
      <p className="text-xs text-muted-foreground">PNG, JPEG, WEBP or PDF, up to 5 MB. Stored on the server; checked again there.</p>
    </div>
  );
}
