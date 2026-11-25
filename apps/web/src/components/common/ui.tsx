import { AlertTriangle, Loader2, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { UserDTO } from "@nexus/shared";

export function Spinner({ className = "size-4" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-label="読み込み中" />;
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="m-3 flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-red-200">
      <AlertTriangle className="size-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="rounded bg-surface-3 px-2 py-0.5 text-xs hover:bg-surface-4">
          再試行
        </button>
      )}
    </div>
  );
}

export function Avatar({
  user,
  size = 36,
  status,
}: {
  user: Pick<UserDTO, "displayName" | "avatarColor">;
  size?: number;
  status?: "online" | "offline";
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="flex size-full select-none items-center justify-center rounded-full font-semibold text-white"
        style={{ backgroundColor: user.avatarColor, fontSize: size * 0.42 }}
      >
        {[...user.displayName][0]?.toUpperCase() ?? "?"}
      </div>
      {status && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-surface-1 ${
            status === "online" ? "bg-success" : "bg-fg-subtle"
          }`}
          style={{ width: size * 0.36, height: size * 0.36 }}
          aria-label={status === "online" ? "オンライン" : "オフライン"}
        />
      )}
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  active = false,
  disabled = false,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors disabled:opacity-40 ${
        danger
          ? "text-red-300 hover:bg-danger/20"
          : active
            ? "bg-accent/20 text-accent"
            : "text-fg-muted hover:bg-surface-3 hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

export function Modal({
  title,
  onClose,
  children,
  width = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input,textarea,select,button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`w-full ${width} rounded-xl border border-border bg-surface-2 shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <IconButton label="閉じる" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

export const inputClass =
  "w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-accent";
export const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50";
