import { MessagesSquare } from "lucide-react";
import { useCallback, useRef, type PointerEvent } from "react";
import { useLayout, type PaneContent, type PaneId } from "../../stores/layout";
import { AiSummaryView } from "../ai/AiSummaryView";
import { ChannelView } from "../chat/ChannelView";
import { ThreadView } from "../chat/ThreadView";

function PaneBody({ paneId, content }: { paneId: PaneId; content: PaneContent | null }) {
  if (!content) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-fg-muted">
        <MessagesSquare className="size-12 opacity-40" />
        <p className="text-sm">左のチャンネルを選んでください</p>
        <p className="text-xs text-fg-subtle">チャンネル横の ▥ ボタンで右側にも並べて表示できます</p>
      </div>
    );
  }
  switch (content.kind) {
    case "channel":
      return <ChannelView key={`${paneId}:${content.channelId}`} paneId={paneId} channelId={content.channelId} />;
    case "thread":
      return (
        <ThreadView key={`${paneId}:${content.rootId}`} paneId={paneId} channelId={content.channelId} rootId={content.rootId} />
      );
    case "summary":
      return <AiSummaryView key={`${paneId}:${content.requestKey}`} paneId={paneId} request={content} />;
  }
}

/**
 * スプリットビュー本体。
 * メインとサブを左右に並べ、間のつまみをドラッグして幅を変えられる。
 */
export function SplitView() {
  const main = useLayout((s) => s.main);
  const side = useLayout((s) => s.side);
  const focused = useLayout((s) => s.focused);
  const sideWidth = useLayout((s) => s.sideWidth);
  const focus = useLayout((s) => s.focus);
  const setSideWidth = useLayout((s) => s.setSideWidth);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDragStart = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      const onMove = (ev: globalThis.PointerEvent) => {
        setSideWidth(((rect.right - ev.clientX) / rect.width) * 100);
      };
      const onUp = () => {
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
      };
      document.body.style.cursor = "col-resize";
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
    },
    [setSideWidth],
  );

  return (
    <div ref={containerRef} className="flex min-w-0 flex-1 bg-surface-2">
      <section
        aria-label="メイン"
        onMouseDown={() => focus("main")}
        className={`flex min-w-0 flex-1 flex-col ${side && focused === "main" ? "ring-1 ring-inset ring-accent/30" : ""}`}
      >
        <PaneBody paneId="main" content={main} />
      </section>
      {side && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="パネルの幅を変更"
            onPointerDown={onDragStart}
            onDoubleClick={() => setSideWidth(40)}
            className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-accent"
          />
          <section
            aria-label="サブパネル"
            onMouseDown={() => focus("side")}
            style={{ width: `${sideWidth}%` }}
            className={`flex min-w-[280px] shrink-0 flex-col ${focused === "side" ? "ring-1 ring-inset ring-accent/30" : ""}`}
          >
            <PaneBody paneId="side" content={side} />
          </section>
        </>
      )}
    </div>
  );
}
