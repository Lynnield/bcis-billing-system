import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Server } from "lucide-react";

// Shown on the login screen so each office PC can be pointed at the LAN API
// server after installation, without editing configuration files. The main
// process validates the address and health-checks it before saving.
export function ServerAddress() {
  const [current, setCurrent] = React.useState<string>("");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    window.bcis.server.getUrl().then(setCurrent).catch(() => setCurrent(""));
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await window.bcis.server.setUrl(draft);
      setCurrent(saved);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Server className="h-3.5 w-3.5" aria-hidden="true" />
        <span>
          Server: <span className="font-mono">{current || "…"}</span>
        </span>
        <button
          type="button"
          className="underline underline-offset-2 hover:text-foreground"
          onClick={() => {
            setDraft(current);
            setError(null);
            setEditing(true);
          }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-left">
      <Input
        label="Server address"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="http://192.168.1.10:3000"
        error={error ?? undefined}
        disabled={saving}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving || !draft.trim()}>
          {saving ? "Testing…" : "Test & Save"}
        </Button>
      </div>
    </div>
  );
}
