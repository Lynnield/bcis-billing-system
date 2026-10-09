import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";

export function LoginForm() {
  const { login, isLoading: authLoading } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ identifier?: string; password?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const identifierRef = useRef<HTMLInputElement>(null);

  // Focus identifier field on mount
  useEffect(() => {
    identifierRef.current?.focus();
  }, []);

  const validateField = (name: string, value: string): string | undefined => {
    if (!value.trim()) {
      return `${name === "identifier" ? "Username/Email" : "Password"} is required`;
    }
    return undefined;
  };

  const handleIdentifierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setIdentifier(value);
    const err = validateField("identifier", value);
    setFieldErrors((prev) => ({ ...prev, identifier: err }));
    if (error) setError(null);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    const err = validateField("password", value);
    setFieldErrors((prev) => ({ ...prev, password: err }));
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const identifierErr = validateField("identifier", identifier);
    const passwordErr = validateField("password", password);

    if (identifierErr || passwordErr) {
      setFieldErrors({ identifier: identifierErr, password: passwordErr });
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ identifier: identifier.trim(), password });
    } catch (err) {
      if (err instanceof Error && "status" in err) {
        const apiErr = err as { status: number; message: string };
        if (apiErr.status === 401) {
          setError("Invalid username/email or password");
        } else if (apiErr.status === 400) {
          setError(apiErr.message || "Please check your input");
        } else {
          setError("Login failed. Please try again.");
        }
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDisabled = isSubmitting || authLoading;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border bg-card p-8 shadow-sm">
          <header className="text-center mb-8">
            <h1 className="text-2xl font-semibold tracking-tight">BCIS Billing</h1>
            <p className="text-muted-foreground mt-1">Sign in to your account</p>
          </header>

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-5" noValidate>
            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="identifier" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Username or Email
              </label>
              <div className="relative">
                <input
                  ref={identifierRef}
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={handleIdentifierChange}
                  onBlur={() => setFieldErrors((prev) => ({ ...prev, identifier: validateField("identifier", identifier) }))}
                  disabled={isDisabled}
                  className={cn(
                    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    fieldErrors.identifier && "border-destructive focus-visible:ring-destructive"
                  )}
                  aria-invalid={!!fieldErrors.identifier}
                  aria-describedby={fieldErrors.identifier ? "identifier-error" : undefined}
                />
              </div>
              {fieldErrors.identifier && (
                <p id="identifier-error" className="text-sm text-destructive" role="alert">
                  {fieldErrors.identifier}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={handlePasswordChange}
                  onBlur={() => setFieldErrors((prev) => ({ ...prev, password: validateField("password", password) }))}
                  disabled={isDisabled}
                  className={cn(
                    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pr-10",
                    fieldErrors.password && "border-destructive focus-visible:ring-destructive"
                  )}
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isDisabled}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="text-sm text-destructive" role="alert">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isDisabled}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <footer className="mt-6 text-center text-sm text-muted-foreground">
            <p>Phase 13B — Authentication Integration</p>
          </footer>
        </div>
      </div>
    </div>
  );
}