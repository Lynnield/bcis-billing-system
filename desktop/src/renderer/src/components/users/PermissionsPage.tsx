import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { Loader2, Save, Undo2 } from "lucide-react";

/**
 * Spec 4.4 role/permission matrix. Readable with user.view; editable with
 * user.manage. The API enforces every permission on every request — this
 * screen only edits which roles hold them. Each saved role is audited.
 */
export function PermissionsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const canEdit = !!user?.permissions?.includes("user.manage");

  const { data, isLoading, error } = useQuery({ queryKey: ["permission-matrix"], queryFn: () => window.bcis.permissions.getMatrix() });
  const matrix = data?.data;

  // roleId -> set of codes being edited (only roles the user has touched).
  const [draft, setDraft] = React.useState<Record<number, Set<string>>>({});

  const save = useMutation({
    mutationFn: async () => {
      for (const [roleId, codes] of Object.entries(draft)) {
        await window.bcis.permissions.updateRole(Number(roleId), [...codes]);
      }
    },
    onSuccess: () => {
      showSuccess("Permissions saved", "Users get the new permissions on their next action.");
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["permission-matrix"] });
    },
    onError: (err: unknown) => showError("Could not save permissions", err instanceof Error ? err.message : ""),
  });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (error || !matrix) return <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load permissions"}</p>;

  const granted = (roleId: number, code: string) =>
    draft[roleId] ? draft[roleId]!.has(code) : !!matrix.roles.find((r) => r.id === roleId)?.permissions.includes(code);

  const toggle = (roleId: number, code: string) => {
    setDraft((d) => {
      const current = d[roleId] ?? new Set(matrix.roles.find((r) => r.id === roleId)!.permissions);
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return { ...d, [roleId]: next };
    });
  };

  const dirty = Object.keys(draft).length > 0;
  const groups = [...new Set(matrix.permissions.map((p) => p.group))];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Roles &amp; Permissions</h2>
          <p className="text-muted-foreground">
            What each role may do. The server checks these on every request; hiding a button is never the safeguard.
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDraft({})} disabled={!dirty || save.isPending}>
              <Undo2 className="mr-2 h-4 w-4" />
              Discard
            </Button>
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {save.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        )}
      </div>
      {!canEdit && <p className="text-sm text-muted-foreground">Read-only: changing permissions requires user.manage (Owner).</p>}

      <div className="max-h-[70vh] overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[280px]">Permission</TableHead>
              {matrix.roles.map((r) => (
                <TableHead key={r.id} className="text-center text-xs">
                  {r.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.flatMap((g) => [
              <TableRow key={`g-${g}`} className="bg-muted/40 hover:bg-muted/40">
                <TableCell colSpan={matrix.roles.length + 1} className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g}
                </TableCell>
              </TableRow>,
              ...matrix.permissions
                .filter((p) => p.group === g)
                .map((p) => (
                  <TableRow key={p.code}>
                    <TableCell>
                      <span className="block text-sm">{p.description}</span>
                      <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                    </TableCell>
                    {matrix.roles.map((r) => {
                      const on = granted(r.id, p.code);
                      const locked = r.name === "Owner / Super Admin" && p.code === "user.manage";
                      return (
                        <TableCell key={r.id} className="text-center">
                          <input
                            type="checkbox"
                            aria-label={`${r.name}: ${p.code}`}
                            checked={on}
                            disabled={!canEdit || locked || save.isPending}
                            title={locked ? "The Owner always keeps user.manage" : undefined}
                            onChange={() => toggle(r.id, p.code)}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                )),
            ])}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
