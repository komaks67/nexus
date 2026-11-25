import type { TranslateResponse } from "@nexus/shared";
import { AlertCircle, Copy, Languages, MessageSquareReply, RotateCcw } from "lucide-react";
import { memo, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { formatTime, guessTranslateTarget } from "../../lib/format";
import { useAuth } from "../../stores/auth";
import { useChat, type ClientMessage } from "../../stores/chat";
import { Avatar, Spinner } from "../common/ui";
import { AttachmentView } from "./AttachmentView";
import { MessageContent } from "./MessageContent";

interface Props {
  message: ClientMessage;
  /** 直前と同じ人の連続投稿なら名前とアイコンを省略 */
  compact: boolean;
  highlighted: boolean;
  onOpenThread?: (rootId: string) => void;
}

type TranslationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; text: string; target: "ja" | "en"; showing: boolean }
  | { status: "error"; error: string };

export const MessageItem = memo(function MessageItem({ message: m, compact, highlighted, onOpenThread }: Props) {
  const me = useAuth((s) => s.user);
  const [tr, setTr] = useState<TranslationState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const mentionsMe = !!me && new RegExp(`@(${me.username}|everyone)\\b`, "i").test(m.content);

  const translate = async () => {
    if (tr.status === "done") {
      setTr({ ...tr, showing: !tr.showing });
      return;
    }
    if (tr.status === "loading") return;
    setTr({ status: "loading" });
    try {
      const res = await api<TranslateResponse>("/api/ai/translate", {
        method: "POST",
        body: { messageId: m.id, target: guessTranslateTarget(m.content) },
      });
      setTr({ status: "done", text: res.text, target: res.target, showing: true });
    } catch (err) {
      setTr({ status: "error", error: errorMessage(err) });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // クリップボードが使えない環境では何もしない
    }
  };

  const isLocal = !!m.localStatus;

  return (
    <article
      id={`msg-${m.id}`}
      className={`group relative flex gap-3 px-4 ${compact ? "py-0.5" : "mt-3 py-1"} hover:bg-surface-1/60 ${
        highlighted ? "flash" : ""
      } ${mentionsMe ? "border-l-2 border-warning bg-warning/5" : ""} ${m.localStatus === "sending" ? "opacity-60" : ""}`}
    >
      <div className="w-9 shrink-0">
        {!compact ? (
          <Avatar user={m.author} />
        ) : (
          <time className="hidden pt-1 text-[10px] text-fg-subtle group-hover:block">
            {new Date(m.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
          </time>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex items-baseline gap-2">
            <span className="font-semibold">{m.author.displayName}</span>
            <time className="text-xs text-fg-subtle" dateTime={m.createdAt}>
              {formatTime(m.createdAt)}
            </time>
          </div>
        )}

        <MessageContent text={m.content} />
        {m.attachments.map((a) => (
          <AttachmentView key={a.id} attachment={a} />
        ))}

        {tr.status === "done" && tr.showing && (
          <div className="mt-1 rounded-md border-l-2 border-accent bg-accent/5 px-2 py-1">
            <div className="mb-0.5 flex items-center gap-1 text-[11px] text-accent">
              <Languages className="size-3" /> AI翻訳（{tr.target === "ja" ? "日本語" : "English"}）
            </div>
            <MessageContent text={tr.text} />
          </div>
        )}
        {tr.status === "error" && (
          <div className="mt-1 text-xs text-red-300">
            翻訳できませんでした: {tr.error}
          </div>
        )}

        {m.localStatus === "failed" && (
          <div className="mt-1 flex items-center gap-2 text-xs text-red-300">
            <AlertCircle className="size-3.5" />
            送信に失敗しました{m.localError ? `（${m.localError}）` : ""}
            <button
              onClick={() => void useChat.getState().retrySend(m.channelId, m.id, m.parentId)}
              className="flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-fg hover:bg-surface-4"
            >
              <RotateCcw className="size-3" /> 再送信
            </button>
          </div>
        )}

        {onOpenThread && !m.parentId && m.replyCount > 0 && (
          <button
            onClick={() => onOpenThread(m.id)}
            className="mt-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-medium text-accent hover:bg-accent/10"
          >
            <MessageSquareReply className="size-3.5" />
            {m.replyCount}件の返信
            {m.lastReplyAt && <span className="font-normal text-fg-subtle">・最終 {formatTime(m.lastReplyAt)}</span>}
          </button>
        )}
      </div>

      {/* ホバーメニュー */}
      {!isLocal && (
        <div className="absolute -top-3 right-4 hidden items-center rounded-md border border-border bg-surface-2 shadow-lg group-hover:flex">
          {onOpenThread && !m.parentId && (
            <button onClick={() => onOpenThread(m.id)} title="スレッドで返信" aria-label="スレッドで返信" className="p-1.5 text-fg-muted hover:bg-surface-3 hover:text-fg">
              <MessageSquareReply className="size-4" />
            </button>
          )}
          {m.content.trim() && (
            <button
              onClick={() => void translate()}
              title={tr.status === "done" && tr.showing ? "翻訳を隠す" : "翻訳（日本語⇔英語）"}
              aria-label="翻訳"
              className={`p-1.5 hover:bg-surface-3 ${tr.status === "done" && tr.showing ? "text-accent" : "text-fg-muted hover:text-fg"}`}
            >
              {tr.status === "loading" ? <Spinner /> : <Languages className="size-4" />}
            </button>
          )}
          {m.content.trim() && (
            <button onClick={() => void copy()} title={copied ? "コピーしました" : "本文をコピー"} aria-label="本文をコピー" className="p-1.5 text-fg-muted hover:bg-surface-3 hover:text-fg">
              <Copy className="size-4" />
            </button>
          )}
        </div>
      )}
    </article>
  );
});
