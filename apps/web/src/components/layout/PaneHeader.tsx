import { ArrowLeftRight, Columns2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useLayout, type PaneId } from "../../stores/layout";
import { IconButton } from "../common/ui";

/** 各パネル上部の見出しと、2画面表示の操作ボタン */
export function PaneHeader({
  paneId,
  icon,
  title,
  subtitle,
  actions,
}: {
  paneId: PaneId;
  icon: ReactNode;
  title: string;
  subtitle?: string | null;
  actions?: ReactNode;
}) {
  const side = useLayout((s) => s.side);
  const main = useLayout((s) => s.main);
  const open = useLayout((s) => s.open);
  const swap = useLayout((s) => s.swap);
  const closeSide = useLayout((s) => s.closeSide);
  const content = paneId === "main" ? main : side;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
      <span className="text-fg-muted">{icon}</span>
      <h2 className="truncate font-semibold">{title}</h2>
      {subtitle && <span className="hidden truncate border-l border-border pl-2 text-sm text-fg-muted md:inline">{subtitle}</span>}
      <div className="ml-auto flex items-center gap-0.5">
        {actions}
        {paneId === "main" && !side && content && (
          <IconButton label="サブパネルに複製（2画面表示）" onClick={() => open("side", content)}>
            <Columns2 className="size-4" />
          </IconButton>
        )}
        {side && (
          <IconButton label="左右を入れ替え" onClick={swap}>
            <ArrowLeftRight className="size-4" />
          </IconButton>
        )}
        {paneId === "side" && (
          <IconButton label="サブパネルを閉じる" onClick={closeSide}>
            <X className="size-4" />
          </IconButton>
        )}
      </div>
    </header>
  );
}
