import { LIMITS } from "@nexus/shared";
import { useState, type FormEvent } from "react";
import { errorMessage } from "../../lib/api";
import { useChat } from "../../stores/chat";
import { Modal, Spinner, inputClass, primaryButtonClass } from "../common/ui";

/** サーバーを「新しく作る」か「招待コードで参加する」ダイアログ */
export function ServerDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"create" | "join">("create");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (tab === "create") await useChat.getState().createServer(value.trim());
      else await useChat.getState().joinServer(value.trim());
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="サーバーを追加" onClose={onClose}>
      <div className="flex gap-1 border-b border-border px-4 pt-3">
        {(["create", "join"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setValue("");
              setError(null);
            }}
            className={`-mb-px border-b-2 px-3 pb-2 text-sm ${
              tab === t ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {t === "create" ? "新しく作る" : "招待コードで参加"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3 p-4">
        <input
          className={inputClass}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={tab === "create" ? "サーバー名（例: ゲーム仲間）" : "招待コード（例: aB3dEfGh2k）"}
          maxLength={tab === "create" ? LIMITS.serverNameMax : 32}
          required
        />
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <div className="flex justify-end">
          <button className={primaryButtonClass} disabled={busy || !value.trim()}>
            {busy && <Spinner />}
            {tab === "create" ? "作成" : "参加"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
