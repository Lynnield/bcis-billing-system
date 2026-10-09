import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { getUsers, getRoles, updateUser } from "@/lib/user-api";
import { UserForm } from "./UserForm";
import { ManageUserModal } from "./ManageUserModal";
import type { UserListRow, UserAccountStatus } from "@/shared/types";
import { Plus, Settings2, Ban, CheckCircle2 } from "lucide-react";

const statusBadgeVariant: Record<UserAccountStatus, "success" | "secondary"> = {
  active: "success",
  inactive: "secondary",
};

export function UserManagementPage() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const { success: showSuccess, error: showError } = useToast();

  const [formOpen, setFormOpen] = React.useState(false);
  const [managingUser, setManagingUser] = React.useState<UserListRow | null>(null);

  const { data: usersData, isLoading, error, refetch } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
  });

  const { data: rolesData } = useQuery({
    queryKey: ["roles"],
    queryFn: getRoles,
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: UserAccountStatus }) => updateUser(id, { status }),
    onSuccess: () => {
      showSuccess("User status updated");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: unknown) => showError("Failed to update status", err instanceof Error ? err.message : "Unknown error"),
  });

  const users = usersData?.users ?? [];
  const roles = rolesData?.roles ?? [];

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">User Management</h2>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">Failed to load users</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
          <Button onClick={() => refetch()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">User Management</h2>
          <p className="text-muted-foreground">Create accounts, assign roles, and reset passwords. Owner only.</p>
        </div>
        <Button onClick={() => setFormOpen(true)} disabled={roles.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Full Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[180px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono font-medium">{u.username}</TableCell>
                  <TableCell>{u.fullName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r} variant="secondary">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[u.status]}>{u.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="icon" onClick={() => setManagingUser(u)} aria-label={`Manage ${u.username}`}>
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => toggleStatusMutation.mutate({ id: u.id, status: u.status === "active" ? "inactive" : "active" })}
                        disabled={toggleStatusMutation.isPending || u.id === currentUser?.id}
                        aria-label={u.status === "active" ? `Deactivate ${u.username}` : `Activate ${u.username}`}
                        title={u.id === currentUser?.id ? "You cannot deactivate your own account" : undefined}
                      >
                        {u.status === "active" ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <UserForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={() => {
          setFormOpen(false);
          queryClient.invalidateQueries({ queryKey: ["users"] });
        }}
        roles={roles}
      />

      <ManageUserModal
        open={managingUser !== null}
        onClose={() => setManagingUser(null)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["users"] });
        }}
        user={managingUser}
        roles={roles}
      />
    </div>
  );
}
