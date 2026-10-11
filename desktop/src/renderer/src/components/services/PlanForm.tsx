import * as React from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/lib/toast";
import type { CreatePlanRequest, ServicePlan, ServiceType } from "@/shared/types";

interface PlanFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  serviceId: number;
  /** Decides which attributes apply: speed for Internet/Combo, channels for Cable/Combo. */
  serviceType?: ServiceType;
  initialData?: ServicePlan;
  isEditing: boolean;
  isLoading?: boolean;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const MONEY = { value: /^\d+(\.\d{1,2})?$/, message: "Enter an amount with up to 2 decimal places" };

interface PlanFormValues {
  code: string;
  name: string;
  description: string;
  price: string;
  installationFee: string;
  reconnectionFee: string;
  speedMbps: string;
  channelCount: string;
  status: "active" | "inactive";
}

function toValues(plan?: ServicePlan): PlanFormValues {
  return {
    code: plan?.code ?? "",
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    price: plan?.price ?? "0.00",
    installationFee: plan?.installationFee ?? "0.00",
    reconnectionFee: plan?.reconnectionFee ?? "0.00",
    speedMbps: plan?.speedMbps ? String(plan.speedMbps) : "",
    channelCount: plan?.channelCount ? String(plan.channelCount) : "",
    status: plan?.status ?? "active",
  };
}

export function PlanForm({ open, onClose, onSuccess, serviceId, serviceType, initialData, isEditing, isLoading }: PlanFormProps) {
  const { error: showError, success: showSuccess } = useToast();
  const isCreate = !isEditing;
  const showSpeed = serviceType !== "cable";
  const showChannels = serviceType !== "internet";

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<PlanFormValues>({ defaultValues: toValues(initialData) });

  const onSubmit = async (v: PlanFormValues) => {
    const data: CreatePlanRequest = {
      ...(v.code.trim() ? { code: v.code.trim() } : {}),
      name: v.name.trim(),
      ...(v.description.trim() ? { description: v.description.trim() } : {}),
      price: v.price.trim(),
      installationFee: v.installationFee.trim() || "0.00",
      reconnectionFee: v.reconnectionFee.trim() || "0.00",
      speedMbps: showSpeed && v.speedMbps ? Number(v.speedMbps) : null,
      channelCount: showChannels && v.channelCount ? Number(v.channelCount) : null,
      status: v.status,
    };
    try {
      if (isCreate) {
        await window.bcis.plans.create(serviceId, data);
      } else if (initialData) {
        await window.bcis.plans.update(initialData.id, { ...data, code: v.code.trim() || null, description: v.description.trim() || null });
      }
      showSuccess(isCreate ? "Plan created" : "Plan updated", !isCreate ? "A price change applies to future invoices only." : undefined);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save plan";
      if (message.includes("already exists")) {
        setError("code", { type: "manual", message });
      } else {
        showError("Error", message);
      }
    }
  };

  React.useEffect(() => {
    if (open) reset(toValues(initialData));
  }, [open, initialData, reset]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCreate ? "Create Plan" : "Edit Plan"}
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
        <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
          <Input
            label="Plan Code *"
            {...register("code", {
              required: "Plan code is required",
              maxLength: 30,
              pattern: { value: /^[A-Za-z0-9-]+$/, message: "Letters, digits and dashes only" },
            })}
            error={errors.code?.message}
            placeholder="INT-50"
          />
          <Input label="Plan Name *" {...register("name", { required: "Plan name is required", maxLength: 100 })} error={errors.name?.message} placeholder="Fiber Basic 50 Mbps" />
        </div>
        <Textarea label="Description" {...register("description", { maxLength: 2000 })} error={errors.description?.message} placeholder="Optional description" rows={2} />

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Pricing</legend>
          <div className="grid gap-4 md:grid-cols-3">
            <Input label="Monthly Price (₱) *" inputMode="decimal" {...register("price", { required: "Price is required", pattern: MONEY })} error={errors.price?.message} />
            <Input label="Installation Fee (₱)" inputMode="decimal" {...register("installationFee", { pattern: MONEY })} error={errors.installationFee?.message} helperText="Billed once, on the first invoice" />
            <Input label="Reconnection Fee (₱)" inputMode="decimal" {...register("reconnectionFee", { pattern: MONEY })} error={errors.reconnectionFee?.message} helperText="Default fee after a suspension" />
          </div>
        </fieldset>

        {(showSpeed || showChannels) && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Service attributes</legend>
            <div className="grid gap-4 md:grid-cols-2">
              {showSpeed && (
                <Input label="Speed (Mbps)" inputMode="numeric" {...register("speedMbps", { pattern: { value: /^\d*$/, message: "Whole number" } })} error={errors.speedMbps?.message} />
              )}
              {showChannels && (
                <Input label="Channel Count" inputMode="numeric" {...register("channelCount", { pattern: { value: /^\d*$/, message: "Whole number" } })} error={errors.channelCount?.message} />
              )}
            </div>
          </fieldset>
        )}

        <Select label="Status" options={STATUS_OPTIONS} {...register("status")} error={errors.status?.message} />
      </form>
    </Modal>
  );
}
