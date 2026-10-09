import * as React from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/lib/toast";
import { getServiceAccounts } from "@/lib/service-account-api";
import { getBillingPeriods } from "@/lib/billing-period-api";
import { Plus, Trash2 } from "lucide-react";

interface InvoiceFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  isLoading?: boolean;
}

function getErrorMessage(error: any): string {
  if (typeof error === "string") return error;
  if (error?.message) return error.message;
  return "";
}

export function InvoiceForm({ open, onClose, onSuccess, isLoading }: InvoiceFormProps) {
  const { error: showError, success: showSuccess } = useToast();

  // Both endpoints cap pageSize at 100 (api/src/routes/*.ts) — requesting
  // more fails validation with 400 "Invalid query parameters".
  const { data: serviceAccountsData } = useQuery({
    queryKey: ["service-accounts-for-invoice-form"],
    queryFn: () => getServiceAccounts({ pageSize: 100, status: "active" }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: billingPeriodsData } = useQuery({
    queryKey: ["billing-periods-for-invoice-form"],
    queryFn: () => getBillingPeriods({ pageSize: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<any>({
    defaultValues: {
      serviceAccountId: 0,
      billingPeriodId: 0,
      invoiceNumber: "",
      issueDate: "",
      dueDate: "",
      quantity: 1,
      additionalLineItems: [],
      adjustments: [],
    },
  });

  const [additionalLineItems, setAdditionalLineItems] = React.useState<Array<{
    description: string;
    quantity: number;
    unitPrice: string;
  }>>([]);

  const [adjustments, setAdjustments] = React.useState<Array<{
    type: "debit" | "credit";
    amount: string;
    reason: string;
  }>>([]);

  const onSubmit = async (data: any) => {
    try {
      const submitData = {
        ...data,
        additionalLineItems,
        adjustments,
      };
      await window.bcis.invoices.create(submitData);
      showSuccess("Invoice created successfully");
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create invoice";
      if (message.includes("already exists")) {
        setError("invoiceNumber", { type: "manual", message });
      } else {
        showError("Error", message);
      }
    }
  };

  const addLineItem = () => {
    setAdditionalLineItems([...additionalLineItems, { description: "", quantity: 1, unitPrice: "0.00" }]);
  };

  const removeLineItem = (index: number) => {
    setAdditionalLineItems(additionalLineItems.filter((_, i) => i !== index));
  };

  const addAdjustment = () => {
    setAdjustments([...adjustments, { type: "debit", amount: "0.00", reason: "" }]);
  };

  

  React.useEffect(() => {
    if (open) {
      reset({
        serviceAccountId: 0,
        billingPeriodId: 0,
        invoiceNumber: "",
        issueDate: "",
        dueDate: "",
        quantity: 1,
        additionalLineItems: [],
        adjustments: [],
      });
      setAdditionalLineItems([]);
      setAdjustments([]);
    }
  }, [open, reset]);

  const activeServiceAccounts = serviceAccountsData?.data?.filter((s: any) => s.status === "active") || [];
  const activeBillingPeriods = billingPeriodsData?.data || [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Invoice"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={() => handleSubmit(onSubmit)()} disabled={isLoading}>
            {isLoading ? "Saving..." : "Create"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Service Account *"
            options={activeServiceAccounts.map((s: any) => ({
              value: String(s.id),
              label: `${s.serviceNumber} - ${s.subscriber?.firstName} ${s.subscriber?.lastName}`,
            }))}
            {...register("serviceAccountId", { required: "Service account is required", valueAsNumber: true })}
            error={getErrorMessage(errors.serviceAccountId)}
            placeholder="Select service account"
          />
          <Select
            label="Billing Period *"
            options={activeBillingPeriods.map((p: any) => ({
              value: String(p.id),
              label: `${p.label} (${p.periodStart} to ${p.periodEnd})`,
            }))}
            {...register("billingPeriodId", { required: "Billing period is required", valueAsNumber: true })}
            error={getErrorMessage(errors.billingPeriodId)}
            placeholder="Select billing period"
          />
        </div>

        <Input
          label="Invoice Number *"
          {...register("invoiceNumber", { required: "Invoice number is required", maxLength: 50 })}
          error={getErrorMessage(errors.invoiceNumber)}
          placeholder="INV-001"
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Issue Date"
            type="date"
            {...register("issueDate")}
            error={getErrorMessage(errors.issueDate)}
          />
          <Input
            label="Due Date"
            type="date"
            {...register("dueDate")}
            error={getErrorMessage(errors.dueDate)}
          />
        </div>

        <Input
          label="Quantity"
          type="number"
          min="1"
          max="999"
          {...register("quantity", { required: "Quantity is required", valueAsNumber: true })}
          error={getErrorMessage(errors.quantity)}
          placeholder="1"
        />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Additional Line Items</h4>
            <Button variant="outline" size="sm" onClick={addLineItem}>
              <Plus className="mr-2 h-4 w-4" />
              Add Line Item
            </Button>
          </div>
          {additionalLineItems.map((_item, index) => (
            <div key={index} className="flex gap-2">
              <Input
                label="Description"
                value={additionalLineItems[index].description}
                onChange={(e) => {
                  const newItems = [...additionalLineItems];
                  newItems[index] = { ...newItems[index], description: e.target.value };
                  setAdditionalLineItems(newItems);
                }}
                placeholder="Description"
                className="flex-1"
              />
              <Input
                label="Quantity"
                type="number"
                min="1"
                max="999"
                value={additionalLineItems[index].quantity}
                onChange={(e) => {
                  const newItems = [...additionalLineItems];
                  newItems[index] = { ...newItems[index], quantity: parseInt(e.target.value) || 1 };
                  setAdditionalLineItems(newItems);
                }}
                className="w-[100px]"
              />
              <Input
                label="Unit Price"
                value={additionalLineItems[index].unitPrice}
                onChange={(e) => {
                  const newItems = [...additionalLineItems];
                  newItems[index] = { ...newItems[index], unitPrice: e.target.value };
                  setAdditionalLineItems(newItems);
                }}
                placeholder="0.00"
                className="w-[120px]"
              />
              <Button variant="outline" size="icon" onClick={() => removeLineItem(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Adjustments</h4>
            <Button variant="outline" size="sm" onClick={addAdjustment}>
              <Plus className="mr-2 h-4 w-4" />
              Add Adjustment
            </Button>
          </div>
          {adjustments.map((_adj, index) => (
            <div key={index} className="flex gap-2">
              <Select
                label="Type"
                options={[
                  { value: "debit", label: "Debit" },
                  { value: "credit", label: "Credit" },
                ]}
                value={adjustments[index].type}
                onChange={(e) => {
                  const value = e.target.value as "debit" | "credit";
                  const newAdjustments = [...adjustments];
                  newAdjustments[index] = { ...newAdjustments[index], type: value };
                  setAdjustments(newAdjustments);
                }}
              />
              <Input
                label="Amount"
                value={adjustments[index].amount}
                onChange={(e) => {
                  const newAdjustments = [...adjustments];
                  newAdjustments[index] = { ...newAdjustments[index], amount: e.target.value };
                  setAdjustments(newAdjustments);
                }}
                placeholder="0.00"
              />
              <Input
                label="Reason"
                value={adjustments[index].reason}
                onChange={(e) => {
                  const newAdjustments = [...adjustments];
                  newAdjustments[index] = { ...newAdjustments[index], reason: e.target.value };
                  setAdjustments(newAdjustments);
                }}
                placeholder="Reason"
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={() => {
                const newAdjustments = adjustments.filter((_, i) => i !== index);
                setAdjustments(newAdjustments);
              }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}