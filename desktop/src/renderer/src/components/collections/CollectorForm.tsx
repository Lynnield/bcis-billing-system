import * as React from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/lib/toast";
import { getCollectionAreas, createCollector, updateCollector } from "@/lib/collection-area-api";
import type { CreateCollectorRequest, UpdateCollectorRequest, Collector } from "@/shared/types";

interface CollectorFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: Collector;
  isEditing: boolean;
}

interface FormData {
  fullName: string;
  contactNumber: string;
  collectionAreaId: string;
  status: "active" | "inactive";
}

function emptyForm(initialData?: Collector): FormData {
  return {
    fullName: initialData?.fullName ?? "",
    contactNumber: initialData?.contactNumber ?? "",
    collectionAreaId: initialData?.collectionAreaId ? String(initialData.collectionAreaId) : "",
    status: initialData?.status ?? "active",
  };
}

export function CollectorForm({ open, onClose, onSuccess, initialData, isEditing }: CollectorFormProps) {
  const { error: showError, success: showSuccess } = useToast();
  const isCreate = !isEditing;
  const [isSaving, setIsSaving] = React.useState(false);

  const { data: areasData } = useQuery({
    queryKey: ["collection-areas-for-collector-form"],
    queryFn: () => getCollectionAreas("active"),
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ defaultValues: emptyForm(initialData) });

  React.useEffect(() => {
    if (open) reset(emptyForm(initialData));
  }, [open, initialData, reset]);

  const onSubmit = async (data: FormData) => {
    setIsSaving(true);
    try {
      if (isCreate) {
        const payload: CreateCollectorRequest = {
          fullName: data.fullName.trim(),
          contactNumber: data.contactNumber.trim() || undefined,
          collectionAreaId: data.collectionAreaId ? Number(data.collectionAreaId) : undefined,
          status: data.status,
        };
        await createCollector(payload);
      } else if (initialData) {
        const payload: UpdateCollectorRequest = {
          fullName: data.fullName.trim(),
          contactNumber: data.contactNumber.trim() || null,
          collectionAreaId: data.collectionAreaId ? Number(data.collectionAreaId) : null,
          status: data.status,
        };
        await updateCollector(initialData.id, payload);
      }
      showSuccess(isCreate ? "Collector created" : "Collector updated");
      onSuccess();
    } catch (err) {
      showError("Error", err instanceof Error ? err.message : "Failed to save collector");
    } finally {
      setIsSaving(false);
    }
  };

  const areas = areasData?.data ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCreate ? "Add Collector" : "Edit Collector"}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={() => handleSubmit(onSubmit)()} disabled={isSaving}>
            {isSaving ? "Saving..." : isCreate ? "Create" : "Save Changes"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Full Name *"
          {...register("fullName", { required: "Full name is required", maxLength: 255 })}
          error={errors.fullName?.message}
          placeholder="e.g., Juan Dela Cruz"
        />
        <Input
          label="Contact Number"
          {...register("contactNumber", { maxLength: 50 })}
          error={errors.contactNumber?.message}
          placeholder="09xx xxx xxxx"
        />
        <Select
          label="Collection Area"
          options={areas.map((a) => ({ value: String(a.id), label: a.name }))}
          {...register("collectionAreaId")}
          placeholder="Unassigned"
        />
        <Select
          label="Status"
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
          {...register("status")}
        />
      </form>
    </Modal>
  );
}
