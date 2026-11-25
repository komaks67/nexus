import { LIMITS } from "@nexus/shared";
import { useState, type FormEvent } from "react";
import { useAuth } from "../stores/auth";
import { Spinner, inputClass, primaryButtonClass } from "./common/ui";

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const { login, register, submitting, error } = useAuth();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "login") void login({ username, password });
    else void register({ username, displayName: displayName || username, password });
  };

  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-surface-0 via-surface-1 to-indigo-950/40 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface-2 p-8 shadow-2xl">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Nexus</h1>
          <p className="mt-1 text-sm text-fg-muted">{mode === "login" ? "おかえりなさい" : "アカウントを作成"}</p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase text-fg-muted">ユーザー名</span>
          <input
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={mode === "register" ? LIMITS.usernameMin : 1}
            maxLength={LIMITS.usernameMax}
            pattern={mode === "register" ? "[a-zA-Z0-9_.\\-]+" : undefined}
            title="英数字と _ . - が使えます"
          />
        </label>

        {mode === "register" && (
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase text-fg-muted">表示名</span>
            <input
              className={inputClass}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={LIMITS.displayNameMax}
              placeholder={username || "みんなに表示される名前"}
            />
          </label>
        )}

        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase text-fg-muted">パスワード</span>
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "register" ? LIMITS.passwordMin : 1}
            maxLength={LIMITS.passwordMax}
          />
          {mode === "register" && <span className="text-xs text-fg-subtle">{LIMITS.passwordMin}文字以上</span>}
        </label>

        {error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className={`${primaryButtonClass} w-full`}>
          {submitting && <Spinner />}
          {mode === "login" ? "ログイン" : "登録してはじめる"}
        </button>

        <button
          type="button"
          className="w-full text-center text-sm text-fg-muted hover:text-fg"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            useAuth.setState({ error: null });
          }}
        >
          {mode === "login" ? "アカウントをお持ちでない方はこちら" : "ログインはこちら"}
        </button>
      </form>
    </div>
  );
}
