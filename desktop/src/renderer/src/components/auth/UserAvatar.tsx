import { Button } from "@/components/ui/Button";
import { LogOut, Loader2, Lock } from "lucide-react";

interface UserAvatarProps {
  user: {
    fullName: string;
    username: string;
    email: string;
    roles: string[];
  };
  onLogout: () => void;
  onLock: () => void;
  isLoading?: boolean;
}

export function UserAvatar({ user, onLogout, onLock, isLoading }: UserAvatarProps) {
  const initials = user.fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const primaryRole = user.roles[0] ?? "user";

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-sm font-medium text-primary">{initials}</span>
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-sm font-medium truncate max-w-[160px]">{user.fullName}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[160px]">
            {user.username} · {primaryRole}
          </p>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={onLock} aria-label="Lock session" title="Lock session">
        <Lock className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onLogout}
        disabled={isLoading}
        aria-label="Sign out"
        title="Sign out"
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      </Button>
    </div>
  );
}