import { BookOpen, Hash, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useChat } from "../../stores/chat";
import { useLayout, type PaneId } from "../../stores/layout";
import { ErrorBanner, IconButton, Spinner } from "../common/ui";
import { PaneHeader } from "../layout/PaneHeader";
import { VoiceView } from "../voice/VoiceView";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { TypingIndicator } from "./TypingIndicator";

export function ChannelView({ paneId, channelId }: { paneId: PaneId; channelId: string }) {
  const channel = useChat((s) => s.findChannel(channelId));
  const state = useChat((s) => s.messages[channelId]);
  const highlight = useLayout((s) => (s.highlight?.channelId === channelId ? s.highlight.messageId : null));
  const searchingHighlight = useRef(false);

  // 開いた時点の既読位置を記録してから、履歴を読み込む
  useEffect(() => {
    if (!channel) return;
    useChat.getState().takeReadSnapshot(channelId);
    if (channel.type !== "VOICE") void useChat.getState().loadMessages(channelId);
  }, [channelId, channel?.type]);

  // 画面が見えている間は既読にする
  useEffect(() => {
    if (!channel || channel.type === "VOICE" || !state?.loaded) return;
    const mark = () => {
      if (document.visibilityState === "visible") useChat.getState().markRead(channelId);
    };
    mark();
    window.addEventListener("focus", mark);
    document.addEventListener("visibilitychange", mark);
    return () => {
      window.removeEventListener("focus", mark);
      document.removeEventListener("visibilitychange", mark);
    };
  }, [channelId, channel?.lastMessageId, state?.loaded]);

  // 検索結果から飛んできたメッセージが未読み込みなら、見つかるまで過去ログをさかのぼる（最大20ページ）
  useEffect(() => {
    if (!highlight || !state?.loaded || searchingHighlight.current) return;
    if (state.items.some((m) => m.id === highlight)) {
      const t = setTimeout(() => useLayout.getState().setHighlight(null), 2500);
      return () => clearTimeout(t);
    }
    searchingHighlight.current = true;
    void (async () => {
      for (let i = 0; i < 20; i++) {
        const cur = useChat.getState().messages[channelId];
        if (!cur?.hasMore || cur.items.some((m) => m.id === highlight)) break;
        if (!(await useChat.getState().loadOlder(channelId))) break;
      }
      searchingHighlight.current = false;
    })();
  }, [highlight, state?.loaded, state?.items, channelId]);

  const openThread = useCallback(
    (rootId: string) => {
      useLayout.getState().open(paneId === "main" ? "side" : "main", { kind: "thread", channelId, rootId });
    },
    [paneId, channelId],
  );

  const openSummary = () => {
    const snapshot = useChat.getState().readSnapshot[channelId] ?? null;
    useLayout.getState().open(paneId === "main" ? "side" : "main", {
      kind: "summary",
      channelId,
      threadId: null,
      afterMessageId: snapshot,
      requestKey: Date.now(),
    });
  };

  if (!channel) {
    return <div className="flex flex-1 items-center justify-center text-sm text-fg-muted">チャンネルが見つかりません</div>;
  }
  if (channel.type === "VOICE") return <VoiceView paneId={paneId} channel={channel} />;

  const isKnowledge = channel.type === "KNOWLEDGE";
  const Icon = isKnowledge ? BookOpen : Hash;

  return (
    <>
      <PaneHeader
        paneId={paneId}
        icon={<Icon className="size-5" />}
        title={channel.name}
        subtitle={channel.topic}
        actions={
          <IconButton label="AI要約（未読分を箇条書きで要約）" onClick={openSummary}>
            <Sparkles className="size-4" />
          </IconButton>
        }
      />
      {state?.error && <ErrorBanner message={state.error} onRetry={() => void useChat.getState().loadMessages(channelId, true)} />}
      {!state?.loaded && state?.loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-6" />
        </div>
      ) : (
        <MessageList
          items={state?.items ?? []}
          hasMore={state?.hasMore}
          loadingOlder={state?.loadingOlder}
          onLoadOlder={() => useChat.getState().loadOlder(channelId)}
          onOpenThread={openThread}
          highlightId={highlight}
          header={
            <div className="px-4 pb-4 pt-8">
              <div className="mb-2 flex size-14 items-center justify-center rounded-full bg-surface-3">
                <Icon className="size-7" />
              </div>
              <h3 className="text-2xl font-bold">#{channel.name} へようこそ</h3>
              <p className="text-sm text-fg-muted">
                {isKnowledge
                  ? "ここはナレッジチャンネルです。手順・ルール・決定事項など、後から見返したい情報を残しましょう。"
                  : "ここがチャンネルの始まりです。"}
              </p>
            </div>
          }
        />
      )}
      <TypingIndicator channelId={channelId} />
      <Composer
        channelId={channelId}
        placeholder={isKnowledge ? `#${channel.name} にナレッジを追加` : `#${channel.name} へメッセージを送信`}
      />
    </>
  );
}
