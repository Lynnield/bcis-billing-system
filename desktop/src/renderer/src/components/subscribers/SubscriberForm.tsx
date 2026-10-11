import * as React from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/lib/toast";
import { CreateSubscriberRequest, UpdateSubscriberRequest, Subscriber, SubscriberStatus } from "@/shared/types";

interface SubscriberFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: Subscriber;
  isEditing: boolean;
  isLoading?: boolean;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
  { value: "disconnected", label: "Disconnected" },
  { value: "pending", label: "Pending" },
];

// Form data includes all fields for both create and update
interface SubscriberFormData {
  accountNumber: string;
  firstName: string;
  lastName: string;
  contactNumber?: string;
  email?: string;
  addressLine1: string;
  addressLine2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  notes?: string;
  status: SubscriberStatus;
}

export function SubscriberForm({ open, onClose, onSuccess, initialData, isEditing, isLoading }: SubscriberFormProps) {
  const { error: showError, success: showSuccess } = useToast();
  const isCreate = !isEditing;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<SubscriberFormData>({
    defaultValues: initialData
      ? {
          accountNumber: initialData.accountNumber,
          firstName: initialData.firstName,
          lastName: initialData.lastName,
          contactNumber: initialData.contactNumber ?? "",
          email: initialData.email ?? "",
          addressLine1: initialData.addressLine1,
          addressLine2: initialData.addressLine2 ?? "",
          city: initialData.city ?? "",
          province: initialData.province ?? "",
          postalCode: initialData.postalCode ?? "",
          notes: initialData.notes ?? "",
          status: initialData.status,
        }
      : {
          accountNumber: "",
          firstName: "",
          lastName: "",
          contactNumber: "",
          email: "",
          addressLine1: "",
          addressLine2: "",
          city: "",
          province: "",
          postalCode: "",
          notes: "",
          status: "pending",
        },
  });

  const onSubmit = async (data: SubscriberFormData) => {
    try {
      if (isCreate) {
        // createSchema's optional fields are plain .optional() (not
        // nullable) — a blank input must be omitted as undefined, not sent
        // as "" (e.g. "" fails email's .email() check since .optional()
        // only skips undefined, not an empty-but-present string).
        const payload: CreateSubscriberRequest = {
          accountNumber: data.accountNumber,
          firstName: data.firstName,
          lastName: data.lastName,
          addressLine1: data.addressLine1,
          status: data.status,
          contactNumber: data.contactNumber?.trim() || undefined,
          email: data.email?.trim() || undefined,
          addressLine2: data.addressLine2?.trim() || undefined,
          city: data.city?.trim() || undefined,
          province: data.province?.trim() || undefined,
          postalCode: data.postalCode?.trim() || undefined,
          notes: data.notes?.trim() || undefined,
        };
        await window.bcis.subscribers.create(payload);
      } else if (initialData) {
        // updateSchema is .strict() with no accountNumber/status fields —
        // status changes go through a dedicated endpoint — so sending them
        // here fails validation outright. Its optional fields are
        // .nullable(), where null means "clear it" and undefined means
        // "leave unchanged"; since this form always shows the field's
        // current value, a blank input here means the user explicitly
        // cleared it, so blank maps to null, not undefined.
        const payload: UpdateSubscriberRequest = {
          firstName: data.firstName,
          lastName: data.lastName,
          addressLine1: data.addressLine1,
          contactNumber: data.contactNumber?.trim() || null,
          email: data.email?.trim() || null,
          addressLine2: data.addressLine2?.trim() || null,
          city: data.city?.trim() || null,
          province: data.province?.trim() || null,
          postalCode: data.postalCode?.trim() || null,
          notes: data.notes?.trim() || null,
        };
        await window.bcis.subscribers.update(initialData.id, payload);
      }
      showSuccess(isCreate ? "Subscriber created" : "Subscriber updated");
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save subscriber";
      if (message.includes("Account number already exists")) {
        setError("accountNumber", { type: "manual", message });
      } else {
        showError("Error", message);
      }
    }
  };

  React.useEffect(() => {
    if (open) {
      reset(initialData
        ? {
            accountNumber: initialData.accountNumber,
            firstName: initialData.firstName,
            lastName: initialData.lastName,
            contactNumber: initialData.contactNumber ?? "",
            email: initialData.email ?? "",
            addressLine1: initialData.addressLine1,
            addressLine2: initialData.addressLine2 ?? "",
            city: initialData.city ?? "",
            province: initialData.province ?? "",
            postalCode: initialData.postalCode ?? "",
            notes: initialData.notes ?? "",
            status: initialData.status,
          }
        : {
            accountNumber: "",
            firstName: "",
            lastName: "",
            contactNumber: "",
            email: "",
            addressLine1: "",
            addressLine2: "",
            city: "",
            province: "",
            postalCode: "",
            notes: "",
            status: "pending",
          });
    }
  }, [open, initialData, reset]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCreate ? "Create Subscriber" : "Edit Subscriber"}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={() => handleSubmit(onSubmit)()} disabled={isLoading}>
            {isLoading ? "Saving..." : isCreate ? "Create" : "Save Changes"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Account Number *"
            {...register("accountNumber", { required: "Account number is required", maxLength: 50 })}
            disabled={isEditing}
            error={errors.accountNumber?.message}
            placeholder="ACC-001"
          />
          <Select
            label="Status *"
            options={STATUS_OPTIONS}
            {...register("status", { required: true })}
            error={errors.status?.message}
            placeholder="Select status"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="First Name *"
            {...register("firstName", { required: "First name is required", maxLength: 100 })}
            error={errors.firstName?.message}
            placeholder="John"
          />
          <Input
            label="Last Name *"
            {...register("lastName", { required: "Last name is required", maxLength: 100 })}
            error={errors.lastName?.message}
            placeholder="Doe"
          />
        </div>

        <Input
          label="Contact Number"
          type="tel"
          {...register("contactNumber", { maxLength: 50 })}
          error={errors.contactNumber?.message}
          placeholder="+1 (555) 123-4567"
        />

        <Input
          label="Email"
          type="email"
          {...register("email", { maxLength: 255, pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Invalid email format" } })}
          error={errors.email?.message}
          placeholder="john.doe@example.com"
        />

        <Input
          label="Address Line 1 *"
          {...register("addressLine1", { required: "Address is required", maxLength: 255 })}
          error={errors.addressLine1?.message}
          placeholder="123 Main Street"
        />

        <Input
          label="Address Line 2"
          {...register("addressLine2", { maxLength: 255 })}
          error={errors.addressLine2?.message}
          placeholder="Apt 4B"
        />

        <div className="grid gap-4 md:grid-cols-3">
          <Input
            label="City"
            {...register("city", { maxLength: 100 })}
            error={errors.city?.message}
            placeholder="Manila"
          />
          <Input
            label="Province"
            {...register("province", { maxLength: 100 })}
            error={errors.province?.message}
            placeholder="Metro Manila"
          />
          <Input
            label="Postal Code"
            {...register("postalCode", { maxLength: 20 })}
            error={errors.postalCode?.message}
            placeholder="1000"
          />
        </div>
        <Textarea
          label="Notes"
          {...register("notes", { maxLength: 4000 })}
          error={errors.notes?.message}
          placeholder="e.g. Landmark, preferred contact time, special instructions"
          rows={3}
        />
      </form>
    </Modal>
  );
}