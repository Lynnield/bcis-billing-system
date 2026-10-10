// HashRouter, not BrowserRouter: the production build is loaded via
// file:// (no HTTP server), where the History API's pathname-based routing
// that BrowserRouter depends on doesn't apply cleanly on Windows — mounting
// it rewrites location.href to the filesystem root (file:///C:/), breaking
// every relative asset resolution and leaving a blank window with no error
// anywhere. HashRouter's #/route fragment works identically under file://
// and http://, which is why it's the standard choice for Electron apps.
import { HashRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LoginForm } from "@/components/auth/LoginForm";
import { LockScreen } from "@/components/auth/LockScreen";
import { Layout } from "@/components/ui/Layout";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { SubscriberList } from "@/components/subscribers/SubscriberList";
import { ServiceAccountList } from "@/components/service-accounts/ServiceAccountList";
import { ServiceList } from "@/components/services/ServiceList";
import { PlanList } from "@/components/services/PlanList";
import { CollectionAreaList } from "@/components/collection-areas/CollectionAreaList";
import { InvoiceList } from "@/components/invoices/InvoiceList";
import { BillingPeriodList } from "@/components/billing-periods/BillingPeriodList";
import { PaymentList } from "@/components/payments/PaymentList";
import { GcashVerificationQueue } from "@/components/payments/GcashVerificationQueue";
import { BackupPage } from "@/components/backup/BackupPage";
import { ReportsPage } from "@/components/reports/ReportsPage";
import { CollectionsPage } from "@/components/collections/CollectionsPage";
import { ReceivablesPage } from "@/components/receivables/ReceivablesPage";
import { UserManagementPage } from "@/components/users/UserManagementPage";
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
  const { isAuthenticated, isLoading, isLocked } = useAuth();

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

  if (isLocked) {
    return <LockScreen />;
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
          <Route path="collections" element={<CollectionsPage />} />
          <Route path="receivables" element={<ReceivablesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="collection-areas" element={<CollectionAreaList />} />
          <Route path="user-management" element={<UserManagementPage />} />
          <Route path="backup" element={<BackupPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </HashRouter>
    </QueryClientProvider>
  );
}