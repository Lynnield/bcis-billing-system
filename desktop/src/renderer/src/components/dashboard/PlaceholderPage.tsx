import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Users,
  CreditCard,
  FileText,
  DollarSign,
  Truck,
  BarChart3,
  Settings,
  Construction,
} from "lucide-react";

const PAGE_CONFIG: Record<string, { icon: React.ReactNode; description: string }> = {
  subscribers: { icon: <Users className="h-12 w-12" />, description: "Manage subscriber accounts, contact information, and status." },
  "service-accounts": { icon: <CreditCard className="h-12 w-12" />, description: "Manage service accounts, plans, and service assignments." },
  "billing-invoices": { icon: <FileText className="h-12 w-12" />, description: "Generate and manage billing periods, invoices, and adjustments." },
  payments: { icon: <DollarSign className="h-12 w-12" />, description: "Record and manage payments, allocations, and reversals." },
  collections: { icon: <Truck className="h-12 w-12" />, description: "Manage collector batches, remittances, and reconciliation." },
  receivables: { icon: <BarChart3 className="h-12 w-12" />, description: "View aging reports, outstanding balances, and collection status." },
  reports: { icon: <BarChart3 className="h-12 w-12" />, description: "Generate and export collection, receivables, and ledger reports." },
  "user-management": { icon: <Settings className="h-12 w-12" />, description: "Manage users, roles, and permissions." },
};

interface PlaceholderPageProps {
  pageKey: string;
  title: string;
}

export function PlaceholderPage({ pageKey, title }: PlaceholderPageProps) {
  const config = PAGE_CONFIG[pageKey] || { icon: <Construction className="h-12 w-12" />, description: "This feature is not yet implemented." };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-muted-foreground">{config.description}</p>
      </div>

      <Card>
        <CardHeader className="text-center py-8">
          <div className="mx-auto mb-4 text-muted-foreground/50">{config.icon}</div>
          <CardTitle className="text-xl">Coming in a Later Phase</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <p className="text-muted-foreground mb-4">
            This module is planned for a future release. The navigation item is visible
            based on your role permissions, but the detailed functionality has not been implemented yet.
          </p>
          <div className="text-sm text-muted-foreground/70">
            <p>Phase 13C — Application Shell & Dashboard only</p>
            <p>Detailed CRUD workflows will be added in subsequent phases.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}