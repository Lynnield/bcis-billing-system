import * as React from "react";
import { CollectionBatchList } from "./CollectionBatchList";
import { CollectionBatchDetail } from "./CollectionBatchDetail";
import { CollectorList } from "./CollectorList";
import { RouteSheet } from "./RouteSheet";

type View = { kind: "batches" } | { kind: "collectors" } | { kind: "batch-detail"; batchId: number } | { kind: "route-sheet"; collectorId: number };

export function CollectionsPage({ initialView = "batches" }: { initialView?: "batches" | "collectors" | "remittance" } = {}) {
  const [view, setView] = React.useState<View>({ kind: initialView === "collectors" ? "collectors" : "batches" });
  // The Remittance entry opens batches waiting for the collector's cash.
  const batchStatus = initialView === "remittance" ? "submitted" : undefined;

  if (view.kind === "batch-detail") {
    return <CollectionBatchDetail batchId={view.batchId} onBack={() => setView({ kind: "batches" })} />;
  }
  if (view.kind === "route-sheet") {
    return <RouteSheet collectorId={view.collectorId} onBack={() => setView({ kind: "collectors" })} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Collections</h2>
        <p className="text-muted-foreground">House-to-house collection batches, collectors, and remittance reconciliation.</p>
      </div>

      <div className="flex gap-1 border-b">
        <button
          onClick={() => setView({ kind: "batches" })}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            view.kind === "batches" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Collection Batches
        </button>
        <button
          onClick={() => setView({ kind: "collectors" })}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            view.kind === "collectors" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Collectors
        </button>
      </div>

      {view.kind === "batches" ? (
        <CollectionBatchList initialStatus={batchStatus} onViewBatch={(batchId) => setView({ kind: "batch-detail", batchId })} />
      ) : (
        <CollectorList onViewRouteSheet={(collectorId) => setView({ kind: "route-sheet", collectorId })} />
      )}
    </div>
  );
}
