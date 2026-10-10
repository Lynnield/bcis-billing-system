import * as React from "react";
import { Button } from "@/components/ui/Button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  total?: number;
  showPageSize?: boolean;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  pageSize,
  total,
  showPageSize = false,
  pageSizeOptions = [10, 20, 50, 100],
  onPageSizeChange,
}: PaginationProps) {
  // This hook must run unconditionally on every render (Rules of Hooks) —
  // it has to come before the early return below.
  const pages = React.useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | "ellipsis")[] = [1];
    if (page > 3) pages.push("ellipsis");
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (page < totalPages - 2) pages.push("ellipsis");
    if (totalPages > 1) pages.push(totalPages);
    return pages;
  }, [page, totalPages]);

  if (totalPages <= 1 && !showPageSize) return null;

  return (
    <nav className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t" aria-label="Pagination">
      <div className="flex items-center gap-4">
        {showPageSize && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
              className="h-8 w-auto rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
        {total && (
          <div className="text-sm text-muted-foreground">
            Showing {(page - 1) * (pageSize || 20) + 1} to {Math.min(page * (pageSize || 20), total)} of {total} results
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          aria-label="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {pages.map((p, i) =>
          p === "ellipsis" ? (
            <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground">
              ...
            </span>
          ) : (
            <Button
              key={p}
              variant={page === p ? "default" : "outline"}
              size="icon"
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p}`}
              aria-current={page === p ? "page" : undefined}
            >
              {p}
            </Button>
          )
        )}

        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          aria-label="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}