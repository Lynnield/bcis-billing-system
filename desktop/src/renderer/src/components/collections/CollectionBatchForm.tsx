import * as React from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/lib/toast";
import { getCollectors } from "@/lib/collection-area-api";
import { createCollectionBatch } from "@/lib/collection-batch-api";
import type { CreateCollectionBatchRequest } from "@/shared/types";

interface CollectionBatchFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CollectionBatchForm({ open, onClose, onSuccess }: CollectionBatchFormProps) {
  const { error: showError, success: showSuccess } = useToast();
  const [isSaving, setIsSaving] = React.useState(false);

  const { data: collectorsData } = useQuery({
    queryKey: ["collectors-for-batch-form"],
    queryFn: () => getCollectors("active"),
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ collectorId: string; batchDate: string }>({
    defaultValues: { collectorId: "", batchDate: new Date().toISOString().slice(0, 10) },
  });

  React.useEffect(() => {
    if (open) reset({ collectorId: "", batchDate: new Date().toISOString().slice(0, 10) });
  }, [open, reset]);

  const onSubmit = async (data: { collectorId: string; batchDate: string }) => {
    setIsSaving(true);
    try {
      const payload: CreateCollectionBatchRequest = {
        collectorId: Number(data.collectorId),
        batchDate: data.batchDate,
      };
      await createCollectionBatch(payload);
      showSuccess("Collection batch created");
      onSuccess();
    } catch (err) {
      showError("Error", err instanceof Error ? err.message : "Failed to create batch");
    } finally {
      setIsSaving(false);
    }
  };

  const collectors = collectorsData?.data ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Collection Batch"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={() => handleSubmit(onSubmit)()} disabled={isSaving}>
            {isSaving ? "Creating..." : "Create Batch"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Select
          label="Collector *"
          options={collectors.map((c) => ({ value: String(c.id), label: c.fullName }))}
          {...register("collectorId", { required: "Collector is required" })}
          error={errors.collectorId?.message}
          placeholder="Select collector"
        />
        <Input
          label="Batch Date *"
          type="date"
          {...register("batchDate", { required: "Batch date is required" })}
          error={errors.batchDate?.message}
        />
      </form>
    </Modal>
  );
}
