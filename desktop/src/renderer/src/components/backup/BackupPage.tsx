import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/lib/toast";
import { getBackups, createBackup, verifyBackup, restoreBackup } from "@/lib/backup-api";
import type { BackupRecord, BackupStatus } from "@/shared/types";
import { DatabaseBackup, ShieldCheck, RotateCcw, Loader2 } from "lucide-react";

const statusBadgeVariant: Record<BackupStatus, "default" | "success" | "warning" | "destructive" | "secondary"> = {
  completed: "default",
  verified: "success",
  failed: "destructive",
  restored: "secondary",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupPage() {
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();
  const [restoreTarget, setRestoreTarget] = React.useState<BackupRecord | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["backup-history"],
    queryFn: getBackups,
  });

  const createMutation = useMutation({
    mutationFn: createBackup,
    onSuccess: () => {
      showSuccess("Backup created");
      queryClient.invalidateQueries({ queryKey: ["backup-history"] });
    },
    onError: (err: unknown) => showError("Backup failed", err instanceof Error ? err.message : "Unknown error"),
  });

  const verifyMutation = useMutation({
    mutationFn: verifyBackup,
    onSuccess: () => {
      showSuccess("Backup verified");
      queryClient.invalidateQueries({ queryKey: ["backup-history"] });
    },
    onError: (err: unknown) => showError("Verification failed", err instanceof Error ? err.message : "Unknown error"),
  });

  const restoreMutation = useMutation({
    mutationFn: restoreBackup,
    onSuccess: () => {
      showSuccess("Database restored");
      setRestoreTarget(null);
      queryClient.invalidateQueries({ queryKey: ["backup-history"] });
    },
    onError: (err: unknown) => showError("Restore failed", err instanceof Error ? err.message : "Unknown error"),
  });

  const backups = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Backup &amp; Restore</h2>
          <p className="text-muted-foreground">Create, verify and restore database backups. Owner only.</p>
        </div>
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          {createMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <DatabaseBackup className="mr-2 h-4 w-4" />
          )}
          {createMutation.isPending ? "Creating backup..." : "Create Backup"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">Failed to load backup history</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
          <Button onClick={() => refetch()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filename</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Verified</TableHead>
              <TableHead>Restored</TableHead>
              <TableHead className="w-[220px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : backups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No backups yet — create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              backups.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-sm">{b.filename}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBytes(b.sizeBytes)}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[b.status]}>{b.status}</Badge>
                  </TableCell>
                  <TableCell>{new Date(b.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{b.verifiedAt ? new Date(b.verifiedAt).toLocaleString() : "—"}</TableCell>
                  <TableCell>{b.restoredAt ? new Date(b.restoredAt).toLocaleString() : "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => verifyMutation.mutate(b.id)}
                        disabled={verifyMutation.isPending || b.status === "restored"}
                      >
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                        Verify
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setRestoreTarget(b)}
                        disabled={b.status === "failed"}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Restore
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Modal
        open={restoreTarget !== null}
        onClose={() => {
          if (!restoreMutation.isPending) setRestoreTarget(null);
        }}
        title="Restore Database"
        description={`This replaces every table in the live database with the contents of "${restoreTarget?.filename}". Any data created after this backup was taken will be lost. This cannot be undone.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setRestoreTarget(null)} disabled={restoreMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => restoreTarget && restoreMutation.mutate(restoreTarget.id)}
              disabled={restoreMutation.isPending}
            >
              {restoreMutation.isPending ? "Restoring..." : "Confirm Restore"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Checksum: <span className="font-mono">{restoreTarget?.checksumSha256.slice(0, 16)}…</span>
        </p>
      </Modal>
    </div>
  );
}
