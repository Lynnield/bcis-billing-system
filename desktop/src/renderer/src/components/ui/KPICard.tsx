import * as React from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: { value: number; label: string };
  icon?: React.ReactNode;
  variant?: "default" | "positive" | "negative" | "warning";
  className?: string;
}

export function KPICard({
  title,
  value,
  description,
  trend,
  icon,
  variant = "default",
  className,
}: KPICardProps) {
  const trendColor = trend ? (trend.value >= 0 ? "text-success" : "text-destructive") : "";

  const iconTileClass = {
    default: "bg-primary/10 text-primary",
    positive: "bg-success/10 text-success",
    negative: "bg-destructive/10 text-destructive",
    warning: "bg-warning/10 text-warning",
  }[variant];

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">{title}</p>
            <p
              className={cn("text-2xl font-bold tracking-tight mt-1.5 tabular-nums", {
                "text-success": variant === "positive",
                "text-destructive": variant === "negative",
                "text-warning": variant === "warning",
              })}
            >
              {value}
            </p>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
            {trend && (
              <p className={cn("text-xs font-medium mt-2 flex items-center gap-1", trendColor)}>
                <span aria-hidden="true">{trend.value >= 0 ? "▲" : "▼"}</span>
                <span className="tabular-nums">{Math.abs(trend.value)}%</span>
                <span className="text-muted-foreground">{trend.label}</span>
              </p>
            )}
          </div>
          {icon && (
            <div className={cn("flex-shrink-0 rounded-lg p-2.5", iconTileClass)} aria-hidden="true">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}