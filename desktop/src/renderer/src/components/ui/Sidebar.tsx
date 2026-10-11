import { NavLink, useLocation } from "react-router-dom";
import { filterNavItems } from "@/lib/roles";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  FileText,
  DollarSign,
  Truck,
  BarChart3,
  Settings,
  Server,
  MapPin,
  ChevronRight,
  ChevronDown,
  Receipt,
  Calendar,
  ShieldCheck,
  DatabaseBackup,
} from "lucide-react";

const ICON_MAP: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard className="h-5 w-5" />,
  Users: <Users className="h-5 w-5" />,
  CreditCard: <CreditCard className="h-5 w-5" />,
  FileText: <FileText className="h-5 w-5" />,
  DollarSign: <DollarSign className="h-5 w-5" />,
  Truck: <Truck className="h-5 w-5" />,
  BarChart3: <BarChart3 className="h-5 w-5" />,
  Settings: <Settings className="h-5 w-5" />,
  Server: <Server className="h-5 w-5" />,
  MapPin: <MapPin className="h-5 w-5" />,
  Receipt: <Receipt className="h-5 w-5" />,
  Calendar: <Calendar className="h-5 w-5" />,
  ShieldCheck: <ShieldCheck className="h-5 w-5" />,
  DatabaseBackup: <DatabaseBackup className="h-5 w-5" />,
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const navItems = filterNavItems(user);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={(
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        ) + " fixed lg:static z-50 h-full w-64 border-r bg-card transition-transform duration-200 ease-in-out flex flex-col"}
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center justify-between border-b px-4 lg:justify-start lg:gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              BC
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight tracking-tight">BCIS Billing</h1>
              <p className="text-[11px] leading-tight text-muted-foreground">Subscriber Operations</p>
            </div>
          </div>
          <button
            className="lg:hidden p-2 rounded-md hover:bg-accent"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <ChevronRight className="h-5 w-5 rotate-180" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1" aria-label="Main menu">
          {navItems.map((item) => {
            if (item.children && item.children.length > 0) {
              return (
                <div key={item.key} className="space-y-1">
                  <div className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground">
                    {item.iconName && ICON_MAP[item.iconName]}
                    <span className="flex-1">{item.label}</span>
                    <ChevronDown className="h-4 w-4" />
                  </div>
                  <div className="pl-6 space-y-1">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.key}
                        to={child.key}
                        end
                        onClick={onClose}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                            isActive
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`
                        }
                        aria-current={location.pathname === `/${child.key}` ? "page" : undefined}
                      >
                        {child.iconName && ICON_MAP[child.iconName]}
                        <span>{child.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <NavLink
                key={item.key}
                to={item.key}
                end
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 border-l-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-l-accent-foreground bg-primary text-primary-foreground shadow-sm"
                      : "border-l-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  } rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`
                }
                aria-current={location.pathname === `/${item.key}` ? "page" : undefined}
              >
                {item.iconName && ICON_MAP[item.iconName]}
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t p-4">
          <p className="text-[11px] text-muted-foreground text-center">
            Bukidnon Cable &amp; Internet Services
          </p>
        </div>
      </aside>
    </>
  );
}