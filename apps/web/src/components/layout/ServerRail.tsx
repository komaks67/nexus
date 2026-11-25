import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { useChat } from "../../stores/chat";
import { ServerDialog } from "../dialogs/ServerDialog";

/** 画面左端のサーバー一覧 */
export function ServerRail({ onOpenSearch }: { onOpenSearch: () => void }) {
  const servers = useChat((s) => s.servers);
  const activeServerId = useChat((s) => s.activeServerId);
  const selectServer = useChat((s) => s.selectServer);
  const [dialog, setDialog] = useState(false);

  return (
    <nav aria-label="サーバー一覧" className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-surface-0 py-3">
      <button
        onClick={onOpenSearch}
        title="検索 (Ctrl/⌘ + K)"
        aria-label="検索"
        className="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-fg-muted transition-all hover:rounded-xl hover:bg-accent hover:text-white"
      >
        <Search className="size-5" />
      </button>
      <div className="h-px w-8 bg-border" />
      {servers.map((s) => {
        const active = s.id === activeServerId;
        return (
          <div key={s.id} className="relative flex w-full justify-center">
            <span
              className={`absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r bg-fg transition-all ${
                active ? "h-10" : "h-0"
              }`}
            />
            <button
              onClick={() => void selectServer(s.id)}
              title={s.name}
              aria-label={s.name}
              aria-current={active}
              className={`flex size-12 items-center justify-center text-sm font-semibold transition-all ${
                active ? "rounded-xl bg-accent text-white" : "rounded-2xl bg-surface-2 hover:rounded-xl hover:bg-accent/80"
              }`}
            >
              {[...s.name].slice(0, 2).join("")}
            </button>
          </div>
        );
      })}
      <button
        onClick={() => setDialog(true)}
        title="サーバーを追加"
        aria-label="サーバーを追加"
        className="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-success transition-all hover:rounded-xl hover:bg-success hover:text-white"
      >
        <Plus className="size-6" />
      </button>
      {dialog && <ServerDialog onClose={() => setDialog(false)} />}
    </nav>
  );
}
