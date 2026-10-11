import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/lib/toast";
import { getSubscribers } from "@/lib/subscriber-api";
import type { CreateServiceAccountRequest, ServiceAccountStatus, UpdateServiceAccountRequest } from "@/shared/types";

interface ServiceAccountFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: {
    id: number;
    subscriberId: number;
    planId: number;
    serviceNumber: string;
    status: ServiceAccountStatus;
    collectionAreaId?: number | null;
    assignedCollectorId?: number | null;
    installationAddress?: string | null;
    billingStartDate?: string | null;
    billingDueDay?: number | null;
    currentRate?: string | null;
  };
  /** Pre-select the owner when adding a service from a subscriber's profile. */
  presetSubscriber?: { id: number; accountNumber: string; name: string };
  isEditing: boolean;
  isLoading?: boolean;
}

const STATUS_OPTIONS: Array<{ value: ServiceAccountStatus; label: string }> = [
  { value: "pending_installation", label: "Pending Installation" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
  { value: "disconnected", label: "Disconnected" },
];

const MONEY = /^\d+(\.\d{1,2})?$/;

export function ServiceAccountForm({ open, onClose, onSuccess, initialData, presetSubscriber, isEditing, isLoading }: ServiceAccountFormProps) {
  const { error: showError, success: showSuccess } = useToast();
  const isCreate = !isEditing;

  const [subscriber, setSubscriber] = React.useState<{ id: number; label: string } | null>(null);
  const [subscriberQuery, setSubscriberQuery] = React.useState("");
  const [planId, setPlanId] = React.useState("");
  const [serviceNumber, setServiceNumber] = React.useState("");
  const [status, setStatus] = React.useState<ServiceAccountStatus>("pending_installation");
  const [areaId, setAreaId] = React.useState("");
  const [collectorId, setCollectorId] = React.useState("");
  const [installationAddress, setInstallationAddress] = React.useState("");
  const [billingStartDate, setBillingStartDate] = React.useState("");
  const [billingDueDay, setBillingDueDay] = React.useState("");
  const [currentRate, setCurrentRate] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSubscriber(presetSubscriber ? { id: presetSubscriber.id, label: `${presetSubscriber.accountNumber} — ${presetSubscriber.name}` } : null);
    setSubscriberQuery("");
    setPlanId(initialData ? String(initialData.planId) : "");
    setServiceNumber(initialData?.serviceNumber ?? "");
    setStatus(initialData?.status ?? "pending_installation");
    setAreaId(initialData?.collectionAreaId ? String(initialData.collectionAreaId) : "");
    setCollectorId(initialData?.assignedCollectorId ? String(initialData.assignedCollectorId) : "");
    setInstallationAddress(initialData?.installationAddress ?? "");
    setBillingStartDate(initialData?.billingStartDate ? initialData.billingStartDate.slice(0, 10) : "");
    setBillingDueDay(initialData?.billingDueDay ? String(initialData.billingDueDay) : "");
    setCurrentRate(initialData?.currentRate ?? "");
    setErrors({});
  }, [open, initialData, presetSubscriber]);

  // Lookups are loaded here so the form works wherever it is opened.
  const { data: plansData } = useQuery({
    queryKey: ["all-plans-for-account-form"],
    enabled: open,
    queryFn: async () => {
      const services = (await window.bcis.services.getList("active")).data;
      const lists = await Promise.all(services.map((s) => window.bcis.plans.getByService(s.id, "active")));
      return services.flatMap((s, i) => lists[i]!.data.map((p) => ({ ...p, serviceName: s.name, serviceType: s.type })));
    },
  });
  const { data: areasData } = useQuery({ queryKey: ["collection-areas"], queryFn: () => window.bcis.collectionAreas.getList(), enabled: open });
  const { data: collectorsData } = useQuery({ queryKey: ["collectors"], queryFn: () => window.bcis.collectors.getList(), enabled: open });

  const q = subscriberQuery.trim();
  const { data: subscriberHits } = useQuery({
    queryKey: ["subscriber-picker", q],
    enabled: open && isCreate && !subscriber && q.length >= 2,
    queryFn: async () => {
      const byNumber = await getSubscribers({ pageSize: 10, accountNumber: q });
      if (byNumber.data.length > 0) return byNumber.data;
      return (await getSubscribers({ pageSize: 10, name: q })).data;
    },
  });

  const plans = plansData ?? [];
  const selectedPlan = plans.find((p) => String(p.id) === planId);
  const areas = (areasData?.data ?? []).filter((a) => a.status === "active");
  const collectors = (collectorsData?.data ?? []).filter((c) => c.status === "active" && (!areaId || c.collectionAreaId === Number(areaId)));

  const submit = async () => {
    const e: Record<string, string> = {};
    if (isCreate && !subscriber) e.subscriber = "Choose the subscriber";
    if (!planId) e.planId = "Choose a plan";
    if (isCreate && !serviceNumber.trim()) e.serviceNumber = "Service number is required";
    if (billingDueDay && !(/^\d+$/.test(billingDueDay) && Number(billingDueDay) >= 1 && Number(billingDueDay) <= 28)) e.billingDueDay = "Enter a day from 1 to 28";
    if (currentRate && !MONEY.test(currentRate.trim())) e.currentRate = "Enter an amount with up to 2 decimals";
    setErrors(e);
    if (Object.keys(e).length > 0 || saving) return;

    setSaving(true);
    try {
      if (isCreate) {
        const data: CreateServiceAccountRequest = {
          subscriberId: subscriber!.id,
          planId: Number(planId),
          serviceNumber: serviceNumber.trim(),
          status,
          ...(areaId ? { collectionAreaId: Number(areaId) } : {}),
          ...(collectorId ? { assignedCollectorId: Number(collectorId) } : {}),
          ...(installationAddress.trim() ? { installationAddress: installationAddress.trim() } : {}),
          ...(billingStartDate ? { billingStartDate } : {}),
          ...(billingDueDay ? { billingDueDay: Number(billingDueDay) } : {}),
          ...(currentRate.trim() ? { currentRate: currentRate.trim() } : {}),
        };
        await window.bcis.serviceAccounts.create(data);
      } else if (initialData) {
        const data: UpdateServiceAccountRequest = {
          planId: Number(planId),
          status,
          installationAddress: installationAddress.trim() || null,
          billingStartDate: billingStartDate || null,
          billingDueDay: billingDueDay ? Number(billingDueDay) : null,
          currentRate: currentRate.trim() || null,
        };
        await window.bcis.serviceAccounts.update(initialData.id, data);
        if ((areaId || null) !== (initialData.collectionAreaId ? String(initialData.collectionAreaId) : null) ||
            (collectorId || null) !== (initialData.assignedCollectorId ? String(initialData.assignedCollectorId) : null)) {
          await window.bcis.serviceAccounts.updateCollectionAssignment(initialData.id, {
            collectionAreaId: areaId ? Number(areaId) : null,
            collectorId: collectorId ? Number(collectorId) : null,
          });
        }
      }
      showSuccess(isCreate ? "Service account created" : "Service account updated");
      onSuccess();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save service account";
      if (message.includes("already exists")) setErrors({ serviceNumber: message });
      else showError("Error", message);
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || isLoading;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCreate ? "New Service Account" : "Edit Service Account"}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving..." : isCreate ? "Create" : "Save Changes"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="max-h-[70vh] space-y-5 overflow-y-auto pr-1"
      >
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Subscriber &amp; plan</legend>
          {isCreate &&
            (subscriber ? (
              <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{subscriber.label}</span>
                {!presetSubscriber && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSubscriber(null)}>
                    Change
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <Input
                  label="Subscriber *"
                  value={subscriberQuery}
                  onChange={(e) => setSubscriberQuery(e.target.value)}
                  placeholder="Type an account number or name"
                  error={errors.subscriber}
                />
                {(subscriberHits ?? []).length > 0 && (
                  <ul className="max-h-40 divide-y overflow-auto rounded-md border text-sm">
                    {subscriberHits!.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-1.5 text-left hover:bg-muted/60"
                          onClick={() => setSubscriber({ id: s.id, label: `${s.accountNumber} — ${s.firstName} ${s.lastName}` })}
                        >
                          <span className="font-mono">{s.accountNumber}</span> — {s.firstName} {s.lastName}
                          <span className="ml-2 text-xs text-muted-foreground">{s.status}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Plan *"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              options={[
                { value: "", label: "Select plan" },
                ...plans.map((p) => ({ value: String(p.id), label: `${p.code ? `${p.code} · ` : ""}${p.name} (${p.serviceType}) — ₱${p.price}` })),
              ]}
              error={errors.planId}
            />
            <Input
              label="Service Number *"
              value={serviceNumber}
              onChange={(e) => setServiceNumber(e.target.value)}
              disabled={isEditing}
              placeholder="SVC-0001"
              error={errors.serviceNumber}
            />
          </div>
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as ServiceAccountStatus)} options={STATUS_OPTIONS} />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Installation &amp; billing</legend>
          <Input
            label="Installation Address"
            value={installationAddress}
            onChange={(e) => setInstallationAddress(e.target.value)}
            placeholder="Leave blank if same as the subscriber's address"
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Input label="Billing Start Date" type="date" value={billingStartDate} onChange={(e) => setBillingStartDate(e.target.value)} helperText="No invoices for periods before this date" />
            <Input label="Due Day (1–28)" inputMode="numeric" value={billingDueDay} onChange={(e) => setBillingDueDay(e.target.value)} error={errors.billingDueDay} helperText="Blank = billing period's due date" />
            <Input
              label="Account Rate (₱)"
              inputMode="decimal"
              value={currentRate}
              onChange={(e) => setCurrentRate(e.target.value)}
              error={errors.currentRate}
              helperText={selectedPlan ? `Blank = plan price ₱${selectedPlan.price}` : "Blank = plan price"}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Collection</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Collection Area"
              value={areaId}
              onChange={(e) => {
                setAreaId(e.target.value);
                setCollectorId("");
              }}
              options={[{ value: "", label: "None" }, ...areas.map((a) => ({ value: String(a.id), label: a.name }))]}
            />
            <Select
              label="Assigned Collector"
              value={collectorId}
              onChange={(e) => setCollectorId(e.target.value)}
              options={[{ value: "", label: "None" }, ...collectors.map((c) => ({ value: String(c.id), label: c.fullName }))]}
            />
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
