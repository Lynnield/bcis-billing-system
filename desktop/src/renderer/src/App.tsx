import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LoginForm } from "@/components/auth/LoginForm";
import { Layout } from "@/components/ui/Layout";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { PlaceholderPage } from "@/components/dashboard/PlaceholderPage";
import { SubscriberList } from "@/components/subscribers/SubscriberList";
import { ServiceAccountList } from "@/components/service-accounts/ServiceAccountList";
import { ServiceList } from "@/components/services/ServiceList";
import { PlanList } from "@/components/services/PlanList";
import { CollectionAreaList } from "@/components/collection-areas/CollectionAreaList";
import { InvoiceList } from "@/components/invoices/InvoiceList";
import { BillingPeriodList } from "@/components/billing-periods/BillingPeriodList";
import { PaymentList } from "@/components/payments/PaymentList";
import { GcashVerificationQueue } from "@/components/payments/GcashVerificationQueue";
import { ToastProvider } from "@/lib/toast";
import { useQuery } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

function PlansRoute() {
  const { serviceId } = useParams();
  const { data: service } = useQuery({
    queryKey: ["service", serviceId],
    queryFn: () => window.bcis.services.getById(Number(serviceId)),
    enabled: !!serviceId,
  });

  if (!service) {
    return <div className="flex items-center justify-center h-64">Loading service...</div>;
  }

  return <PlanList service={service.data} onBack={() => window.history.back()} />;
}

function InvoicesRoute() {
  return <InvoiceList />;
}

function BillingPeriodsRoute() {
  return <BillingPeriodList />;
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading session...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="subscribers" element={<SubscriberList />} />
          <Route path="service-accounts" element={<ServiceAccountList />} />
          <Route path="services" element={<ServiceList />} />
          <Route path="services/:serviceId/plans" element={<PlansRoute />} />
          <Route path="billing-invoices" element={<InvoicesRoute />} />
          <Route path="billing-periods" element={<BillingPeriodsRoute />} />
          <Route path="payments" element={<PaymentList />} />
          <Route path="gcash-verification" element={<GcashVerificationQueue />} />
          <Route path="collections" element={<PlaceholderPage pageKey="collections" title="Collections" />} />
          <Route path="receivables" element={<PlaceholderPage pageKey="receivables" title="Receivables" />} />
          <Route path="reports" element={<PlaceholderPage pageKey="reports" title="Reports" />} />
          <Route path="collection-areas" element={<CollectionAreaList />} />
          <Route path="user-management" element={<PlaceholderPage pageKey="user-management" title="User Management" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}