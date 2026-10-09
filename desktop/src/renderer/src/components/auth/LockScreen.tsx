import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth-context";
import { Lock } from "lucide-react";

export function LockScreen() {
  const { user, unlock, logout } = useAuth();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await unlock(password);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect password");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-lg border bg-card p-8 shadow-lg space-y-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Session Locked</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Signed in as <span className="font-medium text-foreground">{user?.fullName ?? user?.username}</span>. Enter your
            password to continue.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 text-left">
          <Input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            error={error ?? undefined}
          />
          <Button type="submit" className="w-full" disabled={isSubmitting || !password}>
            {isSubmitting ? "Unlocking..." : "Unlock"}
          </Button>
        </form>
        <button onClick={() => logout()} className="text-xs text-muted-foreground hover:text-foreground underline">
          Not you? Sign out
        </button>
      </div>
    </div>
  );
}
