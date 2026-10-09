import * as React from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/lib/toast";
import { createUser } from "@/lib/user-api";
import type { CreateUserRequest, Role } from "@/shared/types";

interface UserFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  roles: Role[];
}

interface FormData {
  username: string;
  email: string;
  fullName: string;
  password: string;
}

export function UserForm({ open, onClose, onSuccess, roles }: UserFormProps) {
  const { error: showError, success: showSuccess } = useToast();
  const [isSaving, setIsSaving] = React.useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = React.useState<number[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ defaultValues: { username: "", email: "", fullName: "", password: "" } });

  React.useEffect(() => {
    if (open) {
      reset({ username: "", email: "", fullName: "", password: "" });
      setSelectedRoleIds([]);
    }
  }, [open, reset]);

  const toggleRole = (roleId: number) => {
    setSelectedRoleIds((prev) => (prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]));
  };

  const onSubmit = async (data: FormData) => {
    if (selectedRoleIds.length === 0) {
      showError("Error", "Select at least one role");
      return;
    }
    setIsSaving(true);
    try {
      const payload: CreateUserRequest = {
        username: data.username.trim(),
        email: data.email.trim(),
        fullName: data.fullName.trim(),
        password: data.password,
        roleIds: selectedRoleIds,
      };
      await createUser(payload);
      showSuccess("User created");
      onSuccess();
    } catch (err) {
      showError("Error", err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add User"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={() => handleSubmit(onSubmit)()} disabled={isSaving}>
            {isSaving ? "Creating..." : "Create User"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Username *"
          {...register("username", { required: "Username is required", minLength: { value: 3, message: "At least 3 characters" } })}
          error={errors.username?.message}
          placeholder="e.g. jreyes"
        />
        <Input
          label="Email *"
          type="email"
          {...register("email", { required: "Email is required" })}
          error={errors.email?.message}
          placeholder="name@bcis.local"
        />
        <Input
          label="Full Name *"
          {...register("fullName", { required: "Full name is required" })}
          error={errors.fullName?.message}
          placeholder="e.g. Juan Reyes"
        />
        <Input
          label="Temporary Password *"
          type="password"
          {...register("password", { required: "Password is required", minLength: { value: 12, message: "At least 12 characters" } })}
          error={errors.password?.message}
          helperText="At least 12 characters. Share this with the user; they are not prompted to change it on first login."
        />
        <div>
          <p className="text-sm font-medium mb-2">Roles *</p>
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
        </div>
      </form>
    </Modal>
  );
}
