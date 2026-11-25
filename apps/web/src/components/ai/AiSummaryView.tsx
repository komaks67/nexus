import { RefreshCw, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { errorMessage, rawRequest } from "../../lib/api";
import { useChat } from "../../stores/chat";
import { useLayout, type PaneContent, type PaneId } from "../../stores/layout";
import { MessageContent } from "../chat/MessageContent";
import { ErrorBanner, IconButton, Spinner } from "../common/ui";
import { PaneHeader } from "../layout/PaneHeader";

type SummaryRequest = Extract<PaneContent, { kind: "summary" }>;
type Status = "streaming" | "done" | "error" | "stopped";

/**
 * AI要約パネル。
 * サーバーから文字が少しずつ届く（ストリーミング）ので、届いた分からすぐ表示する。
 */
export function AiSummaryView({ paneId, request }: { paneId: PaneId; request: SummaryRequest }) {
  const channel = useChat((s) => s.findChannel(request.channelId));
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("streaming");
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setText("");
    setStatus("streaming");
    setError(null);

    void (async () => {
      try {
        const res = await rawRequest("/api/ai/summarize", {
          method: "POST",
          body: {
            channelId: request.channelId,
            threadId: request.threadId,
            afterMessageId: request.afterMessageId,
            limit: 200,
          },
          signal: controller.signal,
        });
        const n = res.headers.get("X-Message-Count");
        setCount(n ? Number(n) : null);
        if (!res.body) throw new Error("応答が空でした");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setText((t) => t + chunk);
        }
        setStatus("done");
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStatus("stopped");
          return;
        }
        setError(errorMessage(err));
        setStatus("error");
      }
    })();

    // パネルを閉じたら通信も止める（AI の無駄な利用を防ぐ）
    return () => controller.abort();
  }, [request]);

  const regenerate = (afterMessageId: string | null) =>
    useLayout.getState().open(paneId, { ...request, afterMessageId, requestKey: Date.now() });

  const scope = request.threadId
    ? "スレッド全体"
    : request.afterMessageId
      ? "前回読んだ位置以降（未読）"
      : "直近のメッセージ（最大200件）";

  return (
    <>
      <PaneHeader
        paneId={paneId}
        icon={<Sparkles className="size-5 text-accent" />}
        title="AI要約"
        subtitle={channel ? `#${channel.name}` : null}
        actions={
          status === "streaming" ? (
            <IconButton label="生成を止める" onClick={() => controllerRef.current?.abort()}>
              <Square className="size-4" />
            </IconButton>
          ) : (
            <IconButton label="もう一度要約" onClick={() => regenerate(request.afterMessageId)}>
              <RefreshCw className="size-4" />
            </IconButton>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-xs text-fg-muted">
        <span>対象: {scope}</span>
        {count !== null && count > 0 && <span>・{count}件</span>}
        {!request.threadId && (
          <button
            onClick={() => regenerate(request.afterMessageId ? null : (useChat.getState().readSnapshot[request.channelId] ?? null))}
            className="ml-auto rounded bg-surface-3 px-2 py-0.5 hover:bg-surface-4 hover:text-fg"
          >
            {request.afterMessageId ? "直近200件で要約" : "未読分だけで要約"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {error && <ErrorBanner message={error} onRetry={() => regenerate(request.afterMessageId)} />}
        {status === "streaming" && !text && (
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <Spinner /> 会話を読んで要約しています…
          </div>
        )}
        {text && <MessageContent text={text} />}
        {status === "streaming" && text && <span className="inline-block h-4 w-1.5 animate-pulse bg-accent align-middle" />}
        {status === "stopped" && <p className="mt-2 text-xs text-fg-subtle">生成を停止しました</p>}
        {status === "done" && (
          <p className="mt-4 border-t border-border pt-2 text-[11px] text-fg-subtle">
            AIが生成した要約です。重要な内容は元のメッセージも確認してください。
          </p>
        )}
      </div>
    </>
  );
}
