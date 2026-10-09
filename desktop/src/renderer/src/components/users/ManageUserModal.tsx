import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/lib/toast";
import { updateUserRoles, resetUserPassword } from "@/lib/user-api";
import type { Role, UserListRow } from "@/shared/types";
import { KeyRound, ShieldCheck } from "lucide-react";

interface ManageUserModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: UserListRow | null;
  roles: Role[];
}

export function ManageUserModal({ open, onClose, onSuccess, user, roles }: ManageUserModalProps) {
  const { error: showError, success: showSuccess } = useToast();
  const [selectedRoleIds, setSelectedRoleIds] = React.useState<number[]>([]);
  const [newPassword, setNewPassword] = React.useState("");
  const [isSavingRoles, setIsSavingRoles] = React.useState(false);
  const [isResetting, setIsResetting] = React.useState(false);

  React.useEffect(() => {
    if (open && user) {
      setSelectedRoleIds(roles.filter((r) => user.roles.includes(r.name)).map((r) => r.id));
      setNewPassword("");
    }
  }, [open, user, roles]);

  if (!user) return null;

  const toggleRole = (roleId: number) => {
    setSelectedRoleIds((prev) => (prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]));
  };

  const saveRoles = async () => {
    if (selectedRoleIds.length === 0) {
      showError("Error", "A user must have at least one role");
      return;
    }
    setIsSavingRoles(true);
    try {
      await updateUserRoles(user.id, { roleIds: selectedRoleIds });
      showSuccess("Roles updated");
      onSuccess();
    } catch (err) {
      showError("Error", err instanceof Error ? err.message : "Failed to update roles");
    } finally {
      setIsSavingRoles(false);
    }
  };

  const doReset = async () => {
    if (newPassword.length < 12) {
      showError("Error", "Password must be at least 12 characters");
      return;
    }
    setIsResetting(true);
    try {
      await resetUserPassword(user.id, { password: newPassword });
      showSuccess("Password reset", "Share the new password with the user directly.");
      setNewPassword("");
    } catch (err) {
      showError("Error", err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Manage ${user.fullName}`} size="md">
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            Roles
          </p>
          <div className="space-y-2 rounded-md border p-3">
            {roles.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedRoleIds.includes(r.id)}
                  onChange={() => toggleRole(r.id)}
                  className="h-4 w-4 rounded border-input"
                />
                {r.name}
              </label>
            ))}
          </div>
          <Button size="sm" className="mt-2" onClick={saveRoles} disabled={isSavingRoles}>
            {isSavingRoles ? "Saving..." : "Save Roles"}
          </Button>
        </div>

        <div>
          <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <KeyRound className="h-4 w-4" />
            Reset Password
          </p>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New temporary password (min 12 characters)"
          />
          <Button size="sm" variant="outline" className="mt-2" onClick={doReset} disabled={isResetting || !newPassword}>
            {isResetting ? "Resetting..." : "Reset Password"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
