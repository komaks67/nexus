import { MessageSquareReply, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { useChat } from "../../stores/chat";
import { useLayout, type PaneId } from "../../stores/layout";
import { ErrorBanner, IconButton, Spinner } from "../common/ui";
import { PaneHeader } from "../layout/PaneHeader";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";

export function ThreadView({ paneId, channelId, rootId }: { paneId: PaneId; channelId: string; rootId: string }) {
  const thread = useChat((s) => s.threads[rootId]);
  const channel = useChat((s) => s.findChannel(channelId));
  const highlight = useLayout((s) => (s.highlight?.channelId === channelId ? s.highlight.messageId : null));

  useEffect(() => {
    void useChat.getState().loadThread(channelId, rootId);
  }, [channelId, rootId]);

  const openSummary = () =>
    useLayout.getState().open(paneId === "main" ? "side" : "main", {
      kind: "summary",
      channelId,
      threadId: rootId,
      afterMessageId: null,
      requestKey: Date.now(),
    });

  const items = thread?.root ? [thread.root, ...thread.replies] : [];

  return (
    <>
      <PaneHeader
        paneId={paneId}
        icon={<MessageSquareReply className="size-5" />}
        title="スレッド"
        subtitle={channel ? `#${channel.name}` : null}
        actions={
          <IconButton label="スレッドをAI要約" onClick={openSummary}>
            <Sparkles className="size-4" />
          </IconButton>
        }
      />
      {thread?.error && <ErrorBanner message={thread.error} onRetry={() => void useChat.getState().loadThread(channelId, rootId)} />}
      {thread?.loading && !thread.root ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-6" />
        </div>
      ) : (
        <MessageList items={items} highlightId={highlight} />
      )}
      {thread?.root && <Composer channelId={channelId} parentId={rootId} placeholder="スレッドに返信" />}
    </>
  );
}
