import * as React from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/lib/toast";

interface BillingPeriodFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: { id: number; label: string; periodStart: string; periodEnd: string; dueDate: string };
  isEditing: boolean;
  isLoading?: boolean;
}

export function BillingPeriodForm({ open, onClose, onSuccess, initialData, isEditing, isLoading }: BillingPeriodFormProps) {
  const { error: showError, success: showSuccess } = useToast();
  const isCreate = !isEditing;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<any>({
    defaultValues: initialData
      ? {
          label: initialData.label,
          periodStart: initialData.periodStart,
          periodEnd: initialData.periodEnd,
          dueDate: initialData.dueDate,
        }
      : {
          label: "",
          periodStart: "",
          periodEnd: "",
          dueDate: "",
        },
  });

  const onSubmit = async (data: any) => {
    try {
      if (isCreate) {
        await window.bcis.billingPeriods.create(data);
      } else if (initialData?.id) {
        await window.bcis.billingPeriods.update(initialData.id, data);
      }
      showSuccess(isCreate ? "Billing period created" : "Billing period updated");
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save billing period";
      if (message.includes("already exists")) {
        setError("label", { type: "manual", message });
      } else {
        showError("Error", message);
      }
    }
  };

  React.useEffect(() => {
    if (open) {
      reset(initialData
        ? {
            label: initialData.label,
            periodStart: initialData.periodStart,
            periodEnd: initialData.periodEnd,
            dueDate: initialData.dueDate,
          }
        : {
            label: "",
            periodStart: "",
            periodEnd: "",
            dueDate: "",
          });
    }
  }, [open, initialData, reset]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCreate ? "Create Billing Period" : "Edit Billing Period"}
      size="md"
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
        <Input
          label="Label *"
          {...register("label", { required: "Label is required", maxLength: 100 })}
          error={errors.label?.message as string}
          placeholder="e.g., January 2026 Billing"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Period Start *"
            type="date"
            {...register("periodStart", { required: "Period start is required" })}
            error={errors.periodStart?.message as string}
          />
          <Input
            label="Period End *"
            type="date"
            {...register("periodEnd", { required: "Period end is required" })}
            error={errors.periodEnd?.message as string}
          />
        </div>
        <Input
          label="Due Date *"
          type="date"
          {...register("dueDate", { required: "Due date is required" })}
          error={errors.dueDate?.message as string}
        />
      </form>
    </Modal>
  );
}