import * as React from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/lib/toast";
import { CreateCollectionAreaRequest, UpdateCollectionAreaRequest, CollectionArea } from "@/shared/types";

interface CollectionAreaFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: CollectionArea;
  isEditing: boolean;
  isLoading?: boolean;
}

export function CollectionAreaForm({ open, onClose, onSuccess, initialData, isEditing, isLoading }: CollectionAreaFormProps) {
  const { error: showError, success: showSuccess } = useToast();
  const isCreate = !isEditing;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateCollectionAreaRequest | UpdateCollectionAreaRequest>({
    defaultValues: initialData
      ? {
          name: initialData.name,
          description: initialData.description ?? "",
          status: initialData.status,
        }
      : {
          name: "",
          description: "",
          status: "active",
        },
  });

  const onSubmit = async (data: CreateCollectionAreaRequest | UpdateCollectionAreaRequest) => {
    try {
      if (isCreate) {
        await window.bcis.collectionAreas.create(data as CreateCollectionAreaRequest);
      } else if (initialData) {
        await window.bcis.collectionAreas.update(initialData.id, data as UpdateCollectionAreaRequest);
      }
      showSuccess(isCreate ? "Collection area created" : "Collection area updated");
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save collection area";
      if (message.includes("already exists")) {
        setError("name", { type: "manual", message });
      } else {
        showError("Error", message);
      }
    }
  };

  React.useEffect(() => {
    if (open) {
      reset(initialData
        ? {
            name: initialData.name,
            description: initialData.description ?? "",
            status: initialData.status,
          }
        : {
            name: "",
            description: "",
            status: "active",
          });
    }
  }, [open, initialData, reset]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCreate ? "Create Collection Area" : "Edit Collection Area"}
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
          label="Name *"
          {...register("name", { required: "Name is required", maxLength: 100 })}
          error={errors.name?.message}
          placeholder="e.g., Metro Manila North"
        />
        <Textarea
          label="Description"
          {...register("description", { maxLength: 500 })}
          error={errors.description?.message}
          placeholder="Optional description"
          rows={3}
        />
        <Select
          label="Status"
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
          {...register("status")}
          error={errors.status?.message}
          placeholder="Select status"
        />
      </form>
    </Modal>
  );
}