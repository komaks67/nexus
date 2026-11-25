import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { ClientMessage } from "../../stores/chat";
import { Spinner } from "../common/ui";
import { MessageItem } from "./MessageItem";

interface Props {
  items: ClientMessage[];
  hasMore?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => Promise<boolean> | void;
  onOpenThread?: (rootId: string) => void;
  highlightId?: string | null;
  header?: ReactNode;
  empty?: ReactNode;
}

const COMPACT_WINDOW_MS = 5 * 60 * 1000;

/**
 * メッセージ一覧。
 * - 一番下を見ている時だけ新着で自動スクロール（過去ログを読んでいる時は動かさない）
 * - 上端までスクロールしたら古いメッセージを自動で読み込み、表示位置を保つ
 */
export function MessageList({ items, hasMore, loadingOlder, onLoadOlder, onOpenThread, highlightId, header, empty }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevHeight = useRef<number | null>(null);
  const firstId = items[0]?.id;
  const lastId = items[items.length - 1]?.id;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      // 古いメッセージを上に足したので、その分だけ下にずらして見た目の位置を保つ
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [firstId, lastId, items.length]);

  // 画像の読み込み等で高さが変わっても、下に張り付いていれば追従する
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });
    const inner = el.firstElementChild;
    if (inner) ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!highlightId) return;
    const target = document.getElementById(`msg-${highlightId}`);
    if (target) {
      stickToBottom.current = false;
      target.scrollIntoView({ block: "center" });
    }
  }, [highlightId, items.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 120 && hasMore && !loadingOlder && onLoadOlder) {
      prevHeight.current = el.scrollHeight;
      void Promise.resolve(onLoadOlder()).then((added) => {
        if (added === false) prevHeight.current = null;
      });
    }
  };

  return (
    <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto" role="log" aria-live="polite">
      <div className="flex min-h-full flex-col justify-end pb-3">
        {loadingOlder && (
          <div className="flex justify-center py-3">
            <Spinner />
          </div>
        )}
        {!hasMore && header}
        {items.length === 0 && empty}
        {items.map((m, i) => {
          const prev = items[i - 1];
          const compact =
            !!prev &&
            prev.author.id === m.author.id &&
            new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < COMPACT_WINDOW_MS;
          return (
            <MessageItem
              key={m.nonce && m.localStatus ? `local:${m.nonce}` : m.id}
              message={m}
              compact={compact}
              highlighted={highlightId === m.id}
              onOpenThread={onOpenThread}
            />
          );
        })}
      </div>
    </div>
  );
}
