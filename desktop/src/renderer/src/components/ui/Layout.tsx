import { Outlet, useLocation } from "react-router-dom";
import { GlobalSearch } from "./GlobalSearch";
import { Sidebar } from "@/components/ui/Sidebar";
import { UserAvatar } from "@/components/auth/UserAvatar";
import { useAuth } from "@/lib/auth-context";
import { Menu } from "lucide-react";
import * as React from "react";

export function Layout() {
  const location = useLocation();
  const { user, logout, lock, isAuthenticated, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  if (!isAuthenticated) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-background flex">
      <div className="print:hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        {/* Top Header — hidden when printing so printed pages (receipts,
            statements, route sheets) show only their own content. */}
        <header className="print:hidden sticky top-0 z-30 h-16 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden p-2 rounded-md hover:bg-accent"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="hidden sm:block text-lg font-semibold">
              {location.pathname.split("/")[1]?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Dashboard"}
            </h1>
          </div>

          <div className="mx-4 flex flex-1 justify-center">
            <GlobalSearch />
          </div>

          <div className="flex items-center gap-3">
            <UserAvatar user={user!} onLogout={logout} onLock={lock} isLoading={isLoading} />
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 print:p-0 print:overflow-visible">
          <div className="max-w-full mx-auto"><Outlet /></div>
        </main>
      </div>
    </div>
  );
}